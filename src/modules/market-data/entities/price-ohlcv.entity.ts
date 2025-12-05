import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('price_ohlcv')
@Index(['symbol_id', 'timeframe', 'ts'], { unique: true }) // Composite Unique Index for Timescale
export class PriceOhlcv {
  @PrimaryColumn({ type: 'bigint' })
  symbol_id: string;

  @PrimaryColumn({ type: 'timestamptz' })
  ts: Date;

  @PrimaryColumn({ type: 'text' })
  timeframe: string; // '1m', '5m', '1d', etc.

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  open: number;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  high: number;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  low: number;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  close: number;

  @Column({ type: 'numeric', precision: 20, scale: 4, nullable: true })
  volume: number;

  @Column({ type: 'text' })
  source: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'inserted_at' })
  inserted_at: Date;
}
