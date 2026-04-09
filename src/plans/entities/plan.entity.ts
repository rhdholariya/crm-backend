import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export type PlanInterval = 'day' | 'week' | 'month' | 'year';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'decimal', default: 0 })
  price: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isBest: boolean;

  @Column({ nullable: true })
  stripeProductId: string; // ← Stripe product id

  @Column({ nullable: true })
  stripePriceId: string; // ← Stripe price id

  @Column({
    type: 'enum',
    enum: ['day', 'week', 'month', 'year'],
    default: 'month',
  })
  interval: PlanInterval; // ← billing interval

  @DeleteDateColumn()
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
