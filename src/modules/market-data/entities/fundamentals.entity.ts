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

  @ApiProperty({ example: 'Technology', required: false })
  @Column({ type: 'text', nullable: true })
  sector: string;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
