import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AutomationWorkflow,
  TriggerType,
  ActionType,
  WorkflowStatus,
} from '../entities/automation-workflow.entity';
import { CreateAutomationWorkflowDto } from '../dto/create-automation-workflow.dto';
import { Lead } from '../entities/lead.entity';

@Injectable()
export class AutomationWorkflowService {
  private readonly logger = new Logger(AutomationWorkflowService.name);

  constructor(
    @InjectRepository(AutomationWorkflow)
    private workflowRepository: Repository<AutomationWorkflow>,
  ) {}

  async create(
    userId: number,
    createWorkflowDto: CreateAutomationWorkflowDto,
  ): Promise<AutomationWorkflow> {
    const workflow = this.workflowRepository.create({
      ...createWorkflowDto,
      userId,
      status: WorkflowStatus.ACTIVE,
    });

    return this.workflowRepository.save(workflow);
  }

  async findAll(userId: number): Promise<AutomationWorkflow[]> {
    return this.workflowRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(userId: number, workflowId: number): Promise<AutomationWorkflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, userId },
    });

    if (!workflow) {
      throw new NotFoundException('Automation workflow not found');
    }

    return workflow;
  }

  async update(
    userId: number,
    workflowId: number,
    updateData: Partial<CreateAutomationWorkflowDto>,
  ): Promise<AutomationWorkflow> {
    const workflow = await this.findById(userId, workflowId);

    Object.assign(workflow, updateData);

    return this.workflowRepository.save(workflow);
  }

  async updateStatus(
    userId: number,
    workflowId: number,
    status: WorkflowStatus,
  ): Promise<AutomationWorkflow> {
    const workflow = await this.findById(userId, workflowId);
    workflow.status = status;
    return this.workflowRepository.save(workflow);
  }

  async delete(userId: number, workflowId: number): Promise<void> {
    const workflow = await this.findById(userId, workflowId);
    await this.workflowRepository.remove(workflow);
  }

  /**
   * Get workflows that should trigger for a given lead
   */
  async getTriggeredWorkflows(
    userId: number,
    lead: Lead,
    triggerType: TriggerType,
  ): Promise<AutomationWorkflow[]> {
    this.logger.log(`[AUTOMATION-SERVICE] Getting triggered workflows: userId=${userId}, triggerType=${triggerType}`);
    
    const workflows = await this.workflowRepository.find({
      where: {
        userId,
        triggerType,
        status: WorkflowStatus.ACTIVE,
      },
    });

    this.logger.log(`[AUTOMATION-SERVICE] Found ${workflows.length} active workflows with trigger type ${triggerType}`);
    
    if (workflows.length === 0) {
      this.logger.warn(`[AUTOMATION-SERVICE] ⚠️ No workflows found for userId=${userId}, triggerType=${triggerType}`);
      this.logger.warn(`[AUTOMATION-SERVICE] Check if workflows exist and are ACTIVE`);
      return [];
    }

    const matched = workflows.filter((workflow) => {
      const matches = this.matchesTriggerConditions(lead, workflow);
      this.logger.log(`[AUTOMATION-SERVICE] Workflow ${workflow.id} (${workflow.name}): matches=${matches}`);
      if (!matches) {
        this.logger.log(`[AUTOMATION-SERVICE] Workflow ${workflow.id} conditions not met`);
      }
      return matches;
    });

    this.logger.log(`[AUTOMATION-SERVICE] ✅ ${matched.length} workflows matched all conditions`);
    return matched;
  }

  /**
   * Check if lead matches workflow trigger conditions
   */
  private matchesTriggerConditions(
    lead: Lead,
    workflow: AutomationWorkflow,
  ): boolean {
    const conditions = workflow.triggerConditions || {};

    switch (workflow.triggerType) {
      case TriggerType.NEW_ORDER:
        return true; // Always trigger for new orders

      case TriggerType.ORDER_SHIPPED:
        return true; // Always trigger for shipped orders

      case TriggerType.NO_PURCHASE_DAYS:
        if (conditions.daysNoOrder && lead.lastPurchaseDate) {
          const daysSincePurchase = Math.floor(
            (Date.now() - lead.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          return daysSincePurchase >= conditions.daysNoOrder;
        }
        return false;

      case TriggerType.HIGH_VALUE_ORDER:
        if (conditions.minOrderValue && lead.totalOrderValue) {
          return lead.totalOrderValue >= conditions.minOrderValue;
        }
        return false;

      case TriggerType.STAGE_CHANGED:
        if (conditions.stageId) {
          return lead.stageId === conditions.stageId;
        }
        return true;

      case TriggerType.TAG_ADDED:
        if (conditions.tagId && lead.tags) {
          return lead.tags.some((tag) => tag.id === conditions.tagId);
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Increment execution count for a workflow
   */
  async incrementExecutionCount(workflowId: number): Promise<void> {
    await this.workflowRepository.increment(
      { id: workflowId },
      'executionCount',
      1,
    );
  }

  /**
   * Get workflows by trigger type
   */
  async getWorkflowsByTrigger(
    userId: number,
    triggerType: TriggerType,
  ): Promise<AutomationWorkflow[]> {
    return this.workflowRepository.find({
      where: {
        userId,
        triggerType,
        status: WorkflowStatus.ACTIVE,
      },
    });
  }

  /**
   * Get workflows by action type
   */
  async getWorkflowsByAction(
    userId: number,
    actionType: ActionType,
  ): Promise<AutomationWorkflow[]> {
    return this.workflowRepository.find({
      where: {
        userId,
        actionType,
        status: WorkflowStatus.ACTIVE,
      },
    });
  }
}
