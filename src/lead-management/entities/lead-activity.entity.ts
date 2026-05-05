import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Lead } from './lead.entity';

export enum ActivityType {
  ORDER_CREATED = 'order_created',
  ORDER_SHIPPED = 'order_shipped',
  ORDER_DELIVERED = 'order_delivered',
  ORDER_CANCELLED = 'order_cancelled',
  PAYMENT_RECEIVED = 'payment_received',
  WHATSAPP_SENT = 'whatsapp_sent',
  EMAIL_SENT = 'email_sent',
  STAGE_CHANGED = 'stage_changed',
  TAG_ADDED = 'tag_added',
  NOTE_ADDED = 'note_added',
  AUTOMATION_TRIGGERED = 'automation_triggered',
}

@Entity('lead_activities')
export class LeadActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Lead, (lead) => lead.activities, { onDelete: 'CASCADE' })
  lead: Lead;

  @Column()
  leadId: number;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>; // Store additional context

  @CreateDateColumn()
  createdAt: Date;
}
