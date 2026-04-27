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

  /** Meta template ID returned after submission */
  @Column({ nullable: true })
  metaTemplateId: string;

  /** Meta rejection reason if status = rejected */
  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  /** Optional header text */
  @Column({ nullable: true })
  headerText: string;

  /** Optional footer text */
  @Column({ nullable: true })
  footerText: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
