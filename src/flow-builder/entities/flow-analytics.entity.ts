import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Flow } from './flow.entity';

@Entity('flow_analytics')
export class FlowAnalytics {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flowId: number;

  @ManyToOne(() => Flow, (flow) => flow.analytics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flowId' })
  flow: Flow;

  @Column()
  userId: number;

  // Aggregated daily stats
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  totalTriggers: number;

  @Column({ type: 'int', default: 0 })
  totalCompleted: number;

  @Column({ type: 'int', default: 0 })
  totalFailed: number;

  @Column({ type: 'int', default: 0 })
  totalDropped: number;

  // Per-node drop-off counts: { nodeKey: count }
  @Column({ type: 'jsonb', nullable: true })
  nodeDropOff: Record<string, number>;

  // Per-node conversion counts
  @Column({ type: 'jsonb', nullable: true })
  nodeConversions: Record<string, number>;

  // A/B variant performance: { variantA: { completed, dropped }, variantB: {...} }
  @Column({ type: 'jsonb', nullable: true })
  abStats: Record<string, any>;

  // Average completion time in seconds
  @Column({ type: 'float', nullable: true })
  avgCompletionTimeSec: number;

  @CreateDateColumn()
  createdAt: Date;
}
