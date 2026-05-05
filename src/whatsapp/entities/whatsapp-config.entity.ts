import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whatsapp_configs')
export class WhatsAppConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  /** Meta App ID */
  @Column({ nullable: true })
  whatsAppAppId: string;

  /** Meta App access token (permanent or temporary) */
  @Column({ nullable: true })
  accessToken: string;

  /** Phone Number ID from Meta Business dashboard */
  @Column({ nullable: true })
  phoneNumberId: string;

  /** WhatsApp Business Account ID */
  @Column({ nullable: true })
  wabaId: string;

  /** Webhook verify token */
  @Column({ nullable: true })
  webhookVerifyToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
