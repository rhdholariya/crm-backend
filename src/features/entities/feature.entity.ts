import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PlanFeature } from './plan-feature.entity';

@Entity('features')
export class Feature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', nullable: true, default: null })
  defaultLimit: number | null;

  @OneToMany(() => PlanFeature, (pf) => pf.feature)
  planFeatures: PlanFeature[];
}
