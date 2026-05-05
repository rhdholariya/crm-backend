import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PipelineStage } from './pipeline-stage.entity';

export enum PipelineType {
  SALES = 'sales',
  SUPPORT = 'support',
  CUSTOM = 'custom',
}

@Entity('pipelines')
export class Pipeline {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: PipelineType,
    default: PipelineType.SALES,
  })
  type: PipelineType;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => PipelineStage, (stage) => stage.pipeline, {
    cascade: true,
    eager: true,
  })
  stages: PipelineStage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
