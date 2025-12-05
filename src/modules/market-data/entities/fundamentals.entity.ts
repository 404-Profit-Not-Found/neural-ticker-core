import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('fundamentals')
export class Fundamentals {
  @ApiProperty({ example: '1' })
  @PrimaryColumn({ type: 'bigint' })
  symbol_id: string;

  @ApiProperty({ example: 2500000000000, required: false })
  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  market_cap: number;

  @ApiProperty({ example: 28.5, required: false })
  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  pe_ttm: number;

  @ApiProperty({ example: 6.5, required: false })
  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  eps_ttm: number;

  @ApiProperty({ example: 0.005, required: false })
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  dividend_yield: number;

  @ApiProperty({ example: 1.2, required: false })
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  beta: number;

  @ApiProperty({ example: 1.5, required: false })
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  debt_to_equity: number;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
