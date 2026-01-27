import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('exchange_rates')
export class ExchangeRateEntity {
  @PrimaryColumn()
  currency_code: string;

  @Column('float')
  rate_to_usd: number;

  @UpdateDateColumn()
  last_updated: Date;
}
