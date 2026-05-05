import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TriggerType {
  NEW_ORDER = 'new_order',
  ORDER_SHIPPED = 'order_shipped',
  NO_PURCHASE_DAYS = 'no_purchase_days',
  HIGH_VALUE_ORDER = 'high_value_order',
  STAGE_CHANGED = 'stage_changed',
  TAG_ADDED = 'tag_added',
  CUSTOM = 'custom',
}

export enum ActionType {
  SEND_WHATSAPP = 'send_whatsapp',
  SEND_EMAIL = 'send_email',
  ADD_TAG = 'add_tag',
  CHANGE_STAGE = 'change_stage',
  SEND_SMS = 'send_sms',
  WEBHOOK_CALL = 'webhook_call',
}

export enum WorkflowStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED = 'paused',
}

@Entity('automation_workflows')
export class AutomationWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: TriggerType,
  })
  triggerType: TriggerType;

  @Column({ type: 'json' })
  triggerConditions: Record<string, any>; // e.g., { minOrderValue: 1000, daysNoOrder: 30 }

  @Column({
    type: 'enum',
    enum: ActionType,
  })
  actionType: ActionType;

  @Column({ type: 'json' })
  actionConfig: Record<string, any>; // e.g., { templateId: 1, message: "..." }

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.ACTIVE,
  })
  status: WorkflowStatus;

  @Column({ type: 'boolean', default: false })
  runOnce: boolean; // If true, only trigger once per lead

  @Column({ type: 'int', nullable: true })
  delayMinutes: number; // Delay before executing action

  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
