import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './entities/lead.entity';
import { Pipeline } from './entities/pipeline.entity';
import { PipelineStage } from './entities/pipeline-stage.entity';
import { LeadActivity } from './entities/lead-activity.entity';
import { EcommerceIntegration } from './entities/ecommerce-integration.entity';
import { FieldMapping } from './entities/field-mapping.entity';
import { AutomationWorkflow } from './entities/automation-workflow.entity';

import { LeadService } from './services/lead.service';
import { PipelineService } from './services/pipeline.service';
import { PipelineStageService } from './services/pipeline-stage.service';
import { EcommerceIntegrationService } from './services/ecommerce-integration.service';
import { FieldMappingService } from './services/field-mapping.service';
import { AutomationWorkflowService } from './services/automation-workflow.service';
import { ShopifyWebhookService } from './services/shopify-webhook.service';import { WooCommerceWebhookService } from './services/woocommerce-webhook.service';
import { AutomationExecutorService } from './services/automation-executor.service';
import { WorkflowTriggerMatcherService } from './services/workflow-trigger-matcher.service';

import { LeadController } from './controllers/lead.controller';
import { PipelineController } from './controllers/pipeline.controller';
import { PipelineStageController } from './controllers/pipeline-stage.controller';
import { EcommerceIntegrationController } from './controllers/ecommerce-integration.controller';
import { FieldMappingController } from './controllers/field-mapping.controller';
import { WebhookController } from './controllers/webhook.controller';

// Import external modules
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { TagsModule } from '../tags/tags.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      Pipeline,
      PipelineStage,
      LeadActivity,
      EcommerceIntegration,
      FieldMapping,
      AutomationWorkflow,
    ]),
    WhatsAppModule,
    TagsModule,
    ContactsModule,
    CommonModule,
  ],
  providers: [
    LeadService,
    PipelineService,
    PipelineStageService,
    EcommerceIntegrationService,
    FieldMappingService,
    AutomationWorkflowService,
    ShopifyWebhookService,
    WooCommerceWebhookService,
    AutomationExecutorService,
    WorkflowTriggerMatcherService,
  ],
  controllers: [
    LeadController,
    PipelineController,
    PipelineStageController,
    EcommerceIntegrationController,
    FieldMappingController,
    WebhookController,
  ],
  exports: [
    LeadService,
    PipelineService,
    PipelineStageService,
    EcommerceIntegrationService,
    FieldMappingService,
    AutomationWorkflowService,
    AutomationExecutorService,
    WorkflowTriggerMatcherService,
  ],
})
export class LeadManagementModule {}
