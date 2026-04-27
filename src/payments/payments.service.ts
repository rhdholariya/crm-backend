// payments/payments.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentType } from './entities/payment.entity';
import { StripeService } from '../stripe/stripe.service';
import { PlansService } from '../plans/plans.service';
import {
  SubscriptionStatus,
  UserSubscription,
} from './entities/user-subscription.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(UserSubscription)
    private subscriptionRepo: Repository<UserSubscription>,
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    private stripeService: StripeService,
    private plansService: PlansService,
    private usersService: UsersService,
  ) {}

  // ─── Safe parseInt — returns null instead of NaN ──────────────────────────
  private safeInt(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = parseInt(String(val), 10);
    return isNaN(n) ? null : n;
  }

  // ─── Extract metadata from invoice — handles old and new Stripe API shape ──
  // Old shape (before ~2024): invoice.subscription_details.metadata
  // New shape (2025 API):     invoice.parent.subscription_details.metadata
  // Also available on line items: invoice.lines.data[0].metadata
  private extractInvoiceMetadata(invoice: any): {
    userId: number | null;
    planId: number | null;
  } {
    const sources = [
      invoice?.parent?.subscription_details?.metadata, // ✅ NEW API shape
      invoice?.subscription_details?.metadata, // old shape (kept for safety)
      invoice?.lines?.data?.[0]?.metadata, // line item metadata fallback
    ];

    for (const meta of sources) {
      const userId = this.safeInt(meta?.userId);
      const planId = this.safeInt(meta?.planId);
      if (userId && planId) {
        return { userId, planId };
      }
    }

    return { userId: null, planId: null };
  }

  // ─── Helper: resolve payment row with all fallbacks ───────────────────────
  // FIX: Restructured so the subscriptionId stamp always runs for steps 2-3,
  //      and step 4 (create) returns immediately after saving — no dead code.
  private async resolvePaymentRow(params: {
    stripeSubscriptionId: string;
    stripeCustomerId?: string | null;
    resolvedUserId?: number | null;
    resolvedPlanId?: number | null;
  }): Promise<Payment | null> {
    const {
      stripeSubscriptionId,
      stripeCustomerId,
      resolvedUserId,
      resolvedPlanId,
    } = params;

    // 1. Direct match by subscriptionId — already stamped, nothing more to do
    let payment = await this.paymentRepo.findOne({
      where: { stripeSubscriptionId },
    });
    if (payment) {
      return payment;
    }

    if (stripeCustomerId && resolvedUserId) {
      payment = await this.paymentRepo.findOne({
        where: {
          stripeCustomerId,
          type: PaymentType.SUBSCRIPTION,
          userId: resolvedUserId,
        },
        order: { id: 'DESC' },
      });
    }

    // 3. Fallback: customer only
    if (!payment && stripeCustomerId) {
      payment = await this.paymentRepo.findOne({
        where: { stripeCustomerId, type: PaymentType.SUBSCRIPTION },
        order: { id: 'DESC' },
      });
    }

    // ✅ FIX: Stamp subscriptionId onto rows found in steps 2 or 3 so future
    //    lookups always hit step 1 directly. Previously this block was placed
    //    AFTER the step-4 return, making it unreachable for newly-created rows
    //    and also accidentally reachable after step-4 early return was removed.
    if (payment) {
      await this.paymentRepo.update(payment.id, { stripeSubscriptionId });
      payment.stripeSubscriptionId = stripeSubscriptionId;
      return payment;
    }

    // 4. Last resort: create a new payment row so renewal is never lost
    if (resolvedUserId && resolvedPlanId) {
      console.warn(
        `[resolvePaymentRow] ⚠️ No existing row — creating new payment row. subscriptionId=${stripeSubscriptionId}`,
      );
      payment = await this.paymentRepo.save(
        this.paymentRepo.create({
          userId: resolvedUserId,
          planId: resolvedPlanId,
          stripeSubscriptionId,
          stripeCustomerId: stripeCustomerId ?? undefined,
          amount: 0,
          type: PaymentType.SUBSCRIPTION,
          status: PaymentStatus.SUCCESS,
        }),
      );

      return payment;
    }

    console.error(
      `[resolvePaymentRow] ❌ NOT FOUND AND COULD NOT CREATE — subscriptionId=${stripeSubscriptionId}, customerId=${stripeCustomerId}, userId=${resolvedUserId}, planId=${resolvedPlanId}`,
    );
    return null;
  }

  // ─── One-time payment ─────────────────────────────────────────────────────
  async initiatePayment(userId: number, userEmail: string, planId: number) {
    const plan = await this.plansService.getPlanById(planId);
    const user = await this.usersService.findOne(userId);

    const session = await this.stripeService.createCheckoutSession({
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      userId,
      userEmail,
      stripeCustomerId: user?.stripeCustomerId ?? null,
    });

    await this.paymentRepo.save(
      this.paymentRepo.create({
        userId,
        planId,
        stripeSessionId: session.id,
        amount: plan.price,
        type: PaymentType.ONE_TIME,
        status: PaymentStatus.PENDING,
      }),
    );

    return { checkoutUrl: session.url };
  }

  // ─── Subscription ─────────────────────────────────────────────────────────
  async initiateSubscription(
    userId: number,
    userEmail: string,
    planId: number,
  ) {
    const plan = await this.plansService.getPlanById(planId);

    if (!plan.stripePriceId) {
      throw new NotFoundException('Plan is not configured for subscription');
    }

    const user = await this.usersService.findOne(userId);

    const existingActivePayment = await this.paymentRepo.findOne({
      where: {
        userId,
        type: PaymentType.SUBSCRIPTION,
        status: PaymentStatus.SUCCESS,
      },
    });

    if (existingActivePayment?.stripeSubscriptionId) {
      try {
        await this.stripeService.cancelSubscription(
          existingActivePayment.stripeSubscriptionId,
        );
        await this.paymentRepo.update(existingActivePayment.id, {
          status: PaymentStatus.CANCELLED,
        });
        await this.subscriptionRepo.update(
          { stripeSubscriptionId: existingActivePayment.stripeSubscriptionId },
          { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
        );
      } catch (err) {
        console.warn(
          `initiateSubscription: could not cancel existing subscription ${existingActivePayment.stripeSubscriptionId}`,
          err,
        );
      }
    }

    const session = await this.stripeService.createSubscriptionSession({
      planId: plan.id,
      planName: plan.name,
      stripePriceId: plan.stripePriceId,
      userId,
      userEmail,
      stripeCustomerId: user?.stripeCustomerId ?? null,
    });

    await this.paymentRepo.save(
      this.paymentRepo.create({
        userId,
        planId,
        stripeSessionId: session.id,
        amount: plan.price,
        type: PaymentType.SUBSCRIPTION,
        status: PaymentStatus.PENDING,
      }),
    );

    return { subscribeUrl: session.url };
  }

  // ─── Cancel subscription ──────────────────────────────────────────────────
  async cancelSubscription(userId: number) {
    const payment = await this.paymentRepo.findOne({
      where: {
        userId,
        type: PaymentType.SUBSCRIPTION,
        status: PaymentStatus.SUCCESS,
      },
    });

    if (!payment?.stripeSubscriptionId) {
      throw new NotFoundException('No active subscription found');
    }

    await this.stripeService.cancelSubscription(payment.stripeSubscriptionId);
    await this.paymentRepo.update(payment.id, {
      status: PaymentStatus.CANCELLED,
    });

    return { message: 'Subscription cancelled successfully' };
  }

  // ─── Webhook handler ──────────────────────────────────────────────────────
  async handleWebhook(payload: Buffer, signature: string) {
    const event = await this.stripeService.constructWebhookEvent(
      payload,
      signature,
    );

    // ─── Checkout completed ───────────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = this.safeInt(session.metadata?.userId);
      const planId = this.safeInt(session.metadata?.planId);

      if (!userId || !planId) {
        console.error(
          `[checkout.session.completed] ❌ Missing userId/planId in metadata`,
          session.metadata,
        );
        return { received: true };
      }

      if (session.customer) {
        await this.usersService.updateStripeCustomerId(
          userId,
          session.customer,
        );
      }
      await this.usersService.updateSubscriptionStatus(userId, planId);

      let currentPeriodStart: Date | undefined;
      let currentPeriodEnd: Date | undefined;

      if (session.subscription) {
        const sub = await this.stripeService.getSubscription(
          session.subscription,
        );
        currentPeriodStart = new Date(sub.current_period_start * 1000);
        currentPeriodEnd = new Date(sub.current_period_end * 1000);

        await this.subscriptionRepo.save(
          this.subscriptionRepo.create({
            userId,
            planId,
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart,
            currentPeriodEnd,
          }),
        );
      }

      const payment = await this.paymentRepo.findOne({
        where: { stripeSessionId: session.id },
      });

      await this.paymentRepo.update(
        { stripeSessionId: session.id },
        {
          status: PaymentStatus.SUCCESS,
          stripePaymentIntentId: session.payment_intent,
          stripeSubscriptionId: session.subscription,
          stripeCustomerId: session.customer,
          ...(currentPeriodEnd && { currentPeriodEnd }),
        },
      );

      if (!session.subscription && session.payment_intent) {
        if (!payment) {
          throw new Error(
            `Payment row not found for session ${session.id} — cannot save invoice`,
          );
        }
        await this.invoiceRepo.save(
          this.invoiceRepo.create({
            paymentId: payment.id,
            userId: payment.userId,
            planId: payment.planId,
            stripeInvoiceId: session.payment_intent,
            stripePaymentIntentId: session.payment_intent,
            stripeCustomerId: session.customer,
            status: InvoiceStatus.PAID,
            amount: session.amount_total / 100,
            currency: session.currency,
            invoiceUrl: null,
            invoicePdf: null,
            paidAt: new Date(),
          }),
        );
      }

      if (session.subscription && payment) {
        const stripeInvoice = await this.stripeService.getSubscriptionInvoice(
          session.subscription,
        );
        await this.invoiceRepo.save(
          this.invoiceRepo.create({
            paymentId: payment.id,
            userId: payment.userId,
            planId: payment.planId,
            stripeInvoiceId: stripeInvoice?.id ?? session.subscription,
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer,
            status: InvoiceStatus.PAID,
            amount: session.amount_total / 100,
            currency: session.currency,
            invoiceUrl: stripeInvoice?.hosted_invoice_url ?? null,
            invoicePdf: stripeInvoice?.invoice_pdf ?? null,
            paidAt: new Date(),
          }),
        );
      }
    }

    // ─── Invoice paid (renewal / autopay) ────────────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      try {
        const invoice = event.data.object as any;
        const subscriptionId: string | null =
          invoice.subscription ??
          invoice.parent?.subscription_details?.subscription ??
          null;

        if (!subscriptionId) {
          return { received: true };
        }

        if (invoice.billing_reason === 'subscription_create') {
          return { received: true };
        }

        let resolvedUserId: number | null = null;
        let resolvedPlanId: number | null = null;

        // 1a. Extract from invoice metadata (handles both old and new Stripe API shape)
        const fromMeta = this.extractInvoiceMetadata(invoice);
        if (fromMeta.userId && fromMeta.planId) {
          resolvedUserId = fromMeta.userId;
          resolvedPlanId = fromMeta.planId;
        } else {
        }

        // 1b. Fetch Stripe subscription metadata directly
        if ((!resolvedUserId || !resolvedPlanId) && subscriptionId) {
          try {
            const sub =
              await this.stripeService.getSubscription(subscriptionId);
            const userId = this.safeInt(sub?.metadata?.userId);
            const planId = this.safeInt(sub?.metadata?.planId);
            if (userId && planId) {
              resolvedUserId = userId;
              resolvedPlanId = planId;
            } else {
            }
          } catch (err) {
            console.error(
              `[invoice.payment_succeeded] 1b. ❌ Failed to fetch Stripe subscription:`,
              err,
            );
          }
        }

        // 1c. DB fallback via stripeCustomerId
        if ((!resolvedUserId || !resolvedPlanId) && invoice.customer) {
          const fallback = await this.paymentRepo.findOne({
            where: {
              stripeCustomerId: invoice.customer,
              type: PaymentType.SUBSCRIPTION,
            },
            order: { id: 'DESC' },
          });
          if (fallback) {
            resolvedUserId = fallback.userId;
            resolvedPlanId = fallback.planId;
          } else {
          }
        }

        if (!resolvedUserId || !resolvedPlanId) {
          return { received: true };
        }
        let payment: Payment | null = null;
        try {
          payment = await this.resolvePaymentRow({
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: invoice.customer,
            resolvedUserId,
            resolvedPlanId,
          });
        } catch (err) {
          console.error(`[invoice.payment_succeeded] ❌ STEP 2 THREW:`, err);
        }

        const newPeriodEnd =
          invoice.lines?.data?.[0]?.period?.end != null
            ? new Date(invoice.lines.data[0].period.end * 1000)
            : new Date(invoice.period_end * 1000);

        // renewalPayment is the NEW row for this cycle — used in step 6 for invoiceRow.paymentId
        let renewalPayment: Payment | null = null;

        try {
          if (payment) {
            // // 3a. Keep the original subscription payment row up-to-date
            // await this.paymentRepo.update(payment.id, {
            //   status: PaymentStatus.SUCCESS,
            //   stripeCustomerId: invoice.customer,
            //   stripeSubscriptionId: subscriptionId,
            //   currentPeriodEnd: newPeriodEnd,
            //   ...(payment.amount === 0 && {
            //     amount: invoice.amount_paid / 100,
            //   }),
            // });

            renewalPayment = await this.paymentRepo.save(
              this.paymentRepo.create({
                userId: resolvedUserId,
                planId: resolvedPlanId,
                stripeSubscriptionId: subscriptionId,
                stripeCustomerId: invoice.customer,
                amount: invoice.amount_paid / 100,
                type: PaymentType.SUBSCRIPTION,
                status: PaymentStatus.SUCCESS,
                currentPeriodEnd: newPeriodEnd,
              }),
            );
          } else {
            console.warn(
              `[invoice.payment_succeeded] STEP 3 ⚠️ payment is null — skipping`,
            );
          }
        } catch (err) {
          console.error(`[invoice.payment_succeeded] ❌ STEP 3 THREW:`, err);
        }

        try {
          const subUpdate = await this.subscriptionRepo.update(
            { stripeSubscriptionId: subscriptionId },
            {
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: new Date(invoice.period_start * 1000),
              currentPeriodEnd: newPeriodEnd,
            },
          );

          if (!subUpdate.affected) {
            const subFallback = await this.subscriptionRepo.update(
              { userId: resolvedUserId, status: SubscriptionStatus.ACTIVE },
              {
                stripeSubscriptionId: subscriptionId,
                stripeCustomerId: invoice.customer,
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart: new Date(invoice.period_start * 1000),
                currentPeriodEnd: newPeriodEnd,
              },
            );

            if (!subFallback.affected) {
              await this.subscriptionRepo.save(
                this.subscriptionRepo.create({
                  userId: resolvedUserId,
                  planId: resolvedPlanId,
                  stripeSubscriptionId: subscriptionId,
                  stripeCustomerId: invoice.customer,
                  status: SubscriptionStatus.ACTIVE,
                  currentPeriodStart: new Date(invoice.period_start * 1000),
                  currentPeriodEnd: newPeriodEnd,
                }),
              );
            }
          }
        } catch (err) {
          console.error(`[invoice.payment_succeeded] ❌ STEP 4 THREW:`, err);
        }

        try {
          await this.usersService.updateSubscriptionStatus(
            resolvedUserId,
            resolvedPlanId,
          );
        } catch (err) {
          console.error(`[invoice.payment_succeeded] ❌ STEP 5 THREW:`, err);
        }

        try {
          const existingInvoice = await this.invoiceRepo.findOne({
            where: { stripeInvoiceId: invoice.id },
          });

          if (existingInvoice) {
          } else {
            const savedInvoice = await this.invoiceRepo.save(
              this.invoiceRepo.create({
                paymentId: renewalPayment?.id ?? payment?.id ?? null,
                userId: resolvedUserId,
                planId: resolvedPlanId,
                stripeInvoiceId: invoice.id,
                stripeSubscriptionId: subscriptionId,
                stripeCustomerId: invoice.customer,
                status: InvoiceStatus.PAID,
                amount: invoice.amount_paid / 100,
                currency: invoice.currency,
                invoiceUrl: invoice.hosted_invoice_url ?? null,
                invoicePdf: invoice.invoice_pdf ?? null,
                paidAt: invoice.status_transitions?.paid_at
                  ? new Date(invoice.status_transitions.paid_at * 1000)
                  : new Date(),
              }),
            );
          }
        } catch (err) {
          console.error(`[invoice.payment_succeeded] ❌ STEP 6 THREW:`, err);
        }
      } catch (outerErr) {
        console.error(
          `[invoice.payment_succeeded] ❌ UNHANDLED ERROR:`,
          outerErr,
        );
      }
    }

    // ─── Invoice failed ───────────────────────────────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;

      try {
        const payment = await this.resolvePaymentRow({
          stripeSubscriptionId: invoice.subscription,
          stripeCustomerId: invoice.customer,
        });

        await this.paymentRepo.update(
          { stripeSubscriptionId: invoice.subscription },
          { status: PaymentStatus.FAILED },
        );

        await this.subscriptionRepo.update(
          { stripeSubscriptionId: invoice.subscription },
          { status: SubscriptionStatus.PAST_DUE },
        );

        if (payment) {
          await this.invoiceRepo.save(
            this.invoiceRepo.create({
              paymentId: payment.id,
              userId: payment.userId,
              planId: payment.planId,
              stripeInvoiceId: invoice.id,
              stripeSubscriptionId: invoice.subscription,
              stripeCustomerId: invoice.customer,
              status: InvoiceStatus.OPEN,
              amount: invoice.amount_due / 100,
              currency: invoice.currency,
              invoiceUrl: invoice.hosted_invoice_url ?? null,
              invoicePdf: invoice.invoice_pdf ?? null,
              paidAt: null,
            }),
          );
        }
      } catch (err) {
        console.error(`[invoice.payment_failed] ❌ ERROR:`, err);
      }
    }

    // ─── Subscription updated (plan change, cancel-at-period-end, reactivate) ─
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any;
      const subscriptionId: string = subscription.id;
      this.logger.log(
        `[subscription.updated] subscriptionId=${subscriptionId} status=${subscription.status} cancel_at_period_end=${subscription.cancel_at_period_end}`,
      );

      try {
        // Resolve userId/planId from subscription metadata
        let resolvedUserId = this.safeInt(subscription.metadata?.userId);
        let resolvedPlanId = this.safeInt(subscription.metadata?.planId);

        // Fallback: look up from DB via stripeSubscriptionId
        if (!resolvedUserId || !resolvedPlanId) {
          const existing = await this.paymentRepo.findOne({
            where: { stripeSubscriptionId: subscriptionId },
          });
          if (existing) {
            resolvedUserId = existing.userId;
            resolvedPlanId = existing.planId;
          }
        }

        const newStatus: SubscriptionStatus =
          subscription.status === 'active'
            ? SubscriptionStatus.ACTIVE
            : subscription.status === 'past_due'
              ? SubscriptionStatus.PAST_DUE
              : subscription.status === 'canceled'
                ? SubscriptionStatus.CANCELLED
                : SubscriptionStatus.EXPIRED;

        const currentPeriodStart = new Date(
          subscription.current_period_start * 1000,
        );
        const currentPeriodEnd = new Date(
          subscription.current_period_end * 1000,
        );
        const cancelledAt =
          subscription.status === 'canceled' ||
          subscription.cancel_at_period_end
            ? new Date()
            : undefined;

        // Update user_subscriptions
        await this.subscriptionRepo.update(
          { stripeSubscriptionId: subscriptionId },
          {
            status: newStatus,
            currentPeriodStart,
            currentPeriodEnd,
            ...(cancelledAt && { cancelledAt }),
          },
        );
        this.logger.log(
          `[subscription.updated] ✅ user_subscriptions updated → status=${newStatus}`,
        );

        // Update payments row
        await this.paymentRepo.update(
          { stripeSubscriptionId: subscriptionId },
          {
            status:
              newStatus === SubscriptionStatus.CANCELLED
                ? PaymentStatus.CANCELLED
                : newStatus === SubscriptionStatus.PAST_DUE
                  ? PaymentStatus.FAILED
                  : PaymentStatus.SUCCESS,
            currentPeriodEnd,
          },
        );
        this.logger.log(`[subscription.updated] ✅ payments updated`);

        // Sync user activePlanId — clear if cancelled/expired or cancel_at_period_end
        if (resolvedUserId) {
          if (
            newStatus === SubscriptionStatus.CANCELLED ||
            newStatus === SubscriptionStatus.EXPIRED ||
            subscription.cancel_at_period_end
          ) {
            await this.usersService.updateSubscriptionStatus(
              resolvedUserId,
              null,
            );
            this.logger.log(
              `[subscription.updated] ✅ users.activePlanId cleared → userId=${resolvedUserId}`,
            );
          } else if (resolvedPlanId) {
            await this.usersService.updateSubscriptionStatus(
              resolvedUserId,
              resolvedPlanId,
            );
            this.logger.log(
              `[subscription.updated] ✅ users.activePlanId set → userId=${resolvedUserId} planId=${resolvedPlanId}`,
            );
          }
        }
      } catch (err) {
        console.error(`[customer.subscription.updated] ❌ ERROR:`, err);
      }
    }

    // ─── Subscription cancelled ───────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      this.logger.log(
        `[subscription.deleted] subscriptionId=${subscription.id} customerId=${subscription.customer}`,
      );

      await this.paymentRepo.update(
        { stripeSubscriptionId: subscription.id },
        { status: PaymentStatus.CANCELLED },
      );
      this.logger.log(`[subscription.deleted] ✅ payments updated → CANCELLED`);

      await this.subscriptionRepo.update(
        { stripeSubscriptionId: subscription.id },
        { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
      );
      this.logger.log(
        `[subscription.deleted] ✅ user_subscriptions updated → CANCELLED`,
      );

      // Clear activePlanId on the user
      const userId = this.safeInt(subscription.metadata?.userId);
      if (userId) {
        await this.usersService.updateSubscriptionStatus(userId, null);
        this.logger.log(
          `[subscription.deleted] ✅ users.activePlanId cleared → userId=${userId}`,
        );
      } else {
        // fallback 1: resolve userId from payment row via subscriptionId
        let resolvedUserId: number | null = null;

        const payment = await this.paymentRepo.findOne({
          where: { stripeSubscriptionId: subscription.id },
          order: { id: 'DESC' },
        });
        if (payment) {
          resolvedUserId = payment.userId;
        }

        // fallback 2: resolve via stripeCustomerId on user table
        if (!resolvedUserId && subscription.customer) {
          const userByCustomer = await this.usersService.findByStripeCustomerId(
            subscription.customer,
          );
          if (userByCustomer) resolvedUserId = userByCustomer.id;
        }

        if (resolvedUserId) {
          await this.usersService.updateSubscriptionStatus(
            resolvedUserId,
            null,
          );
          this.logger.log(
            `[subscription.deleted] ✅ users.activePlanId cleared via fallback → userId=${resolvedUserId}`,
          );
        } else {
          this.logger.warn(
            `[subscription.deleted] ⚠️ Could not resolve userId — activePlanId not cleared`,
          );
        }
      }
    }

    // ─── Session expired ──────────────────────────────────────────────────
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as any;
      await this.paymentRepo.update(
        { stripeSessionId: session.id },
        { status: PaymentStatus.FAILED },
      );
    }

    return { received: true };
  }

  async getPaymentsByUser(userId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [payments, total] = await this.paymentRepo.findAndCount({
      where: { userId },
      order: { id: 'DESC' },
      skip,
      take: limit,
    });

    const invoices = await this.invoiceRepo.find({ where: { userId } });
    const invoiceByPaymentId = new Map(
      invoices
        .filter((inv) => inv.paymentId !== null)
        .map((inv) => [inv.paymentId, inv]),
    );

    const data = payments.map((payment) => {
      const invoice = invoiceByPaymentId.get(payment.id) ?? null;
      return {
        ...payment,
        invoiceId: invoice?.id ?? null,
        invoiceUrl: invoice?.invoiceUrl ?? null,
        invoicePdf: invoice?.invoicePdf ?? null,
        stripeInvoiceId: invoice?.stripeInvoiceId ?? null,
        paidAt: invoice?.paidAt ?? null,
      };
    });

    return { total, page, limit, totalPages: Math.ceil(total / limit), data };
  }

  async getActiveSubscription(userId: number) {
    const subscription = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .where('sub.userId = :userId', { userId })
      .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('sub.cancelledAt IS NULL')
      .getOne();

    if (!subscription) {
      return null;
    }
    return subscription;
  }

  async getUserSubscriptions(userId: number) {
    return this.subscriptionRepo.find({ where: { userId } });
  }

  // ─── Admin: all customer plans ────────────────────────────────────────────
  async getAllCustomerPlans(page = 1, limit = 10, search = '') {
    const skip = (page - 1) * limit;

    // Raw query to join subscriptions → users → plans in one shot
    const qb = this.subscriptionRepo
      .createQueryBuilder('sub')
      .innerJoin('users', 'u', 'u.id = sub.userId')
      .innerJoin('plans', 'p', 'p.id = sub.planId')
      .select([
        'sub.id            AS "subscriptionId"',
        'sub.status        AS "status"',
        'sub.currentPeriodStart AS "billingStart"',
        'sub.currentPeriodEnd   AS "billingEnd"',
        'sub.cancelledAt   AS "cancelledAt"',
        'u.id              AS "userId"',
        'u."firstName"     AS "firstName"',
        'u."lastName"      AS "lastName"',
        'u.email           AS "email"',
        'p.id              AS "planId"',
        'p.name            AS "planName"',
        'p.price           AS "planPrice"',
        'p.interval        AS "planInterval"',
      ])
      .orderBy('sub.id', 'DESC');

    if (search) {
      qb.where(
        `(u.email ILIKE :s OR u."firstName" ILIKE :s OR u."lastName" ILIKE :s OR p.name ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    const total = await qb.getCount();
    const rows = await qb.offset(skip).limit(limit).getRawMany();

    // ── Summary stats ──────────────────────────────────────────────────────
    const allSubs = await this.subscriptionRepo.find();
    const now = new Date();
    const totalPurchased = allSubs.length;
    const totalActive = allSubs.filter((s) => s.status === SubscriptionStatus.ACTIVE).length;
    const totalExpired = allSubs.filter((s) => s.status === SubscriptionStatus.EXPIRED).length;
    const expiringSoon = allSubs.filter((s) => {
      if (s.status !== SubscriptionStatus.ACTIVE || !s.currentPeriodEnd) return false;
      const daysLeft = (new Date(s.currentPeriodEnd).getTime() - now.getTime()) / 86400000;
      return daysLeft <= 7 && daysLeft >= 0;
    }).length;

    // Revenue from paid invoices
    const invoices = await this.invoiceRepo.find({ where: { status: InvoiceStatus.PAID } });
    const revenueGenerated = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

    const data = rows.map((r) => ({
      subscriptionId: r.subscriptionId,
      status: r.status,
      billingPeriod: { start: r.billingStart, end: r.billingEnd },
      cancelledAt: r.cancelledAt,
      subscribedOn: r.billingStart,
      customer: {
        id: r.userId,
        name: `${r.firstName} ${r.lastName}`,
        email: r.email,
      },
      plan: {
        id: r.planId,
        name: r.planName,
        price: r.planPrice,
        interval: r.planInterval,
      },
    }));

    return {
      summary: { totalPurchased, revenueGenerated, totalActive, totalExpired, expiringSoon },
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserInvoices(userId: number) {
    return this.invoiceRepo.find({ where: { userId } });
  }

  async getBillingPortalUrl(userId: number): Promise<{ url: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.stripeCustomerId) {
      throw new NotFoundException('No Stripe customer found for this user');
    }

    const returnUrl = `${process.env.FRONTEND_URL}/subscriptions`;
    const session = await this.stripeService.createBillingPortalSession(
      user.stripeCustomerId,
      returnUrl,
    );

    return { url: session.url };
  }
}
