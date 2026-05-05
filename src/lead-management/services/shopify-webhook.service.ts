import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EcommerceIntegrationService } from './ecommerce-integration.service';
import { FieldMappingService } from './field-mapping.service';
import { LeadService } from './lead.service';
import { PipelineService } from './pipeline.service';
import { AutomationWorkflowService } from './automation-workflow.service';
import { WorkflowTriggerMatcherService } from './workflow-trigger-matcher.service';
import { AutomationExecutorService } from './automation-executor.service';
import { ContactsService } from '../../contacts/contacts.service';
import { WebhookEventType } from '../entities/field-mapping.entity';
import { LeadSource, CustomerType } from '../entities/lead.entity';
import { TriggerType, ActionType } from '../entities/automation-workflow.entity';
import { ActivityType } from '../entities/lead-activity.entity';

@Injectable()
export class ShopifyWebhookService {
  private readonly logger = new Logger(ShopifyWebhookService.name);

  constructor(
    private integrationService: EcommerceIntegrationService,
    private fieldMappingService: FieldMappingService,
    private leadService: LeadService,
    private pipelineService: PipelineService,
    private automationService: AutomationWorkflowService,
    private triggerMatcher: WorkflowTriggerMatcherService,
    private automationExecutor: AutomationExecutorService,
    private contactsService: ContactsService,
  ) {}

  /**
   * Verify Shopify webhook signature
   */
  async verifyWebhookSignature(
    userId: number,
    integrationId: number,
    payload: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const integration = await this.integrationService.findById(userId, integrationId);

      if (!integration.webhookSecret) {
        this.logger.warn('No webhook secret configured for integration');
        return false;
      }

      const hmac = crypto
        .createHmac('sha256', integration.webhookSecret)
        .update(payload, 'utf8')
        .digest('base64');

      return hmac === signature;
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Handle Shopify order creation webhook
   */
  async handleOrderCreated(
    userId: number,
    integrationId: number,
    webhookData: any,
  ): Promise<void> {
    try {
      const orderId = webhookData.id;
      const customer = webhookData.customer;

      this.logger.log(`[SHOPIFY-WEBHOOK] ========== ORDER CREATED WEBHOOK ==========`);
      this.logger.log(`[SHOPIFY-WEBHOOK] Order ID: ${orderId}`);
      this.logger.log(`[SHOPIFY-WEBHOOK] User ID: ${userId}`);
      this.logger.log(`[SHOPIFY-WEBHOOK] Integration ID: ${integrationId}`);
      this.logger.log(`[SHOPIFY-WEBHOOK] Customer: ${customer?.first_name} ${customer?.last_name}`);
      this.logger.log(`[SHOPIFY-WEBHOOK] Customer Phone: ${customer?.phone}`);
      this.logger.log(`[SHOPIFY-WEBHOOK] Order Total: ${webhookData.total_price}`);

      // Extract data using field mappings
      this.logger.log(`[SHOPIFY-WEBHOOK] Extracting webhook data...`);
      const extractedData = await this.fieldMappingService.extractWebhookData(
        integrationId,
        WebhookEventType.ORDER_CREATED,
        webhookData,
      );

      this.logger.log(`[SHOPIFY-WEBHOOK] Extracted data: ${JSON.stringify(extractedData)}`);

      // Always create new lead for new orders (or update if exists by externalId)
      let lead;
      try {
        // Try to find existing lead by externalId
        this.logger.log(`[SHOPIFY-WEBHOOK] Attempting to update existing lead...`);
        lead = await this.leadService.updateFromWebhook(
          userId,
          orderId.toString(),
          {
            ...extractedData,
            orderCount: 1,
            lastOrderDate: new Date(webhookData.created_at),
          },
        );
        this.logger.log(`[SHOPIFY-WEBHOOK] ✅ Updated existing lead: ${lead.id}`);
      } catch (error) {
        // Lead doesn't exist, create new one
        this.logger.log(`[SHOPIFY-WEBHOOK] Lead not found, creating new lead...`);
        const defaultStageId = await this.getDefaultStageId(userId);
        this.logger.log(`[SHOPIFY-WEBHOOK] Default stage ID: ${defaultStageId}`);
        
        lead = await this.leadService.create(userId, {
          name: customer?.first_name + ' ' + customer?.last_name,
          email: customer?.email,
          phoneNumber: customer?.phone,
          externalId: orderId.toString(),
          source: LeadSource.SHOPIFY,
          customerType: CustomerType.CUSTOMER,
          totalOrderValue: parseFloat(webhookData.total_price),
          stageId: defaultStageId,
          customFields: {
            ...extractedData,
            orderCount: 1,
            lastOrderDate: new Date(webhookData.created_at),
          },
        });
        this.logger.log(`[SHOPIFY-WEBHOOK] ✅ Created new lead: ${lead.id}`);
      }

      // Log activity
      this.logger.log(`[SHOPIFY-WEBHOOK] Logging order_created activity...`);
      await this.leadService.addActivity(
        lead.id,
        ActivityType.ORDER_CREATED,
        `New order created: ${orderId}`,
        { orderId, amount: webhookData.total_price },
      );
      this.logger.log(`[SHOPIFY-WEBHOOK] ✅ Activity logged`);

      // Create contact if it's a new lead
      try {
        this.logger.log(`[SHOPIFY-WEBHOOK] Creating/updating contact...`);
        await this.createOrUpdateContact(userId, lead, customer, webhookData);
        this.logger.log(`[SHOPIFY-WEBHOOK] ✅ Contact created/updated`);
      } catch (error) {
        this.logger.error('[SHOPIFY-WEBHOOK] Error creating contact:', error);
        // Don't throw - continue with automation even if contact creation fails
      }

      // Trigger automation workflows
      this.logger.log(`[SHOPIFY-WEBHOOK] Triggering NEW_ORDER automations...`);
      await this.triggerAutomations(
        userId,
        lead,
        TriggerType.NEW_ORDER,
      );
      this.logger.log(`[SHOPIFY-WEBHOOK] ✅ NEW_ORDER automations triggered`);

      // Check for high-value order
      if (parseFloat(webhookData.total_price) > 1000) {
        this.logger.log(`[SHOPIFY-WEBHOOK] High-value order detected (${webhookData.total_price} > 1000)`);
        this.logger.log(`[SHOPIFY-WEBHOOK] Triggering HIGH_VALUE_ORDER automations...`);
        await this.triggerAutomations(
          userId,
          lead,
          TriggerType.HIGH_VALUE_ORDER,
        );
        this.logger.log(`[SHOPIFY-WEBHOOK] ✅ HIGH_VALUE_ORDER automations triggered`);
      }

      this.logger.log(`[SHOPIFY-WEBHOOK] ✅ Order webhook processing complete`);
      this.logger.log(`[SHOPIFY-WEBHOOK] ========== WEBHOOK COMPLETE ==========`);
    } catch (error) {
      this.logger.error('[SHOPIFY-WEBHOOK] ❌ Error handling order created webhook:', error);
      this.logger.error('[SHOPIFY-WEBHOOK] Error stack:', error.stack);
      await this.integrationService.recordError(
        userId,
        integrationId,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Handle Shopify order fulfillment webhook
   */
  async handleOrderFulfilled(
    userId: number,
    integrationId: number,
    webhookData: any,
  ): Promise<void> {
    try {
      const orderId = webhookData.order_id;

      // Extract data using field mappings
      const extractedData = await this.fieldMappingService.extractWebhookData(
        integrationId,
        WebhookEventType.ORDER_SHIPPED,
        webhookData,
      );

      // Find lead by external ID
      const lead = await this.leadService.findById(userId, orderId);

      if (lead) {
        // Log activity
        await this.leadService.addActivity(
          lead.id,
          ActivityType.ORDER_SHIPPED,
          'Order shipped',
          { orderId, trackingInfo: extractedData },
        );

        // Trigger automation workflows
        await this.triggerAutomations(
          userId,
          lead,
          TriggerType.ORDER_SHIPPED,
        );
      }
    } catch (error) {
      this.logger.error('Error handling order fulfilled webhook:', error);
      await this.integrationService.recordError(
        userId,
        integrationId,
        error.message,
      );
    }
  }

  /**
   * Handle Shopify customer creation webhook
   */
  async handleCustomerCreated(
    userId: number,
    integrationId: number,
    webhookData: any,
  ): Promise<void> {
    try {
      const customerId = webhookData.id;

      // Extract data using field mappings
      const extractedData = await this.fieldMappingService.extractWebhookData(
        integrationId,
        WebhookEventType.CUSTOMER_CREATED,
        webhookData,
      );

      // Create lead for new customer
      const defaultStageId = await this.getDefaultStageId(userId);
      await this.leadService.create(userId, {
        name: webhookData.first_name + ' ' + webhookData.last_name,
        email: webhookData.email,
        phoneNumber: webhookData.phone,
        externalId: customerId.toString(),
        source: LeadSource.SHOPIFY,
        customerType: CustomerType.PROSPECT,
        stageId: defaultStageId,
        customFields: extractedData,
      });
    } catch (error) {
      this.logger.error('Error handling customer created webhook:', error);
      await this.integrationService.recordError(
        userId,
        integrationId,
        error.message,
      );
    }
  }

  /**
   * Trigger automation workflows for a lead
   */
  private async triggerAutomations(
    userId: number,
    lead: any,
    triggerType: TriggerType,
  ): Promise<void> {
    try {
      this.logger.log(
        `[SHOPIFY-AUTOMATION] ========== TRIGGERING AUTOMATIONS ==========`,
      );
      this.logger.log(
        `[SHOPIFY-AUTOMATION] Lead ID: ${lead.id}, Name: ${lead.name}`,
      );
      this.logger.log(
        `[SHOPIFY-AUTOMATION] Trigger Type: ${triggerType}`,
      );
      this.logger.log(
        `[SHOPIFY-AUTOMATION] User ID: ${userId}`,
      );

      const workflows = await this.automationService.getTriggeredWorkflows(
        userId,
        lead,
        triggerType,
      );

      this.logger.log(`[SHOPIFY-AUTOMATION] Found ${workflows.length} matching workflows`);
      
      if (workflows.length === 0) {
        this.logger.warn(`[SHOPIFY-AUTOMATION] ⚠️ No workflows found for trigger type: ${triggerType}`);
      }

      for (const workflow of workflows) {
        try {
          this.logger.log(
            `[SHOPIFY-AUTOMATION] ========== WORKFLOW EXECUTION START ==========`,
          );
          this.logger.log(
            `[SHOPIFY-AUTOMATION] Workflow ID: ${workflow.id}, Name: ${workflow.name}`,
          );
          this.logger.log(
            `[SHOPIFY-AUTOMATION] Action Type: ${workflow.actionType}`,
          );
          this.logger.log(
            `[SHOPIFY-AUTOMATION] Delay Minutes: ${workflow.delayMinutes || 0}`,
          );

          // Apply delay if configured
          if (workflow.delayMinutes && workflow.delayMinutes > 0) {
            this.logger.log(
              `[SHOPIFY-AUTOMATION] ⏳ Delaying execution by ${workflow.delayMinutes} minutes`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, workflow.delayMinutes * 60 * 1000),
            );
            this.logger.log(`[SHOPIFY-AUTOMATION] ✅ Delay complete, executing workflow`);
          }

          // Use AutomationExecutorService to execute the action
          this.logger.log(`[SHOPIFY-AUTOMATION] Calling AutomationExecutorService.executeAction()`);
          await this.automationExecutor.executeAction(
            workflow,
            lead,
            userId,
          );

          // Increment execution count
          await this.automationService.incrementExecutionCount(workflow.id);
          this.logger.log(`[SHOPIFY-AUTOMATION] ✅ Execution count incremented`);

          this.logger.log(`[SHOPIFY-AUTOMATION] ✅ Workflow ${workflow.id} executed successfully`);
          this.logger.log(
            `[SHOPIFY-AUTOMATION] ========== WORKFLOW EXECUTION COMPLETE ==========`,
          );
        } catch (error) {
          this.logger.error(
            `[SHOPIFY-AUTOMATION] ❌ Error executing workflow ${workflow.id}: ${error.message}`,
            error,
          );
          this.logger.error(`[SHOPIFY-AUTOMATION] Error stack:`, error.stack);
          // Continue with next workflow even if one fails
        }
      }

      this.logger.log(`[SHOPIFY-AUTOMATION] ✅ All workflows processed`);
      this.logger.log(
        `[SHOPIFY-AUTOMATION] ========== AUTOMATIONS COMPLETE ==========`,
      );
    } catch (error) {
      this.logger.error(`[SHOPIFY-AUTOMATION] ❌ Error triggering automations: ${error.message}`, error);
      this.logger.error(`[SHOPIFY-AUTOMATION] Error stack:`, error.stack);
    }
  }

  /**
   * Get default stage for a user (first stage of first pipeline)
   */
  private async getDefaultStageId(userId: number): Promise<number> {
    try {
      const pipelines = await this.pipelineService.findAll(userId);
      
      if (pipelines.length === 0) {
        throw new Error('No pipelines found for user');
      }

      const firstPipeline = pipelines[0];
      if (!firstPipeline.stages || firstPipeline.stages.length === 0) {
        throw new Error('No stages found in default pipeline');
      }

      return firstPipeline.stages[0].id;
    } catch (error) {
      this.logger.error('Error getting default stage:', error);
      throw error;
    }
  }

  /**
   * Create or update contact from lead
   */
  private async createOrUpdateContact(
    userId: number,
    lead: any,
    customer: any,
    webhookData: any,
  ): Promise<void> {
    try {
      const fullName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
      const note = `Order #${webhookData.id} - Total: $${webhookData.total_price} - Created: ${webhookData.created_at}`;

      // Check if contact already exists by email or phone before creating
      const { contact, created } = await this.contactsService.createIfNotExists(userId, {
        name: fullName || lead.name,
        email: customer?.email || lead.email,
        phoneNumber: customer?.phone || lead.phoneNumber,
        note: note,
        tagIds: [], // Tags can be added through automation workflows
      });

      if (created) {
        this.logger.log(`Contact created for lead ${lead.id} (contact ${contact.id})`);
      } else {
        this.logger.log(`Contact already exists for lead ${lead.id} — skipping (matched contact ${contact.id} by email/phone)`);
      }
    } catch (error) {
      this.logger.error('Error creating contact:', error);
      throw error;
    }
  }
}
