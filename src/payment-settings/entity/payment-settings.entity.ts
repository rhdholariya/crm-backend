import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('payment_settings')
export class PaymentSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'text' })
  value: string;
}
