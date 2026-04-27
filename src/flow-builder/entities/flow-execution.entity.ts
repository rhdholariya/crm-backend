import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Flow } from './flow.entity';
import { FlowExecutionStep } from './flow-execution-step.entity';

export enum ExecutionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WAITING_INPUT = 'waiting_input',
  TIMED_OUT = 'timed_out',
  SIMULATED = 'simulated',
}

@Entity('flow_executions')
export class FlowExecution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flowId: number;

  @ManyToOne(() => Flow, (flow) => flow.executions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flowId' })
  flow: Flow;

  @Column()
  userId: number;

  // The contact/chat that triggered this execution
  @Column({ nullable: true })
  contactPhone: string;

  @Column({ nullable: true })
  chatId: string;

  @Column({ type: 'enum', enum: ExecutionStatus, default: ExecutionStatus.RUNNING })
  status: ExecutionStatus;

  // Current node the execution is waiting at
  @Column({ nullable: true })
  currentNodeKey: string;

  // Runtime variables (template vars resolved per contact)
  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, any>;

  // A/B variant assigned to this execution
  @Column({ nullable: true })
  abVariant: string;

  // Whether this is a test/simulation run
  @Column({ default: false })
  isSimulation: boolean;

  // Error info if failed
  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  completedAt: Date;

  @OneToMany(() => FlowExecutionStep, (step) => step.execution, { cascade: true })
  steps: FlowExecutionStep[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
