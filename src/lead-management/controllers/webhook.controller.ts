import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ShopifyWebhookService } from '../services/shopify-webhook.service';
import { WooCommerceWebhookService } from '../services/woocommerce-webhook.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private shopifyWebhookService: ShopifyWebhookService,
    private woocommerceWebhookService: WooCommerceWebhookService,
  ) {}

  @Post('shopify/:integrationId/:userId')
  async handleShopifyWebhook(
    @Param('integrationId') integrationId: number,
    @Param('userId') userId: number,
    @Headers('x-shopify-hmac-sha256') signature: string,
    @Body() payload: any,
  ) {
    try {
      this.logger.log(`Shopify webhook received for integration ${integrationId}, user ${userId}`);
      this.logger.log(`Payload: ${JSON.stringify(payload)}`);

      // Skip signature verification for testing (optional)
      if (signature) {
        const isValid = await this.shopifyWebhookService.verifyWebhookSignature(
          userId,
          integrationId,
          JSON.stringify(payload),
          signature,
        );

        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          // For testing, we'll continue anyway
        }
      }

      // Determine event type and handle accordingly
      const topic = payload.topic || '';

      this.logger.log(`Processing webhook with topic: ${topic}`);

      if (topic.includes('orders/create') || payload.id) {
        // If no topic but has order data, treat as order created
        await this.shopifyWebhookService.handleOrderCreated(
          userId,
          integrationId,
          payload,
        );
      } else if (topic.includes('orders/fulfilled')) {
        await this.shopifyWebhookService.handleOrderFulfilled(
          userId,
          integrationId,
          payload,
        );
      } else if (topic.includes('customers/create')) {
        await this.shopifyWebhookService.handleCustomerCreated(
          userId,
          integrationId,
          payload,
        );
      }

      return { success: true, message: 'Shopify webhook processed' };
    } catch (error) {
      this.logger.error('Error processing Shopify webhook:', error);
      return { success: false, error: error.message };
    }
  }

  @Post('woocommerce/:integrationId/:userId')
  async handleWooCommerceWebhook(
    @Param('integrationId') integrationId: number,
    @Param('userId') userId: number,
    @Headers('x-wc-webhook-signature') signature: string,
    @Body() payload: any,
  ) {
    try {
      this.logger.log(`WooCommerce webhook received for integration ${integrationId}, user ${userId}`);
      this.logger.log(`Payload: ${JSON.stringify(payload)}`);

      // Skip signature verification for testing (optional)
      if (signature) {
        const isValid = await this.woocommerceWebhookService.verifyWebhookSignature(
          userId,
          integrationId,
          JSON.stringify(payload),
          signature,
        );

        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          // For testing, we'll continue anyway
        }
      }

      // Determine event type from webhook resource
      const resource = payload.resource || '';
      const action = payload.action || '';

      this.logger.log(`Processing WooCommerce webhook: ${resource}/${action}`);

      if (resource === 'order' && action === 'created') {
        await this.woocommerceWebhookService.handleOrderCreated(
          userId,
          integrationId,
          payload,
        );
      } else if (resource === 'order' && action === 'updated') {
        // Check if order status changed to completed
        if (payload.status === 'completed') {
          await this.woocommerceWebhookService.handleOrderCompleted(
            userId,
            integrationId,
            payload,
          );
        }
      } else if (resource === 'customer' && action === 'created') {
        await this.woocommerceWebhookService.handleCustomerCreated(
          userId,
          integrationId,
          payload,
        );
      }

      return { success: true, message: 'WooCommerce webhook processed' };
    } catch (error) {
      this.logger.error('Error processing WooCommerce webhook:', error);
      return { success: false, error: error.message };
    }
  }
}
