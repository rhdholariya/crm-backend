import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('flow_rate_limits')
export class FlowRateLimit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flowId: number;

  // Phone number or chatId of the contact
  @Column()
  contactIdentifier: string;

  @Column()
  lastTriggeredAt: Date;

  @Column({ type: 'int', default: 0 })
  triggerCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
