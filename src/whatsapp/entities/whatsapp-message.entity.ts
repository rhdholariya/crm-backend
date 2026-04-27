import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageChannel {
  QR = 'qr',
  META = 'meta',
}

@Entity('whatsapp_messages')
@Index(['userId', 'chatId'])
export class WhatsAppMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  /** The WhatsApp chat/contact JID or phone number */
  @Column()
  chatId: string;

  @Column({ nullable: true })
  externalMessageId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: 'text' })
  messageType: string;

  @Column({ type: 'enum', enum: MessageDirection })
  direction: MessageDirection;

  @Column({ type: 'enum', enum: MessageChannel, default: MessageChannel.QR })
  channel: MessageChannel;

  /** Template used (if any) */
  @Column({ nullable: true })
  templateId: number;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  mediaUrl: string;

  @Column({ nullable: true })
  mediaMimetype: string;

  @Column({ type: 'bigint', nullable: true })
  timestamp: number;

  @CreateDateColumn()
  createdAt: Date;
}
