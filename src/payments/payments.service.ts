// payments/payments.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
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

  // One-time payment
  async initiatePayment(userId: number, userEmail: string, planId: number) {
    const plan = await this.plansService.getPlanById(planId);

    const session = await this.stripeService.createCheckoutSession({
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      userId,
      userEmail,
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

  // Subscription
  async initiateSubscription(
    userId: number,
    userEmail: string,
    planId: number,
  ) {
    const plan = await this.plansService.getPlanById(planId);

    // Plan must have stripePriceId (created when plan was added)
    if (!plan.stripePriceId) {
      throw new NotFoundException('Plan is not configured for subscription');
    }

    const session = await this.stripeService.createSubscriptionSession({
      planId: plan.id,
      planName: plan.name,
      stripePriceId: plan.stripePriceId, // ← use existing Stripe price
      userId,
      userEmail,
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

    return { subscribeUrl: session.url }; // ← subscribeUrl
  }

  // Cancel subscription
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

  // payments/payments.service.ts

  async handleWebhook(payload: Buffer, signature: string) {
    const event = await this.stripeService.constructWebhookEvent(payload, signature);

    // ─── Checkout completed ───────────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = parseInt(session.metadata.userId);
      const planId = parseInt(session.metadata.planId);

      // 1. Save stripeCustomerId on user
      if (session.customer) {
        await this.usersService.updateStripeCustomerId(
          userId,
          session.customer,
        );
      }
      await this.usersService.updateSubscriptionStatus(userId, planId);

      // 2. Update payment row
      let currentPeriodStart: Date | undefined;
      let currentPeriodEnd: Date | undefined;

      if (session.subscription) {
        const sub = await this.stripeService.getSubscription(
          session.subscription,
        );
        currentPeriodStart = new Date(sub.current_period_start * 1000);
        currentPeriodEnd = new Date(sub.current_period_end * 1000);

        // 3. Create UserSubscription row
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

      // Save invoice for one-time payment
      if (!session.subscription && session.payment_intent) {
        const payment = await this.paymentRepo.findOne({
          where: { stripeSessionId: session.id },
        });
        await this.invoiceRepo.save(
          this.invoiceRepo.create({
            paymentId: payment?.id ?? null,
            userId,
            planId,
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
    }

    // ─── Invoice paid (renewal or first payment) ──────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;

      const payment = await this.paymentRepo.findOne({
        where: { stripeSubscriptionId: invoice.subscription },
      });

      if (payment) {
        // Update payment row
        await this.paymentRepo.update(
          { stripeSubscriptionId: invoice.subscription },
          {
            status: PaymentStatus.SUCCESS,
            currentPeriodEnd: new Date(invoice.period_end * 1000),
          },
        );

        // Update UserSubscription period
        await this.subscriptionRepo.update(
          { stripeSubscriptionId: invoice.subscription },
          {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(invoice.period_start * 1000),
            currentPeriodEnd: new Date(invoice.period_end * 1000),
          },
        );

        // Save Invoice row
        await this.invoiceRepo.save(
          this.invoiceRepo.create({
            paymentId: payment.id,
            userId: payment.userId,
            planId: payment.planId,
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: invoice.subscription,
            stripeCustomerId: invoice.customer,
            status: InvoiceStatus.PAID,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            invoiceUrl: invoice.hosted_invoice_url,
            invoicePdf: invoice.invoice_pdf,
            paidAt: new Date(invoice.status_transitions?.paid_at * 1000),
          }),
        );
      }
    }

    // ─── Invoice failed ───────────────────────────────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;

      const payment = await this.paymentRepo.findOne({
        where: { stripeSubscriptionId: invoice.subscription },
      });

      await this.paymentRepo.update(
        { stripeSubscriptionId: invoice.subscription },
        { status: PaymentStatus.FAILED },
      );

      await this.subscriptionRepo.update(
        { stripeSubscriptionId: invoice.subscription },
        { status: SubscriptionStatus.PAST_DUE },
      );

      // Save failed invoice too
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
    }

    // ─── Subscription cancelled ───────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;

      await this.paymentRepo.update(
        { stripeSubscriptionId: subscription.id },
        { status: PaymentStatus.CANCELLED },
      );

      await this.subscriptionRepo.update(
        { stripeSubscriptionId: subscription.id },
        {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      );
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

    const data = await Promise.all(
      payments.map(async (payment) => {
        const invoice = await this.invoiceRepo.findOne({
          where: { paymentId: payment.id },
        });

        return {
          ...payment,
          invoiceUrl: invoice?.invoiceUrl ?? null,
          invoicePdf: invoice?.invoicePdf ?? null,
          paidAt: invoice?.paidAt ?? null,
        };
      }),
    );

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  async getActiveSubscription(userId: number) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (!subscription)
      throw new NotFoundException('No active subscription found');
    return subscription;
  }

  async getUserSubscriptions(userId: number) {
    return this.subscriptionRepo.find({
      where: { userId },
    });
  }

  async getUserInvoices(userId: number) {
    return this.invoiceRepo.find({
      where: { userId },
    });
  }
}
