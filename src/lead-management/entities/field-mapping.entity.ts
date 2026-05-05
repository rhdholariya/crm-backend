import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { EcommerceIntegration } from './ecommerce-integration.entity';

export enum WebhookEventType {
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',
  ORDER_SHIPPED = 'order_shipped',
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_UPDATED = 'customer_updated',
}

@Entity('field_mappings')
export class FieldMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => EcommerceIntegration, { onDelete: 'CASCADE' })
  integration: EcommerceIntegration;

  @Column()
  integrationId: number;

  @Column({
    type: 'enum',
    enum: WebhookEventType,
  })
  eventType: WebhookEventType;

  @Column()
  externalFieldPath: string; // e.g., "customer.email", "line_items[0].title"

  @Column()
  leadFieldName: string; // e.g., "email", "productName"

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ type: 'text', nullable: true })
  transformationLogic: string; // JSON or code snippet for data transformation

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
