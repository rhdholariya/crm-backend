import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RecipientStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('campaign_recipients')
export class CampaignRecipient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  campaignId: number;

  @Column()
  contactId: number;

  @Column()
  email: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: RecipientStatus,
    default: RecipientStatus.PENDING,
  })
  status: RecipientStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
