import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('analyst_ratings')
export class AnalystRating {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '1' })
  @Column({ type: 'bigint' })
  symbol_id: string;

  @ApiProperty({ example: 'Morgan Stanley' })
  @Column({ type: 'text' })
  firm: string;

  @ApiProperty({ example: 'Adam Jonas', required: false })
  @Column({ type: 'text', nullable: true })
  analyst_name: string;

  @ApiProperty({ example: 'Buy' })
  @Column({ type: 'text' })
  rating: string;

  @ApiProperty({ example: 150.0, required: false })
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  price_target: number;

  @ApiProperty({ example: '2023-12-01' })
  @Column({ type: 'date' })
  rating_date: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
