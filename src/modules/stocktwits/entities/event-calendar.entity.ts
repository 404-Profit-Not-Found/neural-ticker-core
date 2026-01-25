import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { TickerEntity } from '../../tickers/entities/ticker.entity';

export enum EventCalendarEventType {
  EARNINGS = 'earnings',
  FDA_DECISION = 'fda_decision',
  CONFERENCE = 'conference',
  PRODUCT_LAUNCH = 'product_launch',
  LEGAL = 'legal',
  REGULATORY = 'regulatory',
  ANALYST = 'analyst',
  INSIDER_TRADING = 'insider_trading',
  OTHER = 'other',
}

export enum EventCalendarSource {
  STOCKTWITS = 'stocktwits',
  AI_SEARCH = 'ai_search',
  RISK_ANALYSIS = 'risk_analysis',
  MANUAL = 'manual',
}

@Entity('event_calendar')
export class EventCalendar {
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

  @ApiProperty({ example: 'Q4 Earnings Call' })
  @Column({ type: 'text' })
  title: string;

  @ApiProperty({ example: 'Apple to report Q4 earnings...' })
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty({ example: '2023-10-27' })
  @Column({ type: 'date', nullable: true })
  event_date: string; // YYYY-MM-DD

  @ApiProperty({ example: 'Next Tuesday' })
  @Column({ type: 'text', nullable: true })
  date_text: string;

  @ApiProperty({ example: 0.95 })
  @Column({ type: 'numeric', default: 1 })
  confidence: number;

  @ApiProperty({ example: 8 })
  @Column({ type: 'int', nullable: true })
  impact_score: number;

  @ApiProperty({ example: 'High Volatility Expected' })
  @Column({ type: 'text', nullable: true })
  expected_impact: string;

  @ApiProperty({ enum: EventCalendarEventType })
  @Column({ type: 'text' })
  event_type: string;

  @ApiProperty({ enum: EventCalendarSource })
  @Column({ type: 'text' })
  source: string;

  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  @Column({ type: 'jsonb', nullable: true })
  source_reference: any;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
