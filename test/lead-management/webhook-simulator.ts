/**
 * Webhook Simulator for testing lead management and e-commerce integration
 * This file provides utilities to simulate webhook calls and test the system
 */

import * as crypto from 'crypto';
import {
  SHOPIFY_ORDER_CREATED_PAYLOAD,
  SHOPIFY_ORDER_FULFILLED_PAYLOAD,
  SHOPIFY_CUSTOMER_CREATED_PAYLOAD,
  WOOCOMMERCE_ORDER_CREATED_PAYLOAD,
  WOOCOMMERCE_ORDER_COMPLETED_PAYLOAD,
  WOOCOMMERCE_CUSTOMER_CREATED_PAYLOAD,
  TEST_USER_ID,
  ECOMMERCE_INTEGRATIONS,
} from './static-data';

/**
 * Generate HMAC signature for Shopify webhook
 */
export function generateShopifySignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

/**
 * Generate HMAC signature for WooCommerce webhook
 */
export function generateWooCommerceSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

/**
 * Simulate Shopify order created webhook
 */
export function simulateShopifyOrderCreated(
  integrationId: number = 1,
  userId: number = TEST_USER_ID,
  customPayload?: any,
) {
  const payload = customPayload || SHOPIFY_ORDER_CREATED_PAYLOAD;
  const integration = ECOMMERCE_INTEGRATIONS.find((i) => i.id === integrationId);

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateShopifySignature(payloadString, integration.webhookSecret);

  return {
    url: `/webhooks/shopify/${integrationId}/${userId}`,
    method: 'POST',
    headers: {
      'x-shopify-hmac-sha256': signature,
      'content-type': 'application/json',
    },
    body: payload,
  };
}

/**
 * Simulate Shopify order fulfilled webhook
 */
export function simulateShopifyOrderFulfilled(
  integrationId: number = 1,
  userId: number = TEST_USER_ID,
  customPayload?: any,
) {
  const payload = customPayload || SHOPIFY_ORDER_FULFILLED_PAYLOAD;
  const integration = ECOMMERCE_INTEGRATIONS.find((i) => i.id === integrationId);

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateShopifySignature(payloadString, integration.webhookSecret);

  return {
    url: `/webhooks/shopify/${integrationId}/${userId}`,
    method: 'POST',
    headers: {
      'x-shopify-hmac-sha256': signature,
      'content-type': 'application/json',
    },
    body: payload,
  };
}

/**
 * Simulate Shopify customer created webhook
 */
export function simulateShopifyCustomerCreated(
  integrationId: number = 1,
  userId: number = TEST_USER_ID,
  customPayload?: any,
) {
  const payload = customPayload || SHOPIFY_CUSTOMER_CREATED_PAYLOAD;
  const integration = ECOMMERCE_INTEGRATIONS.find((i) => i.id === integrationId);

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateShopifySignature(payloadString, integration.webhookSecret);

  return {
    url: `/webhooks/shopify/${integrationId}/${userId}`,
    method: 'POST',
    headers: {
      'x-shopify-hmac-sha256': signature,
      'content-type': 'application/json',
    },
    body: payload,
  };
}

/**
 * Simulate WooCommerce order created webhook
 */
export function simulateWooCommerceOrderCreated(
  integrationId: number = 2,
  userId: number = TEST_USER_ID,
  customPayload?: any,
) {
  const payload = customPayload || WOOCOMMERCE_ORDER_CREATED_PAYLOAD;
  const integration = ECOMMERCE_INTEGRATIONS.find((i) => i.id === integrationId);

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateWooCommerceSignature(payloadString, integration.webhookSecret);

  return {
    url: `/webhooks/woocommerce/${integrationId}/${userId}`,
    method: 'POST',
    headers: {
      'x-wc-webhook-signature': signature,
      'content-type': 'application/json',
    },
    body: payload,
  };
}

/**
 * Simulate WooCommerce order completed webhook
 */
export function simulateWooCommerceOrderCompleted(
  integrationId: number = 2,
  userId: number = TEST_USER_ID,
  customPayload?: any,
) {
  const payload = customPayload || WOOCOMMERCE_ORDER_COMPLETED_PAYLOAD;
  const integration = ECOMMERCE_INTEGRATIONS.find((i) => i.id === integrationId);

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateWooCommerceSignature(payloadString, integration.webhookSecret);

  return {
    url: `/webhooks/woocommerce/${integrationId}/${userId}`,
    method: 'POST',
    headers: {
      'x-wc-webhook-signature': signature,
      'content-type': 'application/json',
    },
    body: payload,
  };
}

/**
 * Simulate WooCommerce customer created webhook
 */
export function simulateWooCommerceCustomerCreated(
  integrationId: number = 2,
  userId: number = TEST_USER_ID,
  customPayload?: any,
) {
  const payload = customPayload || WOOCOMMERCE_CUSTOMER_CREATED_PAYLOAD;
  const integration = ECOMMERCE_INTEGRATIONS.find((i) => i.id === integrationId);

  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  const payloadString = JSON.stringify(payload);
  const signature = generateWooCommerceSignature(payloadString, integration.webhookSecret);

  return {
    url: `/webhooks/woocommerce/${integrationId}/${userId}`,
    method: 'POST',
    headers: {
      'x-wc-webhook-signature': signature,
      'content-type': 'application/json',
    },
    body: payload,
  };
}

/**
 * Create custom Shopify order payload
 */
export function createCustomShopifyOrder(overrides: any = {}) {
  return {
    ...SHOPIFY_ORDER_CREATED_PAYLOAD,
    ...overrides,
  };
}

/**
 * Create custom WooCommerce order payload
 */
export function createCustomWooCommerceOrder(overrides: any = {}) {
  return {
    ...WOOCOMMERCE_ORDER_CREATED_PAYLOAD,
    ...overrides,
  };
}

/**
 * Test scenarios for webhook simulation
 */
export const TEST_SCENARIOS = {
  /**
   * Scenario 1: New Shopify order creates lead and triggers automation
   */
  shopifyNewOrder: () => {
    return simulateShopifyOrderCreated(1, TEST_USER_ID, {
      ...SHOPIFY_ORDER_CREATED_PAYLOAD,
      id: 1234567890,
      customer: {
        ...SHOPIFY_ORDER_CREATED_PAYLOAD.customer,
        email: 'newcustomer@shopify.com',
        first_name: 'New',
        last_name: 'Customer',
      },
    });
  },

  /**
   * Scenario 2: High-value Shopify order triggers VIP workflow
   */
  shopifyHighValueOrder: () => {
    return simulateShopifyOrderCreated(1, TEST_USER_ID, {
      ...SHOPIFY_ORDER_CREATED_PAYLOAD,
      id: 1234567891,
      total_price: '2500.00',
      customer: {
        ...SHOPIFY_ORDER_CREATED_PAYLOAD.customer,
        email: 'highvalue@shopify.com',
        first_name: 'High',
        last_name: 'Value',
      },
    });
  },

  /**
   * Scenario 3: Shopify order fulfillment triggers shipping notification
   */
  shopifyOrderShipped: () => {
    return simulateShopifyOrderFulfilled(1, TEST_USER_ID, {
      ...SHOPIFY_ORDER_FULFILLED_PAYLOAD,
      order_id: 1234567890,
    });
  },

  /**
   * Scenario 4: New WooCommerce order creates lead
   */
  woocommerceNewOrder: () => {
    return simulateWooCommerceOrderCreated(2, TEST_USER_ID, {
      ...WOOCOMMERCE_ORDER_CREATED_PAYLOAD,
      id: 2002,
      billing: {
        ...WOOCOMMERCE_ORDER_CREATED_PAYLOAD.billing,
        email: 'newwoo@example.com',
        first_name: 'New',
        last_name: 'WooCustomer',
      },
    });
  },

  /**
   * Scenario 5: WooCommerce order completion triggers workflow
   */
  woocommerceOrderCompleted: () => {
    return simulateWooCommerceOrderCompleted(2, TEST_USER_ID, {
      ...WOOCOMMERCE_ORDER_COMPLETED_PAYLOAD,
      id: 2001,
    });
  },

  /**
   * Scenario 6: Multiple orders from same customer
   */
  multipleOrdersSameCustomer: () => {
    return [
      simulateShopifyOrderCreated(1, TEST_USER_ID, {
        ...SHOPIFY_ORDER_CREATED_PAYLOAD,
        id: 1234567892,
        customer: {
          ...SHOPIFY_ORDER_CREATED_PAYLOAD.customer,
          email: 'repeat@shopify.com',
        },
      }),
      simulateShopifyOrderCreated(1, TEST_USER_ID, {
        ...SHOPIFY_ORDER_CREATED_PAYLOAD,
        id: 1234567893,
        customer: {
          ...SHOPIFY_ORDER_CREATED_PAYLOAD.customer,
          email: 'repeat@shopify.com',
        },
      }),
    ];
  },
};
