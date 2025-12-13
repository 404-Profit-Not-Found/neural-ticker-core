import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { TickerEntity } from '../../tickers/entities/ticker.entity';

@Entity('company_news')
@Unique(['symbol_id', 'external_id']) // Prevent duplicate imports of same news item
@Index(['symbol_id', 'datetime'])
export class CompanyNews {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  symbol_id: string;

  @ManyToOne(() => TickerEntity, (ticker) => ticker.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'symbol_id' })
  ticker: TickerEntity;

  @ApiProperty({ description: 'External ID from provider (e.g. Finnhub)' })
  @Column({ type: 'bigint' })
  external_id: number;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  datetime: Date;

  @ApiProperty()
  @Column({ type: 'text' })
  headline: string;

  @ApiProperty()
  @Column({ type: 'text' })
  source: string;

  @ApiProperty()
  @Column({ type: 'text' })
  url: string;

  @ApiProperty()
  @Column({ type: 'text' })
  summary: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  image: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  related: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
