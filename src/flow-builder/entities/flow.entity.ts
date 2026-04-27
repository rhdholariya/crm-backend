import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { FlowNode } from './flow-node.entity';
import { FlowEdge } from './flow-edge.entity';
import { FlowExecution } from './flow-execution.entity';
import { FlowAnalytics } from './flow-analytics.entity';

export enum FlowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

export enum FlowTriggerType {
  KEYWORD = 'keyword',
  FIRST_MESSAGE = 'first_message',
  ANY_MESSAGE = 'any_message',
  BUTTON_REPLY = 'button_reply',
  SCHEDULED = 'scheduled',
  WEBHOOK = 'webhook',
  CONTACT_TAG = 'contact_tag',
}

@Entity('flows')
export class Flow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: FlowStatus, default: FlowStatus.DRAFT })
  status: FlowStatus;

  @Column({ type: 'enum', enum: FlowTriggerType, default: FlowTriggerType.KEYWORD })
  triggerType: FlowTriggerType;

  @Column({ type: 'jsonb', nullable: true })
  triggerConfig: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, any>;

  @Column({ default: false })
  isTemplate: boolean;

  @Column({ nullable: true })
  language: string;

  // Rate limiting
  @Column({ type: 'int', default: 0 })
  rateLimitPerUser: number; // seconds between re-triggers (0 = no limit)

  @Column({ type: 'int', default: 0 })
  rateLimitGlobal: number; // max triggers per minute globally

  // A/B testing
  @Column({ default: false })
  abTestingEnabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  abTestConfig: Record<string, any>;

  @OneToMany(() => FlowNode, (node) => node.flow, { cascade: true })
  nodes: FlowNode[];

  @OneToMany(() => FlowEdge, (edge) => edge.flow, { cascade: true })
  edges: FlowEdge[];

  @OneToMany(() => FlowExecution, (exec) => exec.flow)
  executions: FlowExecution[];

  @OneToMany(() => FlowAnalytics, (a) => a.flow)
  analytics: FlowAnalytics[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
