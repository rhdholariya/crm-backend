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

  async createCheckoutSession(params: {
    planId: number;
    planName: string;
    price: number;
    userId: number;
    userEmail: string;
  }): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getClient();
    return stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: params.userEmail,
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
  }): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getClient();
    return stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: params.userEmail,
      line_items: [{ price: params.stripePriceId, quantity: 1 }],
      metadata: {
        planId: params.planId.toString(),
        userId: params.userId.toString(),
        type: 'subscription',
      },
      success_url: `${process.env.FRONTEND_URL}/subscriptions?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscriptions?type=cancel`,
    });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = await this.getClient();
    return stripe.subscriptions.retrieve(subscriptionId);
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
