import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EmailTemplate } from '../../email-templates/entities/email-template.entity';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum RecipientType {
  ALL = 'all',
  SELECTED = 'selected',
  BY_TAGS = 'by_tags',
}

@Entity('email_campaigns')
export class EmailCampaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column()
  templateId: number;

  @ManyToOne(() => EmailTemplate)
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @Column({
    type: 'enum',
    enum: RecipientType,
    default: RecipientType.ALL,
  })
  recipientType: RecipientType;

  @Column({ type: 'simple-array', nullable: true })
  selectedContactIds: number[];

  @Column({ type: 'simple-array', nullable: true })
  selectedTagIds: number[];

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status: CampaignStatus;

  @Column({ default: 0 })
  totalRecipients: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
