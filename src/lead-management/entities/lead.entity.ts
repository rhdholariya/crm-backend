import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { PipelineStage } from './pipeline-stage.entity';
import { Tag } from '../../tags/entities/tag.entity';
import { LeadActivity } from './lead-activity.entity';

export enum LeadSource {
  SHOPIFY = 'shopify',
  WOOCOMMERCE = 'woocommerce',
  MANUAL = 'manual',
  IMPORT = 'import',
}

export enum CustomerType {
  PROSPECT = 'prospect',
  CUSTOMER = 'customer',
  VIP = 'vip',
  INACTIVE = 'inactive',
}

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  externalId: string; // Shopify/WooCommerce order/customer ID

  @Column({
    type: 'enum',
    enum: LeadSource,
    default: LeadSource.MANUAL,
  })
  source: LeadSource;

  @Column({
    type: 'enum',
    enum: CustomerType,
    default: CustomerType.PROSPECT,
  })
  customerType: CustomerType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalOrderValue: number;

  @Column({ type: 'int', default: 0 })
  orderCount: number;

  @Column({ nullable: true })
  lastOrderDate: Date;

  @Column({ nullable: true })
  lastPurchaseDate: Date;

  @Column({ type: 'json', nullable: true, default: () => "'[]'" })
  notesList: { id: string; text: string; createdAt: string }[];

  @Column({ type: 'json', nullable: true })
  customFields: Record<string, any>; // Store additional data from webhooks

  @ManyToOne(() => PipelineStage, (stage) => stage.leads)
  stage: PipelineStage;

  @Column()
  stageId: number;

  @ManyToMany(() => Tag, { eager: true })
  @JoinTable({
    name: 'lead_tags',
    joinColumn: { name: 'leadId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @OneToMany(() => LeadActivity, (activity) => activity.lead, {
    cascade: true,
  })
  activities: LeadActivity[];

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
