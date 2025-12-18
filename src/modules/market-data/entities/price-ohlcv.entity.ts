import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('price_ohlcv')
@Index(['symbol_id', 'timeframe', 'ts'], { unique: true }) // Composite Unique Index for Timescale
export class PriceOhlcv {
  @ApiProperty({ example: '1' })
  @PrimaryColumn({ type: 'bigint' })
  symbol_id: string;

  @ApiProperty({ example: '2023-10-27T00:00:00.000Z' })
  @PrimaryColumn({ type: 'datetime' })
  ts: Date;

  @ApiProperty({ example: '1d' })
  @PrimaryColumn({ type: 'text' })
  timeframe: string; // '1m', '5m', '1d', etc.

  @ApiProperty({ example: 150.0 })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  open: number;

  @ApiProperty({ example: 155.0 })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  high: number;

  @ApiProperty({ example: 149.5 })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  low: number;

  @ApiProperty({ example: 152.0 })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  close: number;

  @ApiProperty({ example: 148.0 })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  prevClose: number;

  @ApiProperty({ example: 50000000, required: false })
  @Column({
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  volume: number;

  @ApiProperty({ example: 'finnhub', description: 'Source of the data' })
  @Column({ type: 'text' })
  source: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime', name: 'inserted_at' })
  inserted_at: Date;
}
