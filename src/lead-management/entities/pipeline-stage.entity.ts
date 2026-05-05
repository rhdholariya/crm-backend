import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lead } from './lead.entity';
import { Pipeline } from './pipeline.entity';

@Entity('pipeline_stages')
export class PipelineStage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pipelineId: number;

  @ManyToOne(() => Pipeline, (pipeline) => pipeline.stages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pipelineId' })
  pipeline: Pipeline;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  color: string; // Hex color for kanban card

  @Column({ type: 'int', default: 0 })
  position: number; // Order in kanban board

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Lead, (lead) => lead.stage)
  leads: Lead[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
