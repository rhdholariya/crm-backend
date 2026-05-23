import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flow } from './entities/flow.entity';
import { FlowNode } from './entities/flow-node.entity';
import { FlowEdge } from './entities/flow-edge.entity';
import { FlowExecution } from './entities/flow-execution.entity';
import { FlowExecutionStep } from './entities/flow-execution-step.entity';
import { FlowAnalytics } from './entities/flow-analytics.entity';
import { FlowRateLimit } from './entities/flow-rate-limit.entity';
import { AutomationWorkflow } from '../lead-management/entities/automation-workflow.entity';
import { FlowBuilderService } from './flow-builder.service';
import { FlowBuilderController } from './flow-builder.controller';
import { FlowValidatorService } from './flow-validator.service';
import { FlowTemplateService } from './flow-template.service';
import { FlowExecutorService } from './flow-executor.service';
import { AutomationWorkflowService } from '../lead-management/services/automation-workflow.service';
import { AiChatbotModule } from '../ai-chatbot/ai-chatbot.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Flow,
      FlowNode,
      FlowEdge,
      FlowExecution,
      FlowExecutionStep,
      FlowAnalytics,
      FlowRateLimit,
      AutomationWorkflow,
    ]),
    AiChatbotModule,
    ContactsModule,
  ],
  controllers: [FlowBuilderController],
  providers: [
    FlowBuilderService,
    FlowValidatorService,
    FlowTemplateService,
    FlowExecutorService,
    AutomationWorkflowService,
  ],
  exports: [
    FlowBuilderService,
    FlowValidatorService,
    FlowTemplateService,
    FlowExecutorService,
    AutomationWorkflowService,
  ],
})
export class FlowBuilderModule {}
