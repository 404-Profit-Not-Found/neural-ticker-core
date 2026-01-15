import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('fundamentals')
export class Fundamentals {
  @ApiProperty({ example: '1' })
  @PrimaryColumn({ type: 'bigint' })
  symbol_id: string;

  @ApiProperty({ example: 2500000000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  market_cap: number | null;

  @ApiProperty({ example: 16000000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  shares_outstanding: number | null;

  @ApiProperty({ example: 28.5, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  pe_ttm: number | null;

  @ApiProperty({ example: 25.5, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  trailing_pe: number | null;

  @ApiProperty({ example: 30.2, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  forward_pe: number | null;

  @ApiProperty({ example: 6.5, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  eps_ttm: number | null;

  @ApiProperty({ example: 0.005, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  dividend_yield: number | null;

  @ApiProperty({ example: 1.2, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  beta: number | null;

  @ApiProperty({ example: 1.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  debt_to_equity: number | null;

  @ApiProperty({ example: 1000000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24, // Large numbers for Revenue
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  revenue_ttm: number | null;

  @ApiProperty({ example: 0.45, required: false })
  @Column({
    type: 'numeric',
    precision: 10, // Ratios/Percentages
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  gross_margin: number | null;

  @ApiProperty({ example: 0.2, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  net_profit_margin: number | null;

  @ApiProperty({ example: 0.25, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  operating_margin: number | null;

  @ApiProperty({ example: 0.15, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  roe: number | null;

  @ApiProperty({ example: 0.1, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  roa: number | null;

  @ApiProperty({ example: 5.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  price_to_book: number | null;

  @ApiProperty({ example: 15.0, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  book_value_per_share: number | null;

  @ApiProperty({ example: 50000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  free_cash_flow_ttm: number | null;

  @ApiProperty({ example: 0.12, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  earnings_growth_yoy: number | null;

  @ApiProperty({ example: 1.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  current_ratio: number | null;

  @ApiProperty({ example: 1.0, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  quick_ratio: number | null;

  @ApiProperty({ example: 8.0, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  interest_coverage: number | null;

  @ApiProperty({ example: 0.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  debt_to_assets: number | null;

  @ApiProperty({ example: 500000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  net_income_ttm: number | null;

  @ApiProperty({ example: 100000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  total_debt: number | null;

  @ApiProperty({ example: 2000000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  total_assets: number | null;

  @ApiProperty({ example: 800000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  total_liabilities: number | null;

  @ApiProperty({ example: 150000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  total_cash: number | null;

  @ApiProperty({ example: '2026-03-18', required: false })
  @Column({ type: 'date', nullable: true })
  next_earnings_date: string;

  @ApiProperty({ example: -0.51, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  next_earnings_estimate_eps: number;

  @ApiProperty({ example: 'Strong Buy', required: false })
  @Column({ type: 'text', nullable: true })
  consensus_rating: string;

  @ApiProperty({ example: 'Technology', required: false })
  @Column({ type: 'text', nullable: true })
  sector: string;

  // --- Yahoo / Market Context ---
  @ApiProperty({ example: 180.5, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  fifty_two_week_high: number | null;

  @ApiProperty({ example: 120.0, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  fifty_two_week_low: number | null;

  @ApiProperty({
    description: 'Full raw metadata from Yahoo Finance',
    required: false,
  })
  @Column({ type: 'jsonb', nullable: true })
  yahoo_metadata: Record<string, any>;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
