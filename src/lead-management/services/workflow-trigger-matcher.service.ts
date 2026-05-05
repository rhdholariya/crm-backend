import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationWorkflow, TriggerType, WorkflowStatus } from '../entities/automation-workflow.entity';
import { Lead } from '../entities/lead.entity';

@Injectable()
export class WorkflowTriggerMatcherService {
  private readonly logger = new Logger(WorkflowTriggerMatcherService.name);

  constructor(
    @InjectRepository(AutomationWorkflow)
    private workflowRepository: Repository<AutomationWorkflow>,
  ) {}

  /**
   * Get all workflows that should trigger for a given lead and trigger type
   */
  async getMatchingWorkflows(
    userId: number,
    lead: Lead,
    triggerType: TriggerType,
  ): Promise<AutomationWorkflow[]> {
    this.logger.log(`[WORKFLOW-MATCHER] Looking for workflows: userId=${userId}, triggerType=${triggerType}`);
    
    const workflows = await this.workflowRepository.find({
      where: {
        userId,
        triggerType,
        status: WorkflowStatus.ACTIVE,
      },
    });

    this.logger.log(`[WORKFLOW-MATCHER] Found ${workflows.length} workflows with matching trigger type`);
    
    if (workflows.length === 0) {
      this.logger.warn(`[WORKFLOW-MATCHER] ⚠️ No workflows found for userId=${userId}, triggerType=${triggerType}`);
      return [];
    }

    const matched = workflows.filter((workflow) => {
      const matches = this.matchesTriggerConditions(lead, workflow, triggerType);
      this.logger.log(`[WORKFLOW-MATCHER] Workflow ${workflow.id} (${workflow.name}): matches=${matches}`);
      return matches;
    });

    this.logger.log(`[WORKFLOW-MATCHER] ✅ ${matched.length} workflows matched conditions`);
    return matched;
  }

  /**
   * Check if lead matches workflow trigger conditions
   */
  private matchesTriggerConditions(
    lead: Lead,
    workflow: AutomationWorkflow,
    triggerType: TriggerType,
  ): boolean {
    const conditions = workflow.triggerConditions || {};

    this.logger.log(`[WORKFLOW-MATCHER] Checking conditions for workflow ${workflow.id}`);
    this.logger.log(`[WORKFLOW-MATCHER] Lead: id=${lead.id}, name=${lead.name}, totalOrderValue=${lead.totalOrderValue}`);
    this.logger.log(`[WORKFLOW-MATCHER] Trigger type: ${triggerType}`);
    this.logger.log(`[WORKFLOW-MATCHER] Conditions: ${JSON.stringify(conditions)}`);

    switch (triggerType) {
      case TriggerType.NEW_ORDER:
        this.logger.log(`[WORKFLOW-MATCHER] NEW_ORDER trigger - always matches`);
        return this.matchesNewOrderConditions(lead, conditions);

      case TriggerType.ORDER_SHIPPED:
        this.logger.log(`[WORKFLOW-MATCHER] ORDER_SHIPPED trigger - always matches`);
        return this.matchesOrderShippedConditions(lead, conditions);

      case TriggerType.NO_PURCHASE_DAYS:
        this.logger.log(`[WORKFLOW-MATCHER] NO_PURCHASE_DAYS trigger`);
        return this.matchesNoPurchaseDaysConditions(lead, conditions);

      case TriggerType.HIGH_VALUE_ORDER:
        this.logger.log(`[WORKFLOW-MATCHER] HIGH_VALUE_ORDER trigger - checking minOrderValue=${conditions.minOrderValue}`);
        return this.matchesHighValueOrderConditions(lead, conditions);

      case TriggerType.STAGE_CHANGED:
        this.logger.log(`[WORKFLOW-MATCHER] STAGE_CHANGED trigger`);
        return this.matchesStageChangedConditions(lead, conditions);

      case TriggerType.TAG_ADDED:
        this.logger.log(`[WORKFLOW-MATCHER] TAG_ADDED trigger`);
        return this.matchesTagAddedConditions(lead, conditions);

      case TriggerType.CUSTOM:
        this.logger.log(`[WORKFLOW-MATCHER] CUSTOM trigger`);
        return this.matchesCustomConditions(lead, conditions);

      default:
        this.logger.warn(`[WORKFLOW-MATCHER] Unknown trigger type: ${triggerType}`);
        return false;
    }
  }

  /**
   * Match NEW_ORDER trigger
   * Triggers for any new order
   */
  private matchesNewOrderConditions(lead: Lead, conditions: Record<string, any>): boolean {
    // Always trigger for new orders
    return true;
  }

  /**
   * Match ORDER_SHIPPED trigger
   * Triggers for any shipped order
   */
  private matchesOrderShippedConditions(lead: Lead, conditions: Record<string, any>): boolean {
    // Always trigger for shipped orders
    return true;
  }

  /**
   * Match NO_PURCHASE_DAYS trigger
   * Triggers if lead hasn't purchased in X days
   */
  private matchesNoPurchaseDaysConditions(
    lead: Lead,
    conditions: Record<string, any>,
  ): boolean {
    const daysNoOrder = conditions.daysNoOrder;

    if (!daysNoOrder || !lead.lastPurchaseDate) {
      return false;
    }

    const daysSincePurchase = Math.floor(
      (Date.now() - lead.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    return daysSincePurchase >= daysNoOrder;
  }

  /**
   * Match HIGH_VALUE_ORDER trigger
   * Triggers if order value exceeds minimum
   */
  private matchesHighValueOrderConditions(
    lead: Lead,
    conditions: Record<string, any>,
  ): boolean {
    const minOrderValue = conditions.minOrderValue;

    if (!minOrderValue || !lead.totalOrderValue) {
      return false;
    }

    return lead.totalOrderValue >= minOrderValue;
  }

  /**
   * Match STAGE_CHANGED trigger
   * Triggers if lead is in specific stage
   */
  private matchesStageChangedConditions(
    lead: Lead,
    conditions: Record<string, any>,
  ): boolean {
    const stageId = conditions.stageId;

    if (!stageId) {
      return true; // Trigger for any stage change
    }

    return lead.stageId === stageId;
  }

  /**
   * Match TAG_ADDED trigger
   * Triggers if lead has specific tag
   */
  private matchesTagAddedConditions(lead: Lead, conditions: Record<string, any>): boolean {
    const tagId = conditions.tagId;

    if (!tagId || !lead.tags || lead.tags.length === 0) {
      return true; // Trigger for any tag addition
    }

    return lead.tags.some((tag) => tag.id === tagId);
  }

  /**
   * Match CUSTOM trigger
   * Triggers based on custom logic
   */
  private matchesCustomConditions(lead: Lead, conditions: Record<string, any>): boolean {
    // Custom conditions can be implemented based on specific business logic
    // For now, always trigger
    return true;
  }

  /**
   * Check if workflow should run only once per lead
   */
  shouldRunOnce(workflow: AutomationWorkflow): boolean {
    return workflow.runOnce || false;
  }

  /**
   * Get delay before execution (in milliseconds)
   */
  getExecutionDelay(workflow: AutomationWorkflow): number {
    const delayMinutes = workflow.delayMinutes || 0;
    return delayMinutes * 60 * 1000;
  }
}
