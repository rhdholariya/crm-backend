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
import { TriggerType } from '../entities/automation-workflow.entity';
import { ActivityType } from '../entities/lead-activity.entity';

@Injectable()
export class WooCommerceWebhookService {
  private readonly logger = new Logger(WooCommerceWebhookService.name);

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
   * Verify WooCommerce webhook signature
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
   * Handle WooCommerce order creation webhook
   */
  async handleOrderCreated(
    userId: number,
    integrationId: number,
    webhookData: any,
  ): Promise<void> {
    try {
      const orderId = webhookData.id;
      const customer = webhookData.billing || {};

      this.logger.log(`Processing WooCommerce order ${orderId} for user ${userId}`);

      // Extract data using field mappings
      const extractedData = await this.fieldMappingService.extractWebhookData(
        integrationId,
        WebhookEventType.ORDER_CREATED,
        webhookData,
      );

      this.logger.log(`Extracted data: ${JSON.stringify(extractedData)}`);

      // Create or update lead
      let lead;
      try {
        lead = await this.leadService.findByExternalId(userId, orderId.toString());
        // Update existing lead
        lead = await this.leadService.update(userId, lead.id, {
          ...extractedData,
          totalOrderValue: (lead.totalOrderValue || 0) + parseFloat(webhookData.total),
        });
        this.logger.log(`Updated existing lead: ${lead.id}`);
      } catch (error) {
        // Create new lead
        this.logger.log(`Creating new lead for WooCommerce order ${orderId}`);
        const defaultStageId = await this.getDefaultStageId(userId);
        lead = await this.leadService.create(userId, {
          name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          email: customer.email,
          phoneNumber: customer.phone,
          externalId: orderId.toString(),
          source: LeadSource.WOOCOMMERCE,
          customerType: CustomerType.CUSTOMER,
          totalOrderValue: parseFloat(webhookData.total),
          stageId: defaultStageId,
          customFields: {
            ...extractedData,
            orderCount: 1,
            lastOrderDate: new Date(),
          },
        });
        this.logger.log(`Created new lead: ${lead.id}`);
      }

      // Log activity
      await this.leadService.addActivity(
        lead.id,
        ActivityType.ORDER_CREATED,
        `WooCommerce order created: ${orderId}`,
        { orderId, amount: webhookData.total },
      );

      // Create contact if it's a new lead
      try {
        await this.createOrUpdateContact(userId, lead, webhookData.billing, webhookData);
      } catch (error) {
        this.logger.error('Error creating contact:', error);
        // Don't throw - continue with automation even if contact creation fails
      }

      // Trigger automation workflows
      const workflows = await this.triggerMatcher.getMatchingWorkflows(
        userId,
        lead,
        TriggerType.NEW_ORDER,
      );

      for (const workflow of workflows) {
        try {
          await this.automationExecutor.executeAction(workflow, lead, userId);
        } catch (error) {
          this.logger.error(`Error executing workflow ${workflow.id}:`, error);
        }
      }

      // Check for high-value order
      if (parseFloat(webhookData.total) > 1000) {
        const highValueWorkflows = await this.triggerMatcher.getMatchingWorkflows(
          userId,
          lead,
          TriggerType.HIGH_VALUE_ORDER,
        );

        for (const workflow of highValueWorkflows) {
          try {
            await this.automationExecutor.executeAction(workflow, lead, userId);
          } catch (error) {
            this.logger.error(`Error executing workflow ${workflow.id}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling WooCommerce order created webhook:', error);
      await this.integrationService.recordError(
        userId,
        integrationId,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Handle WooCommerce order completion webhook
   */
  async handleOrderCompleted(
    userId: number,
    integrationId: number,
    webhookData: any,
  ): Promise<void> {
    try {
      const orderId = webhookData.id;

      // Extract data using field mappings
      const extractedData = await this.fieldMappingService.extractWebhookData(
        integrationId,
        WebhookEventType.ORDER_SHIPPED,
        webhookData,
      );

      // Find lead by external ID
      const lead = await this.leadService.findByExternalId(userId, orderId.toString());

      if (lead) {
        // Log activity
        await this.leadService.addActivity(
          lead.id,
          ActivityType.ORDER_SHIPPED,
          'WooCommerce order completed',
          { orderId, trackingInfo: extractedData },
        );

        // Trigger automation workflows
        const workflows = await this.triggerMatcher.getMatchingWorkflows(
          userId,
          lead,
          TriggerType.ORDER_SHIPPED,
        );

        for (const workflow of workflows) {
          try {
            await this.automationExecutor.executeAction(workflow, lead, userId);
          } catch (error) {
            this.logger.error(`Error executing workflow ${workflow.id}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling WooCommerce order completed webhook:', error);
      await this.integrationService.recordError(
        userId,
        integrationId,
        error.message,
      );
    }
  }

  /**
   * Handle WooCommerce customer creation webhook
   */
  async handleCustomerCreated(
    userId: number,
    integrationId: number,
    webhookData: any,
  ): Promise<void> {
    try {
      const customerId = webhookData.id;

      this.logger.log(`Processing WooCommerce customer ${customerId} for user ${userId}`);

      // Create prospect lead
      const defaultStageId = await this.getDefaultStageId(userId);
      const lead = await this.leadService.create(userId, {
        name: `${webhookData.first_name || ''} ${webhookData.last_name || ''}`.trim(),
        email: webhookData.email,
        externalId: customerId.toString(),
        source: LeadSource.WOOCOMMERCE,
        customerType: CustomerType.PROSPECT,
        stageId: defaultStageId,
      });

      this.logger.log(`Created prospect lead from WooCommerce customer: ${lead.id}`);

      // Log activity
      await this.leadService.addActivity(
        lead.id,
        ActivityType.TAG_ADDED,
        'Created from WooCommerce customer',
        { customerId },
      );
    } catch (error) {
      this.logger.error('Error handling WooCommerce customer created webhook:', error);
      await this.integrationService.recordError(
        userId,
        integrationId,
        error.message,
      );
    }
  }

  /**
   * Create or update contact from lead
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
    billing: any,
    webhookData: any,
  ): Promise<void> {
    try {
      const fullName = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim();
      const note = `Order #${webhookData.id} - Total: $${webhookData.total} - Created: ${webhookData.created_at}`;

      // Check if contact already exists by email or phone before creating
      const { contact, created } = await this.contactsService.createIfNotExists(userId, {
        name: fullName || lead.name,
        email: billing?.email || lead.email,
        phoneNumber: billing?.phone || lead.phoneNumber,
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
