import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('fundamentals')
export class Fundamentals {
  @PrimaryColumn({ type: 'bigint' })
  symbol_id: string;

  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  market_cap: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  pe_ttm: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  eps_ttm: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  dividend_yield: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  beta: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  debt_to_equity: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
