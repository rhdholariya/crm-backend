import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WaQrTemplate } from './wa-qr-template.entity';

export enum WaCampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum WaRecipientType {
  ALL = 'all',
  SELECTED = 'selected',
  BY_TAGS = 'by_tags',
}

@Entity('wa_qr_campaigns')
export class WaQrCampaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column()
  templateId: number;

  @ManyToOne(() => WaQrTemplate)
  @JoinColumn({ name: 'templateId' })
  template: WaQrTemplate;

  @Column({ type: 'enum', enum: WaRecipientType, default: WaRecipientType.ALL })
  recipientType: WaRecipientType;

  @Column({ type: 'simple-array', nullable: true })
  selectedContactIds: number[];

  @Column({ type: 'simple-array', nullable: true })
  selectedTagIds: number[];

  /** Optional static params applied to all recipients e.g. { "discount": "20" } */
  @Column({ type: 'jsonb', nullable: true })
  params: Record<string, string> | null;

  @Column({ type: 'enum', enum: WaCampaignStatus, default: WaCampaignStatus.DRAFT })
  status: WaCampaignStatus;

  @Column({ default: 0 })
  totalRecipients: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
