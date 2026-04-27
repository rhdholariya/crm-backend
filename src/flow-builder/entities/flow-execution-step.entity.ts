import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FlowExecution } from './flow-execution.entity';

export enum StepStatus {
  EXECUTED = 'executed',
  SKIPPED = 'skipped',
  FAILED = 'failed',
  WAITING = 'waiting',
}

@Entity('flow_execution_steps')
export class FlowExecutionStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  executionId: number;

  @ManyToOne(() => FlowExecution, (exec) => exec.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'executionId' })
  execution: FlowExecution;

  @Column()
  nodeKey: string;

  @Column()
  nodeType: string;

  @Column({ type: 'enum', enum: StepStatus, default: StepStatus.EXECUTED })
  status: StepStatus;

  // Input that arrived at this node
  @Column({ type: 'jsonb', nullable: true })
  input: Record<string, any>;

  // Output/result from this node
  @Column({ type: 'jsonb', nullable: true })
  output: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  // Duration in ms
  @Column({ type: 'int', nullable: true })
  durationMs: number;

  @CreateDateColumn()
  executedAt: Date;
}
