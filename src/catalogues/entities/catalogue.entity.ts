import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CatalogueProduct } from './catalogue-product.entity';

export enum CatalogueStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SYNCING = 'syncing',
}

export enum CatalogueSource {
  MANUAL = 'manual',
  SHOPIFY = 'shopify',
  WOOCOMMERCE = 'woocommerce',
}

@Entity('catalogues')
export class Catalogue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: CatalogueStatus,
    default: CatalogueStatus.ACTIVE,
  })
  status: CatalogueStatus;

  @Column({
    type: 'enum',
    enum: CatalogueSource,
    default: CatalogueSource.MANUAL,
  })
  source: CatalogueSource;

  /**
   * Linked ecommerce integration ID (Shopify / WooCommerce).
   * Null for manually created catalogues.
   */
  @Column({ nullable: true })
  integrationId: number;

  /** Currency code, e.g. "USD", "INR" */
  @Column({ default: 'USD' })
  currency: string;

  /** Cover image URL */
  @Column({ nullable: true })
  coverImageUrl: string;

  /** Last time products were synced from the ecommerce platform */
  @Column({ nullable: true })
  lastSyncedAt: Date;

  @OneToMany(() => CatalogueProduct, (product) => product.catalogue, {
    cascade: true,
  })
  products: CatalogueProduct[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
