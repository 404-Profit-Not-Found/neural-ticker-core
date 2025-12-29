import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { TickerEntity } from '../../tickers/entities/ticker.entity';

export enum EventSource {
  STOCKTWITS = 'stocktwits',
  AI_SEARCH = 'ai_search',
  RISK_ANALYSIS = 'risk_analysis',
  MANUAL = 'manual',
}

export enum EventType {
  EARNINGS = 'earnings',
  FDA_DECISION = 'fda_decision',
  CONFERENCE = 'conference',
  PRODUCT_LAUNCH = 'product_launch',
  LEGAL = 'legal',
  REGULATORY = 'regulatory',
  ANALYST = 'analyst',
  OTHER = 'other',
}

@Entity('event_calendar')
export class EventCalendar {
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

  @ApiProperty({ example: 'Q4 2024 Earnings Call' })
  @Column({ type: 'text' })
  title: string;

  @ApiProperty({
    example: 'Apple Inc. quarterly earnings announcement and investor call',
  })
  @Column({ type: 'text', nullable: true })
  description: string;

  // Event date (nullable for "soon" type events)
  @ApiProperty({ example: '2025-01-30' })
  @Index()
  @Column({ type: 'date', nullable: true })
  event_date: Date;

  // For ranges or uncertain dates
  @ApiProperty({
    example: 'Q1 2025',
    description: 'Human-readable date approximation',
  })
  @Column({ type: 'text', nullable: true })
  date_text: string; // e.g., "Q1 2025", "Early January"

  @ApiProperty({ enum: EventType })
  @Column({ type: 'enum', enum: EventType })
  event_type: EventType;

  @ApiProperty({ enum: EventSource })
  @Column({ type: 'enum', enum: EventSource })
  source: EventSource;

  // Confidence in date accuracy (0-1)
  @ApiProperty({
    example: 0.95,
    description: 'Confidence in event date accuracy (0-1)',
  })
  @Column({ type: 'numeric', precision: 3, scale: 2, default: 1.0 })
  confidence: number;

  // Impact estimate (1-10)
  @ApiProperty({ example: 8, description: 'Estimated market impact (1-10)' })
  @Column({ type: 'int', nullable: true })
  impact_score: number;

  // Expected sentiment impact
  @ApiProperty({
    example: 'positive',
    enum: ['positive', 'negative', 'neutral', 'uncertain'],
  })
  @Column({ type: 'text', nullable: true })
  expected_impact: 'positive' | 'negative' | 'neutral' | 'uncertain';

  // Source reference (post_id, research_note_id, url, etc.)
  @ApiProperty({ description: 'Source-specific reference data' })
  @Column({ type: 'jsonb', nullable: true })
  source_reference: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
