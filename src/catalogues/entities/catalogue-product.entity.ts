import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Catalogue } from './catalogue.entity';

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'out_of_stock',
}

@Entity('catalogue_products')
export class CatalogueProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  catalogueId: number;

  @ManyToOne(() => Catalogue, (catalogue) => catalogue.products, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'catalogueId' })
  catalogue: Catalogue;

  /** External product ID from Shopify / WooCommerce */
  @Column({ nullable: true })
  externalProductId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Primary product image URL */
  @Column({ nullable: true })
  imageUrl: string;

  /** Additional image URLs */
  @Column({ type: 'json', nullable: true, default: () => "'[]'" })
  additionalImages: string[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  price: number;

  /** Compare-at / original price for showing discounts */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  compareAtPrice: number;

  @Column({ default: 'USD' })
  currency: string;

  /** SKU / product code */
  @Column({ nullable: true })
  sku: string;

  /** Product category or type */
  @Column({ nullable: true })
  category: string;

  /** Product URL on the store */
  @Column({ nullable: true })
  productUrl: string;

  /** Stock quantity; null means unlimited */
  @Column({ type: 'int', nullable: true })
  stockQuantity: number;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  /** Extra platform-specific metadata */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
