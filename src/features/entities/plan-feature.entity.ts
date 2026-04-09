import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Feature } from './feature.entity';

@Entity('plan_features')
@Unique(['planId', 'featureId'])
export class PlanFeature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  planId: number;

  @Column()
  featureId: number;

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ type: 'int', nullable: true })
  limitValue: number | null;

  @ManyToOne(() => Feature, (f) => f.planFeatures, { eager: true })
  @JoinColumn({ name: 'featureId' })
  feature: Feature;
}
