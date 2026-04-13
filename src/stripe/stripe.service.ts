// stripe/stripe.service.ts
import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';

@Injectable()
export class StripeService {
  constructor(
    private readonly paymentSettingsService: PaymentSettingsService,
  ) {}

  private async getClient(): Promise<Stripe> {
    const setting =
      await this.paymentSettingsService.findOne('stripe_secret_key');
    return new Stripe(setting.value, {
      apiVersion: '2022-11-15',
      typescript: true,
    });
  }

  // ✅ Returns existing Stripe customer if stripeCustomerId is provided,
  // otherwise creates a new one using the email.
  // This prevents duplicate customers in Stripe for the same user.
  async getOrCreateCustomer(params: {
    userEmail: string;
    stripeCustomerId?: string | null;
  }): Promise<string> {
    const stripe = await this.getClient();

    if (params.stripeCustomerId) {
      // Verify the customer still exists in Stripe (could have been deleted)
      try {
        const existing = await stripe.customers.retrieve(
          params.stripeCustomerId,
        );
        // retrieve() returns a DeletedCustomer object if the customer was deleted
        if (!(existing as Stripe.DeletedCustomer).deleted) {
          return existing.id;
        }
      } catch {
        // Customer not found in Stripe — fall through and create a new one
      }
    }

    // No valid existing customer — create a fresh one
    const customer = await stripe.customers.create({
      email: params.userEmail,
    });
    return customer.id;
  }

  async createCheckoutSession(params: {
    planId: number;
    planName: string;
    price: number;
    userId: number;
    userEmail: string;
    stripeCustomerId?: string | null; // ✅ pass existing customer id if available
  }): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getClient();

    // ✅ Reuse existing Stripe customer — prevents duplicate customer per user
    const customerId = await this.getOrCreateCustomer({
      userEmail: params.userEmail,
      stripeCustomerId: params.stripeCustomerId,
    });

    return stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer: customerId,         // ✅ use customer id, not customer_email
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: params.planName },
            unit_amount: Math.round(params.price * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        planId: params.planId.toString(),
        userId: params.userId.toString(),
      },
      success_url: `${process.env.FRONTEND_URL}/subscriptions?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscriptions?type=cancel`,
    });
  }

  async createStripeProduct(params: {
    name: string;
    price: number;
    interval: 'day' | 'week' | 'month' | 'year';
  }): Promise<{ productId: string; priceId: string }> {
    const stripe = await this.getClient();
    const product = await stripe.products.create({ name: params.name });
    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(params.price * 100),
      currency: 'usd',
      recurring: { interval: params.interval },
    });
    return { productId: product.id, priceId: stripePrice.id };
  }

  async updateStripeProduct(params: {
    productId: string;
    name?: string;
    active?: boolean;
  }): Promise<void> {
    const stripe = await this.getClient();
    await stripe.products.update(params.productId, {
      name: params.name,
      active: params.active,
    });
  }

  async createSubscriptionSession(params: {
    planId: number;
    planName: string;
    stripePriceId: string;
    userId: number;
    userEmail: string;
    stripeCustomerId?: string | null; // ✅ pass existing customer id if available
  }): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getClient();

    // ✅ Reuse existing Stripe customer — prevents duplicate customer per user
    const customerId = await this.getOrCreateCustomer({
      userEmail: params.userEmail,
      stripeCustomerId: params.stripeCustomerId,
    });

    return stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: customerId,         // ✅ use customer id, not customer_email
      line_items: [{ price: params.stripePriceId, quantity: 1 }],
      metadata: {
        planId: params.planId.toString(),
        userId: params.userId.toString(),
        type: 'subscription',
      },
      // Propagate metadata to the Subscription object so invoice webhooks can read it
      subscription_data: {
        metadata: {
          planId: params.planId.toString(),
          userId: params.userId.toString(),
        },
      },
      success_url: `${process.env.FRONTEND_URL}/subscriptions?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscriptions?type=cancel`,
    });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = await this.getClient();
    return stripe.subscriptions.retrieve(subscriptionId);
  }

  // Fetch the latest invoice for a subscription.
  // Used in checkout.session.completed to get hosted_invoice_url and invoice_pdf
  // for the first subscription payment, since invoice.payment_succeeded is skipped
  // for billing_reason='subscription_create'.
  async getSubscriptionInvoice(
    subscriptionId: string,
  ): Promise<Stripe.Invoice | null> {
    try {
      const stripe = await this.getClient();
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 1,
      });
      return invoices.data[0] ?? null;
    } catch (err) {
      console.warn(
        `getSubscriptionInvoice: could not fetch invoice for subscription ${subscriptionId}`,
        err,
      );
      return null;
    }
  }

  async cancelSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = await this.getClient();
    return stripe.subscriptions.cancel(subscriptionId);
  }

  async createStripePrice({
                            productId,
                            price,
                            interval,
                          }: {
    productId: string;
    price: number;
    interval: 'day' | 'week' | 'month' | 'year';
  }) {
    const stripe = await this.getClient();
    const stripePrice = await stripe.prices.create({
      product: productId,
      unit_amount: price * 100,
      currency: 'inr',
      recurring: { interval },
    });
    return { priceId: stripePrice.id };
  }

  async archiveStripePrice(priceId: string): Promise<void> {
    const stripe = await this.getClient();
    await stripe.prices.update(priceId, { active: false });
  }

  async constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): Promise<Stripe.Event> {
    const stripe = await this.getClient();
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  }
}
