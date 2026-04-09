// payments/entities/invoice.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

export enum InvoiceStatus {
  PAID = 'paid',
  OPEN = 'open',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  planId: number;

  @Column({ type: 'int', nullable: true, default: null })
  paymentId: number | null;

  @Column({ type: 'varchar' })
  stripeInvoiceId: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  stripeSubscriptionId: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  stripePaymentIntentId: string | null;

  @Column()
  stripeCustomerId: string;

  @Column({ type: 'enum', enum: InvoiceStatus })
  status: InvoiceStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  invoiceUrl: string | null; // hosted invoice page

  @Column({ type: 'varchar', nullable: true, default: null })
  invoicePdf: string | null; // downloadable PDF

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;
}
