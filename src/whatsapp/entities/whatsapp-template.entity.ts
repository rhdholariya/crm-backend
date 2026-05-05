import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateType {
  REGULAR = 'regular',
  META = 'meta',
}

export enum TemplateStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum TemplateCategory {
  MARKETING = 'MARKETING',
  UTILITY = 'UTILITY',
  AUTHENTICATION = 'AUTHENTICATION',
}

export enum HeaderFormat {
  NONE = 'NONE',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum ButtonType {
  QUICK_REPLY = 'QUICK_REPLY',
  URL = 'URL',
  PHONE_NUMBER = 'PHONE_NUMBER',
  COPY_CODE = 'COPY_CODE',
}

export interface TemplateHeader {
  format: HeaderFormat;
  text?: string; // For TEXT format
  mediaUrl?: string; // For IMAGE, VIDEO, DOCUMENT
  filename?: string; // For DOCUMENT
}

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string; // For URL buttons
  phoneNumber?: string; // For PHONE_NUMBER buttons
  code?: string; // For COPY_CODE buttons
}

export interface TemplateComponents {
  type: string; // "HEADER", "BODY", "FOOTER", "BUTTONS"
  format?: HeaderFormat;
  text?: string;
  example?: any;
  buttons?: any[];
}

@Entity('whatsapp_templates')
export class WhatsAppTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  language: string;

  @Column({ type: 'text' })
  body: string;

  /** Extracted parameter names e.g. ["firstName","lastName"] */
  @Column({ type: 'simple-array', nullable: true })
  parameters: string[];

  @Column({ type: 'enum', enum: TemplateType, default: TemplateType.REGULAR })
  type: TemplateType;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.DRAFT,
  })
  status: TemplateStatus;

  @Column({
    type: 'enum',
    enum: TemplateCategory,
    nullable: true,
  })
  category: TemplateCategory;

  /** Full component tree stored as JSON array — mirrors Meta API structure */
  @Column({ type: 'jsonb', nullable: true })
  components: TemplateComponents[];

  /** Meta template ID returned after submission */
  @Column({ nullable: true })
  metaTemplateId: string;

  /** Meta rejection reason if status = rejected */
  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
