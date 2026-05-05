import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationWorkflow, ActionType, TriggerType } from '../entities/automation-workflow.entity';
import { Lead, CustomerType } from '../entities/lead.entity';
import { LeadService } from './lead.service';
import { ActivityType } from '../entities/lead-activity.entity';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { MailService } from '../../common/services/mail.service';
import { TagsService } from '../../tags/tags.service';
import { findSession } from '../../whatsapp/whatsapp.session';

@Injectable()
export class AutomationExecutorService {
  private readonly logger = new Logger(AutomationExecutorService.name);

  constructor(
    @InjectRepository(AutomationWorkflow)
    private workflowRepository: Repository<AutomationWorkflow>,
    private leadService: LeadService,
    private whatsappService: WhatsAppService,
    private mailService: MailService,
    private tagsService: TagsService,
  ) {}

  /**
   * Execute a workflow action for a lead
   */
  async executeAction(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    try {
      this.logger.log(
        `[AUTOMATION] ========== EXECUTING ACTION ==========`,
      );
      this.logger.log(
        `[AUTOMATION] Workflow ID: ${workflow.id}, Name: ${workflow.name}`,
      );
      this.logger.log(
        `[AUTOMATION] Lead ID: ${lead.id}, Name: ${lead.name}, Phone: ${lead.phoneNumber}`,
      );
      this.logger.log(
        `[AUTOMATION] Action Type: ${workflow.actionType}`,
      );
      this.logger.log(
        `[AUTOMATION] User ID: ${userId}`,
      );

      switch (workflow.actionType) {
        case ActionType.SEND_WHATSAPP:
          this.logger.log(`[AUTOMATION] Executing SEND_WHATSAPP action`);
          await this.sendWhatsAppMessage(workflow, lead, userId);
          break;

        case ActionType.SEND_EMAIL:
          this.logger.log(`[AUTOMATION] Executing SEND_EMAIL action`);
          await this.sendEmailMessage(workflow, lead, userId);
          break;

        case ActionType.ADD_TAG:
          this.logger.log(`[AUTOMATION] Executing ADD_TAG action`);
          await this.addTagToLead(workflow, lead, userId);
          break;

        case ActionType.CHANGE_STAGE:
          this.logger.log(`[AUTOMATION] Executing CHANGE_STAGE action`);
          await this.changeLeadStage(workflow, lead, userId);
          break;

        case ActionType.SEND_SMS:
          this.logger.log(`[AUTOMATION] Executing SEND_SMS action`);
          await this.sendSmsMessage(workflow, lead, userId);
          break;

        case ActionType.WEBHOOK_CALL:
          this.logger.log(`[AUTOMATION] Executing WEBHOOK_CALL action`);
          await this.callWebhook(workflow, lead, userId);
          break;

        default:
          this.logger.warn(`[AUTOMATION] Unknown action type: ${workflow.actionType}`);
      }

      // Increment execution count
      workflow.executionCount = (workflow.executionCount || 0) + 1;
      await this.workflowRepository.save(workflow);

      this.logger.log(`[AUTOMATION] ✅ Action executed successfully for workflow ${workflow.id}`);
      this.logger.log(`[AUTOMATION] ========== ACTION COMPLETE ==========`);
    } catch (error) {
      this.logger.error(`[AUTOMATION] ❌ Error executing action: ${error.message}`, error);
      this.logger.error(`[AUTOMATION] Stack trace:`, error.stack);
      throw error;
    }
  }

  /**
   * Send WhatsApp message
   */
  private async sendWhatsAppMessage(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    const config = workflow.actionConfig || {};
    const message = config.message || 'Hello!';

    this.logger.log(`[WHATSAPP] ========== SENDING MESSAGE ==========`);
    this.logger.log(`[WHATSAPP] Lead ID: ${lead.id}`);
    this.logger.log(`[WHATSAPP] Lead Name: ${lead.name}`);
    this.logger.log(`[WHATSAPP] Lead Phone: ${lead.phoneNumber}`);
    this.logger.log(`[WHATSAPP] Workflow: ${workflow.name}`);
    this.logger.log(`[WHATSAPP] User ID: ${userId}`);

    if (!lead.phoneNumber) {
      this.logger.warn(`[WHATSAPP] ❌ Lead ${lead.id} has no phone number for WhatsApp`);
      return;
    }

    try {
      // Format phone number for WhatsApp using the same formatNumber logic as WhatsAppSession
      // Strips non-digits and appends @c.us (e.g. "917621987589" → "917621987589@c.us")
      const rawPhone = lead.phoneNumber.replace(/\D/g, '');
      const phoneNumber = `${rawPhone}@c.us`;

      this.logger.log(`[WHATSAPP] Formatted phone number: ${phoneNumber}`);

      // Replace template variables
      const formattedMessage = this.replaceTemplateVariables(message, lead);

      this.logger.log(`[WHATSAPP] Original message template: ${message}`);
      this.logger.log(`[WHATSAPP] Formatted message: ${formattedMessage}`);

      // Get WhatsApp session (using default profile)
      this.logger.log(`[WHATSAPP] Looking for session: userId=${userId}, profileId=default`);
      const session = findSession(userId, 'default');
      
      if (!session) {
        this.logger.error(`[WHATSAPP] ❌ WhatsApp session NOT FOUND for user ${userId}`);
        this.logger.log(`[WHATSAPP] Available sessions: Check WhatsApp connection status`);
        
        // Log activity anyway to track the attempt
        await this.leadService.addActivity(
          lead.id,
          ActivityType.WHATSAPP_SENT,
          `WhatsApp message queued via workflow: ${workflow.name} (session not connected)`,
          { message: formattedMessage, workflow: workflow.name, phoneNumber, status: 'queued', reason: 'session_not_found' },
        );
        return;
      }

      this.logger.log(`[WHATSAPP] ✅ Session found`);
      this.logger.log(`[WHATSAPP] Session status: ${session.status}`);
      this.logger.log(`[WHATSAPP] Session connected: ${session.isConnected()}`);

      if (!session.isConnected()) {
        this.logger.error(`[WHATSAPP] ❌ WhatsApp session NOT CONNECTED for user ${userId}`);
        this.logger.log(`[WHATSAPP] Session status: ${session.status}`);
        
        // Log activity anyway to track the attempt
        await this.leadService.addActivity(
          lead.id,
          ActivityType.WHATSAPP_SENT,
          `WhatsApp message queued via workflow: ${workflow.name} (session disconnected)`,
          { message: formattedMessage, workflow: workflow.name, phoneNumber, status: 'queued', reason: 'session_disconnected', sessionStatus: session.status },
        );
        return;
      }

      this.logger.log(`[WHATSAPP] ✅ Session is connected`);
      this.logger.log(`[WHATSAPP] WhatsApp client available: ${!!session.client}`);

      if (!session.client) {
        this.logger.error(`[WHATSAPP] ❌ WhatsApp client is NULL`);
        
        await this.leadService.addActivity(
          lead.id,
          ActivityType.WHATSAPP_SENT,
          `WhatsApp message failed via workflow: ${workflow.name}`,
          { 
            message: formattedMessage, 
            workflow: workflow.name, 
            phoneNumber,
            error: 'WhatsApp client is null',
            status: 'failed'
          },
        );
        return;
      }

      // Send message via WhatsApp Web.js client (same as Flow Builder)
      try {
        this.logger.log(`[WHATSAPP] 📤 Resolving number on WhatsApp: ${rawPhone}`);

        // Use getNumberId to resolve the correct WhatsApp ID (handles country code lookup)
        const numberId = await session.client!.getNumberId(rawPhone);
        if (!numberId) {
          this.logger.error(`[WHATSAPP] ❌ Number ${rawPhone} is not registered on WhatsApp`);
          await this.leadService.addActivity(
            lead.id,
            ActivityType.WHATSAPP_SENT,
            `WhatsApp message failed via workflow: ${workflow.name}`,
            {
              message: formattedMessage,
              workflow: workflow.name,
              phoneNumber,
              error: 'Number not registered on WhatsApp',
              status: 'failed',
            },
          );
          return;
        }

        const resolvedId = numberId._serialized;
        this.logger.log(`[WHATSAPP] ✅ Resolved WhatsApp ID: ${resolvedId}`);
        this.logger.log(`[WHATSAPP] 📤 Sending message to ${resolvedId}`);
        this.logger.log(`[WHATSAPP] Message content: "${formattedMessage}"`);

        await session.client!.sendMessage(resolvedId, formattedMessage);

        this.logger.log(`[WHATSAPP] ✅ WhatsApp message sent successfully to ${resolvedId}`);
      } catch (whatsappError) {
        this.logger.error(
          `[WHATSAPP] ❌ WhatsApp send error: ${whatsappError.message}`,
          whatsappError,
        );
        this.logger.error(`[WHATSAPP] Error stack:`, whatsappError.stack);
        
        // Log activity with error status
        await this.leadService.addActivity(
          lead.id,
          ActivityType.WHATSAPP_SENT,
          `WhatsApp message failed via workflow: ${workflow.name}`,
          { 
            message: formattedMessage, 
            workflow: workflow.name, 
            phoneNumber,
            error: whatsappError.message,
            errorStack: whatsappError.stack,
            status: 'failed'
          },
        );
        throw whatsappError;
      }

      // Log activity - success
      this.logger.log(`[WHATSAPP] 📝 Logging activity for lead ${lead.id}`);
      await this.leadService.addActivity(
        lead.id,
        ActivityType.WHATSAPP_SENT,
        `WhatsApp message sent via workflow: ${workflow.name}`,
        { message: formattedMessage, workflow: workflow.name, phoneNumber, status: 'sent' },
      );
      
      this.logger.log(`[WHATSAPP] ✅ Activity logged successfully`);
      this.logger.log(`[WHATSAPP] ========== MESSAGE SENT COMPLETE ==========`);
    } catch (error) {
      this.logger.error(`[WHATSAPP] ❌ Error sending WhatsApp: ${error.message}`);
      this.logger.error(`[WHATSAPP] Error stack:`, error.stack);
      throw error;
    }
  }

  /**
   * Send email message
   */
  private async sendEmailMessage(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    const config = workflow.actionConfig || {};
    const subject = config.subject || 'Message from us';
    const message = config.message || 'Hello!';

    if (!lead.email) {
      this.logger.warn(`Lead ${lead.id} has no email address`);
      return;
    }

    try {
      const formattedMessage = this.replaceTemplateVariables(message, lead);
      const formattedSubject = this.replaceTemplateVariables(subject, lead);

      await this.mailService.sendCampaignMail(
        lead.email,
        formattedSubject,
        `<p>${formattedMessage}</p>`,
      );

      this.logger.log(`Email sent to ${lead.email}`);

      // Log activity
      await this.leadService.addActivity(
        lead.id,
        ActivityType.EMAIL_SENT,
        `Email sent via workflow: ${workflow.name}`,
        { subject: formattedSubject, message: formattedMessage },
      );
    } catch (error) {
      this.logger.error(`Error sending email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add tag to lead
   */
  private async addTagToLead(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    const config = workflow.actionConfig || {};
    const tagId = config.tagId;
    const tagName = config.tagName || 'VIP';

    if (!tagId && !tagName) {
      this.logger.warn('No tag ID or name provided in workflow config');
      return;
    }

    try {
      // Add tag to lead (implementation depends on TagsService)
      this.logger.log(`Adding tag "${tagName}" to lead ${lead.id}`);

      // Log activity
      await this.leadService.addActivity(
        lead.id,
        ActivityType.TAG_ADDED,
        `Tag "${tagName}" added via workflow: ${workflow.name}`,
        { tagId, tagName },
      );
    } catch (error) {
      this.logger.error(`Error adding tag: ${error.message}`);
      throw error;
    }
  }

  /**
   * Change lead stage
   */
  private async changeLeadStage(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    const config = workflow.actionConfig || {};
    const stageId = config.stageId;

    if (!stageId) {
      this.logger.warn('No stage ID provided in workflow config');
      return;
    }

    try {
      await this.leadService.updateStage(userId, lead.id, stageId);
      this.logger.log(`Lead ${lead.id} moved to stage ${stageId}`);
    } catch (error) {
      this.logger.error(`Error changing stage: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send SMS message
   */
  private async sendSmsMessage(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    const config = workflow.actionConfig || {};
    const message = config.message || 'Hello!';

    if (!lead.phoneNumber) {
      this.logger.warn(`Lead ${lead.id} has no phone number for SMS`);
      return;
    }

    try {
      const formattedMessage = this.replaceTemplateVariables(message, lead);
      this.logger.log(`Sending SMS to ${lead.phoneNumber}: ${formattedMessage}`);

      // Log activity
      await this.leadService.addActivity(
        lead.id,
        ActivityType.EMAIL_SENT, // Using EMAIL_SENT as placeholder for SMS
        `SMS sent via workflow: ${workflow.name}`,
        { message: formattedMessage },
      );
    } catch (error) {
      this.logger.error(`Error sending SMS: ${error.message}`);
      throw error;
    }
  }

  /**
   * Call webhook
   */
  private async callWebhook(
    workflow: AutomationWorkflow,
    lead: Lead,
    userId: number,
  ): Promise<void> {
    const config = workflow.actionConfig || {};
    const webhookUrl = config.webhookUrl;

    if (!webhookUrl) {
      this.logger.warn('No webhook URL provided in workflow config');
      return;
    }

    try {
      const payload = {
        leadId: lead.id,
        leadName: lead.name,
        leadEmail: lead.email,
        leadPhone: lead.phoneNumber,
        workflow: workflow.name,
        timestamp: new Date(),
      };

      this.logger.log(`Calling webhook: ${webhookUrl}`);

      // In production, use axios or fetch to call the webhook
      // For now, just log it
      this.logger.log(`Webhook payload: ${JSON.stringify(payload)}`);

      // Log activity
      await this.leadService.addActivity(
        lead.id,
        ActivityType.AUTOMATION_TRIGGERED,
        `Webhook called via workflow: ${workflow.name}`,
        { webhookUrl, payload },
      );
    } catch (error) {
      this.logger.error(`Error calling webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Replace template variables in message
   * Supports: {name}, {email}, {phone}, {orderValue}, {orderCount}
   */
  private replaceTemplateVariables(template: string, lead: Lead): string {
    let message = template;

    message = message.replace(/{name}/g, lead.name || '');
    message = message.replace(/{email}/g, lead.email || '');
    message = message.replace(/{phone}/g, lead.phoneNumber || '');
    message = message.replace(/{orderValue}/g, lead.totalOrderValue?.toString() || '0');
    message = message.replace(/{orderCount}/g, lead.orderCount?.toString() || '0');

    return message;
  }
}
