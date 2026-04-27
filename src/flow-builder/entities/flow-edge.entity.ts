import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Flow } from './flow.entity';

@Entity('flow_edges')
export class FlowEdge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flowId: number;

  @ManyToOne(() => Flow, (flow) => flow.edges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flowId' })
  flow: Flow;

  // Source node key
  @Column()
  sourceNodeKey: string;

  // Target node key
  @Column()
  targetNodeKey: string;

  // Handle/port on source node (e.g. 'yes', 'no', 'default', 'option_1')
  @Column({ nullable: true })
  sourceHandle: string;

  // Label shown on the edge in UI
  @Column({ nullable: true })
  label: string;

  // Condition expression (for conditional edges)
  @Column({ type: 'jsonb', nullable: true })
  condition: Record<string, any>;

  // UI metadata (edge style, color)
  @Column({ type: 'jsonb', nullable: true })
  uiMeta: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
