import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { TickerEntity } from '../../tickers/entities/ticker.entity';

@Entity('stocktwits_analyses')
export class StocktwitsAnalysis {
  @ApiProperty({ example: 'uuid-v4', description: 'Unique ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '1' })
  @Column({ type: 'bigint' })
  ticker_id: string;

  @ManyToOne(() => TickerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticker_id' })
  ticker: TickerEntity;

  @ApiProperty({ example: 'AAPL' })
  @Index()
  @Column()
  symbol: string;

  @ApiProperty({ example: 0.75 })
  @Column({ type: 'numeric' })
  sentiment_score: number;

  @ApiProperty({ example: 'Bullish' })
  @Column({ type: 'text' })
  sentiment_label: string;

  @ApiProperty({ example: 150 })
  @Column({ type: 'int' })
  posts_analyzed: number;

  @ApiProperty({ example: 0.8 })
  @Column({ type: 'numeric' })
  weighted_sentiment_score: number;

  @ApiProperty({ example: 'Users are excited about the new iPhone...' })
  @Column({ type: 'text' })
  summary: string;

  @ApiProperty({ example: 'gemini-1.5-pro' })
  @Column({ type: 'text' })
  model_used: string;

  @ApiProperty({ example: 4500 })
  @Column({ type: 'int', nullable: true })
  tokens_used: number;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  analysis_start: Date;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  analysis_end: Date;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb' })
  highlights: {
    topics: string[];
    top_mentions: string[];
    bullish_points: string[];
    bearish_points: string[];
  };

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb' })
  extracted_events: any[];

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
