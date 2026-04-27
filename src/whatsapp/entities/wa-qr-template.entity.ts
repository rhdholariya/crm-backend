import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// ── Enums (mirrors Meta API vocabulary) ──────────────────────────────────────

export enum QrTemplateCategory {
  MARKETING = 'MARKETING',
  UTILITY = 'UTILITY',
  AUTHENTICATION = 'AUTHENTICATION',
}

export enum QrTemplateStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum QrHeaderFormat {
  NONE = 'NONE',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum QrButtonType {
  QUICK_REPLY = 'QUICK_REPLY',
  URL = 'URL',
  PHONE_NUMBER = 'PHONE_NUMBER',
  POLL = 'POLL',
}

// ── Component sub-types (stored as JSON) ─────────────────────────────────────

export interface QrTemplateHeader {
  format: QrHeaderFormat;
  /** Text content when format=TEXT (supports {{params}}) */
  text?: string;
  /** Media URL when format=IMAGE|VIDEO|DOCUMENT */
  mediaUrl?: string;
  /** Original filename for DOCUMENT */
  filename?: string;
}

export interface QrTemplateButton {
  type: QrButtonType;
  text: string;
  /** URL for URL buttons (supports {{params}}) */
  url?: string;
  /** Phone number for PHONE_NUMBER buttons */
  phoneNumber?: string;
}

export interface QrTemplateComponents {
  header?: QrTemplateHeader;
  body: string; // supports {{paramName}} placeholders
  footer?: string;
  buttons?: QrTemplateButton[];
}

// ── Entity ────────────────────────────────────────────────────────────────────

@Entity('wa_qr_templates')
export class WaQrTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  /** Human-readable name, unique per user */
  @Column()
  name: string;

  @Column({ nullable: true })
  language: string;

  @Column({
    type: 'enum',
    enum: QrTemplateCategory,
    default: QrTemplateCategory.UTILITY,
  })
  category: QrTemplateCategory;

  @Column({
    type: 'enum',
    enum: QrTemplateStatus,
    default: QrTemplateStatus.DRAFT,
  })
  status: QrTemplateStatus;

  /**
   * Full component tree stored as JSON — mirrors Meta API structure:
   * { header?, body, footer?, buttons? }
   */
  @Column({ type: 'jsonb' })
  components: QrTemplateComponents;

  /** Extracted {{paramName}} list from all text fields */
  @Column({ type: 'simple-array', nullable: true })
  parameters: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
