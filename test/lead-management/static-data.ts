/**
 * Static test data for lead management and e-commerce integration testing
 */

export const TEST_USER_ID = 1;

// ============================================================================
// PIPELINE STAGES
// ============================================================================

export const PIPELINE_STAGES = [
  {
    id: 1,
    userId: TEST_USER_ID,
    name: 'New Leads',
    description: 'Newly created leads',
    color: '#FF5733',
    position: 0,
    isActive: true,
  },
  {
    id: 2,
    userId: TEST_USER_ID,
    name: 'Qualified',
    description: 'Leads that have been qualified',
    color: '#FFC300',
    position: 1,
    isActive: true,
  },
  {
    id: 3,
    userId: TEST_USER_ID,
    name: 'Negotiation',
    description: 'Leads in negotiation phase',
    color: '#3498DB',
    position: 2,
    isActive: true,
  },
  {
    id: 4,
    userId: TEST_USER_ID,
    name: 'Won',
    description: 'Closed deals',
    color: '#27AE60',
    position: 3,
    isActive: true,
  },
  {
    id: 5,
    userId: TEST_USER_ID,
    name: 'Lost',
    description: 'Lost opportunities',
    color: '#E74C3C',
    position: 4,
    isActive: true,
  },
];

// ============================================================================
// E-COMMERCE INTEGRATIONS
// ============================================================================

export const ECOMMERCE_INTEGRATIONS = [
  {
    id: 1,
    userId: TEST_USER_ID,
    platform: 'shopify',
    storeName: 'Test Shopify Store',
    storeUrl: 'https://test-store.myshopify.com',
    apiKey: 'test-shopify-api-key',
    apiSecret: 'test-shopify-api-secret',
    webhookSecret: 'test-shopify-webhook-secret',
    status: 'active',
    webhookEvents: ['orders/create', 'orders/fulfilled', 'customers/create'],
    lastSyncDate: new Date(),
  },
  {
    id: 2,
    userId: TEST_USER_ID,
    platform: 'woocommerce',
    storeName: 'Test WooCommerce Store',
    storeUrl: 'https://test-woo.com',
    apiKey: 'test-woo-api-key',
    apiSecret: 'test-woo-api-secret',
    webhookSecret: 'test-woo-webhook-secret',
    status: 'active',
    webhookEvents: ['order.created', 'order.updated', 'customer.created'],
    lastSyncDate: new Date(),
  },
];

// ============================================================================
// FIELD MAPPINGS
// ============================================================================

export const FIELD_MAPPINGS = [
  // Shopify Order Created Mappings
  {
    id: 1,
    integrationId: 1,
    eventType: 'order_created',
    externalFieldPath: 'customer.email',
    leadFieldName: 'email',
    isRequired: true,
    description: 'Customer email from Shopify order',
  },
  {
    id: 2,
    integrationId: 1,
    eventType: 'order_created',
    externalFieldPath: 'customer.phone',
    leadFieldName: 'phoneNumber',
    isRequired: false,
    description: 'Customer phone from Shopify order',
  },
  {
    id: 3,
    integrationId: 1,
    eventType: 'order_created',
    externalFieldPath: 'total_price',
    leadFieldName: 'totalOrderValue',
    isRequired: true,
    transformationLogic: 'parseFloat',
    description: 'Order total price',
  },
  {
    id: 4,
    integrationId: 1,
    eventType: 'order_created',
    externalFieldPath: 'line_items[0].title',
    leadFieldName: 'productName',
    isRequired: false,
    description: 'First product name',
  },

  // Shopify Order Shipped Mappings
  {
    id: 5,
    integrationId: 1,
    eventType: 'order_shipped',
    externalFieldPath: 'fulfillments[0].tracking_info.number',
    leadFieldName: 'trackingNumber',
    isRequired: false,
    description: 'Tracking number',
  },

  // WooCommerce Order Created Mappings
  {
    id: 6,
    integrationId: 2,
    eventType: 'order_created',
    externalFieldPath: 'billing.email',
    leadFieldName: 'email',
    isRequired: true,
    description: 'Customer email from WooCommerce order',
  },
  {
    id: 7,
    integrationId: 2,
    eventType: 'order_created',
    externalFieldPath: 'billing.phone',
    leadFieldName: 'phoneNumber',
    isRequired: false,
    description: 'Customer phone from WooCommerce order',
  },
  {
    id: 8,
    integrationId: 2,
    eventType: 'order_created',
    externalFieldPath: 'total',
    leadFieldName: 'totalOrderValue',
    isRequired: true,
    transformationLogic: 'parseFloat',
    description: 'Order total',
  },
];

// ============================================================================
// AUTOMATION WORKFLOWS
// ============================================================================

export const AUTOMATION_WORKFLOWS = [
  {
    id: 1,
    userId: TEST_USER_ID,
    name: 'Send WhatsApp on New Order',
    description: 'Send WhatsApp confirmation when new order is created',
    triggerType: 'new_order',
    triggerConditions: {},
    actionType: 'send_whatsapp',
    actionConfig: {
      message: 'Thank you {name} for your order! We will process it shortly.',
    },
    status: 'active',
    runOnce: false,
    delayMinutes: 0,
    executionCount: 0,
  },
  {
    id: 2,
    userId: TEST_USER_ID,
    name: 'Send Tracking Info on Order Shipped',
    description: 'Send WhatsApp with tracking info when order is shipped',
    triggerType: 'order_shipped',
    triggerConditions: {},
    actionType: 'send_whatsapp',
    actionConfig: {
      message: 'Your order is on the way! Track it here: {trackingNumber}',
    },
    status: 'active',
    runOnce: false,
    delayMinutes: 0,
    executionCount: 0,
  },
  {
    id: 3,
    userId: TEST_USER_ID,
    name: 'Send Offer to Inactive Customers',
    description: 'Send email offer to customers who haven\'t purchased in 30 days',
    triggerType: 'no_purchase_days',
    triggerConditions: { daysNoOrder: 30 },
    actionType: 'send_email',
    actionConfig: {
      subject: 'We miss you, {name}!',
      message: 'We have a special offer just for you. Come back and shop with us!',
    },
    status: 'active',
    runOnce: false,
    delayMinutes: 0,
    executionCount: 0,
  },
  {
    id: 4,
    userId: TEST_USER_ID,
    name: 'Tag High-Value Customers',
    description: 'Tag customers with orders over $1000 as VIP',
    triggerType: 'high_value_order',
    triggerConditions: { minOrderValue: 1000 },
    actionType: 'add_tag',
    actionConfig: {
      tagId: 1,
      tagName: 'VIP',
    },
    status: 'active',
    runOnce: true,
    delayMinutes: 0,
    executionCount: 0,
  },
];

// ============================================================================
// SAMPLE LEADS
// ============================================================================

export const SAMPLE_LEADS = [
  {
    id: 1,
    userId: TEST_USER_ID,
    name: 'John Doe',
    email: 'john@example.com',
    phoneNumber: '+1234567890',
    externalId: 'shopify-order-1001',
    source: 'shopify',
    customerType: 'customer',
    totalOrderValue: 1500,
    orderCount: 3,
    lastOrderDate: new Date('2024-05-01'),
    lastPurchaseDate: new Date('2024-05-01'),
    stageId: 4, // Won
    isArchived: false,
  },
  {
    id: 2,
    userId: TEST_USER_ID,
    name: 'Jane Smith',
    email: 'jane@example.com',
    phoneNumber: '+1987654321',
    externalId: 'shopify-order-1002',
    source: 'shopify',
    customerType: 'vip',
    totalOrderValue: 5000,
    orderCount: 10,
    lastOrderDate: new Date('2024-04-15'),
    lastPurchaseDate: new Date('2024-04-15'),
    stageId: 4, // Won
    isArchived: false,
  },
  {
    id: 3,
    userId: TEST_USER_ID,
    name: 'Bob Johnson',
    email: 'bob@example.com',
    phoneNumber: '+1555555555',
    externalId: 'woo-order-2001',
    source: 'woocommerce',
    customerType: 'customer',
    totalOrderValue: 250,
    orderCount: 1,
    lastOrderDate: new Date('2024-03-01'),
    lastPurchaseDate: new Date('2024-03-01'),
    stageId: 3, // Negotiation
    isArchived: false,
  },
  {
    id: 4,
    userId: TEST_USER_ID,
    name: 'Alice Williams',
    email: 'alice@example.com',
    phoneNumber: '+1666666666',
    externalId: null,
    source: 'manual',
    customerType: 'prospect',
    totalOrderValue: 0,
    orderCount: 0,
    lastOrderDate: null,
    lastPurchaseDate: null,
    stageId: 1, // New Leads
    isArchived: false,
  },
  {
    id: 5,
    userId: TEST_USER_ID,
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    phoneNumber: '+1777777777',
    externalId: 'shopify-order-1003',
    source: 'shopify',
    customerType: 'customer',
    totalOrderValue: 800,
    orderCount: 2,
    lastOrderDate: new Date('2024-02-01'),
    lastPurchaseDate: new Date('2024-02-01'),
    stageId: 2, // Qualified
    isArchived: false,
  },
];

// ============================================================================
// SHOPIFY WEBHOOK PAYLOADS
// ============================================================================

export const SHOPIFY_ORDER_CREATED_PAYLOAD = {
  id: 1234567890,
  email: 'customer@example.com',
  created_at: '2024-05-04T10:00:00Z',
  updated_at: '2024-05-04T10:00:00Z',
  total_price: '1500.00',
  currency: 'USD',
  customer: {
    id: 987654321,
    email: 'customer@example.com',
    first_name: 'John',
    last_name: 'Doe',
    phone: '+1234567890',
  },
  line_items: [
    {
      id: 111111111,
      title: 'Premium Product',
      quantity: 2,
      price: '750.00',
    },
  ],
  fulfillments: [],
  topic: 'orders/create',
};

export const SHOPIFY_ORDER_FULFILLED_PAYLOAD = {
  id: 1234567890,
  order_id: 1234567890,
  status: 'success',
  created_at: '2024-05-05T10:00:00Z',
  updated_at: '2024-05-05T10:00:00Z',
  tracking_info: {
    number: 'TRACK123456789',
    company: 'FedEx',
    url: 'https://tracking.fedex.com/TRACK123456789',
  },
  topic: 'orders/fulfilled',
};

export const SHOPIFY_CUSTOMER_CREATED_PAYLOAD = {
  id: 987654321,
  email: 'newcustomer@example.com',
  first_name: 'Jane',
  last_name: 'Smith',
  phone: '+1987654321',
  created_at: '2024-05-04T10:00:00Z',
  updated_at: '2024-05-04T10:00:00Z',
  topic: 'customers/create',
};

// ============================================================================
// WOOCOMMERCE WEBHOOK PAYLOADS
// ============================================================================

export const WOOCOMMERCE_ORDER_CREATED_PAYLOAD = {
  id: 2001,
  status: 'pending',
  created_at: '2024-05-04T10:00:00Z',
  updated_at: '2024-05-04T10:00:00Z',
  total: '500.00',
  currency: 'USD',
  billing: {
    first_name: 'Bob',
    last_name: 'Johnson',
    email: 'bob@example.com',
    phone: '+1555555555',
  },
  line_items: [
    {
      id: 222222222,
      name: 'Standard Product',
      quantity: 1,
      total: '500.00',
    },
  ],
  resource: 'order',
  action: 'created',
};

export const WOOCOMMERCE_ORDER_COMPLETED_PAYLOAD = {
  id: 2001,
  status: 'completed',
  created_at: '2024-05-04T10:00:00Z',
  updated_at: '2024-05-05T10:00:00Z',
  total: '500.00',
  currency: 'USD',
  billing: {
    first_name: 'Bob',
    last_name: 'Johnson',
    email: 'bob@example.com',
    phone: '+1555555555',
  },
  resource: 'order',
  action: 'updated',
};

export const WOOCOMMERCE_CUSTOMER_CREATED_PAYLOAD = {
  id: 3001,
  email: 'newwoo@example.com',
  first_name: 'Alice',
  last_name: 'Wonder',
  resource: 'customer',
  action: 'created',
};
