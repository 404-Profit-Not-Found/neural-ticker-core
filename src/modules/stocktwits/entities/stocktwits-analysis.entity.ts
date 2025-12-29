import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { TickerEntity } from '../../tickers/entities/ticker.entity';

@Entity('stocktwits_analyses')
export class StockTwitsAnalysis {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Foreign Key to Ticker ---
  @ApiProperty({ example: '1' })
  @Column({ type: 'bigint' })
  ticker_id: string;

  @ManyToOne(() => TickerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticker_id' })
  ticker: TickerEntity;

  // Denormalized for query performance (indexed)
  @ApiProperty({ example: 'AAPL' })
  @Index()
  @Column()
  symbol: string;

  // Time window analyzed
  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  @Column({ type: 'timestamptz' })
  analysis_start: Date;

  @ApiProperty({ example: '2025-01-01T04:00:00Z' })
  @Column({ type: 'timestamptz' })
  analysis_end: Date;

  // Aggregate Sentiment (-1.0 to 1.0)
  @ApiProperty({
    example: 0.65,
    description: 'Sentiment score from -1.0 (bearish) to 1.0 (bullish)',
  })
  @Column({ type: 'numeric', precision: 4, scale: 3 })
  sentiment_score: number;

  // Sentiment label: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH'
  @ApiProperty({
    example: 'BULLISH',
    enum: ['VERY_BULLISH', 'BULLISH', 'NEUTRAL', 'BEARISH', 'VERY_BEARISH'],
  })
  @Column({ type: 'text' })
  sentiment_label: string;

  // Number of posts analyzed
  @ApiProperty({ example: 42 })
  @Column({ type: 'int' })
  posts_analyzed: number;

  // Weighted by follower influence
  @ApiProperty({
    example: 0.72,
    description: 'Follower-weighted sentiment score',
  })
  @Column({ type: 'numeric', precision: 4, scale: 3 })
  weighted_sentiment_score: number;

  // AI-generated summary (1-2 paragraphs)
  @ApiProperty({ example: 'Social sentiment is predominantly bullish...' })
  @Column({ type: 'text' })
  summary: string;

  // Top highlights (AI-extracted key points)
  @ApiProperty()
  @Column({ type: 'jsonb' })
  highlights: {
    text: string;
    post_id: number;
    username: string;
    followers: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  }[];

  // Extracted events/catalysts
  @ApiProperty()
  @Column({ type: 'jsonb' })
  extracted_events: {
    description: string;
    date: string | null; // ISO date or null if unknown
    type: 'earnings' | 'fda' | 'conference' | 'product' | 'lawsuit' | 'other';
    source_post_ids: number[];
  }[];

  // Model metadata
  @ApiProperty({ example: 'gemini-2.5-flash-lite' })
  @Column({ type: 'text' })
  model_used: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
