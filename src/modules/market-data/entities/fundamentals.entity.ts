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
  market_cap: number;

  @ApiProperty({ example: 28.5, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  pe_ttm: number;

  @ApiProperty({ example: 6.5, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  eps_ttm: number;

  @ApiProperty({ example: 0.005, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  dividend_yield: number;

  @ApiProperty({ example: 1.2, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  beta: number;

  @ApiProperty({ example: 1.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  debt_to_equity: number;

  @ApiProperty({ example: 1000000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24, // Large numbers for Revenue
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  revenue_ttm: number;

  @ApiProperty({ example: 0.45, required: false })
  @Column({
    type: 'numeric',
    precision: 10, // Ratios/Percentages
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  gross_margin: number;

  @ApiProperty({ example: 0.20, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  net_profit_margin: number;

  @ApiProperty({ example: 0.25, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  operating_margin: number;

  @ApiProperty({ example: 0.15, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  roe: number;

  @ApiProperty({ example: 0.10, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  roa: number;

  @ApiProperty({ example: 5.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  price_to_book: number;

  @ApiProperty({ example: 15.0, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  book_value_per_share: number;

  @ApiProperty({ example: 50000000, required: false })
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  free_cash_flow_ttm: number;

  @ApiProperty({ example: 0.12, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  earnings_growth_yoy: number;

  @ApiProperty({ example: 1.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  current_ratio: number;

  @ApiProperty({ example: 1.0, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  quick_ratio: number;

  @ApiProperty({ example: 8.0, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  interest_coverage: number;

  @ApiProperty({ example: 0.5, required: false })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  debt_to_assets: number;

  @ApiProperty({ example: 'Technology', required: false })
  @Column({ type: 'text', nullable: true })
  sector: string;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
