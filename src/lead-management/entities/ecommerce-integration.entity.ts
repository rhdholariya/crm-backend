import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum IntegrationPlatform {
  SHOPIFY = 'shopify',
  WOOCOMMERCE = 'woocommerce',
}

export enum IntegrationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

@Entity('ecommerce_integrations')
export class EcommerceIntegration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: IntegrationPlatform,
  })
  platform: IntegrationPlatform;

  @Column()
  storeName: string;

  @Column({ nullable: true })
  storeUrl: string;

  @Column()
  apiKey: string; // Encrypted

  @Column({ nullable: true })
  apiSecret: string; // Encrypted (for Shopify)

  @Column({ nullable: true })
  webhookSecret: string; // For webhook verification

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    default: IntegrationStatus.ACTIVE,
  })
  status: IntegrationStatus;

  @Column({ type: 'json', nullable: true })
  webhookEvents: string[]; // ['orders/create', 'orders/update', etc.]

  @Column({ type: 'text', nullable: true })
  lastError: string;

  @Column({ nullable: true })
  lastSyncDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
