import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { TickerEntity } from '../../tickers/entities/ticker.entity';
import { RiskScenario } from './risk-scenario.entity';
import { RiskCatalyst } from './risk-catalyst.entity';
import { RiskQualitativeFactor } from './risk-qualitative-factor.entity';

@Entity('risk_analyses')
export class RiskAnalysis {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty()
  @Column({ type: 'bigint' })
  ticker_id: string;

  @ManyToOne(() => TickerEntity)
  @JoinColumn({ name: 'ticker_id' })
  ticker: TickerEntity;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty({ example: '1.0.0' })
  @Column({ type: 'text', default: '1.0.0' })
  model_version: string;

  // --- Scores ---
  @ApiProperty({
    example: 8.0,
    description:
      'Overall Investment Potential Score (0-10, where 10 is excellent and 0 is immediate risk/bankrupt)',
  })
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  overall_score: number;

  @ApiProperty({ example: 8.5 })
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  financial_risk: number;

  @ApiProperty({ example: 8.0 })
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  execution_risk: number;

  @ApiProperty({ example: 8.0 })
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  dilution_risk: number;

  @ApiProperty({ example: 7.0 })
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  competitive_risk: number;

  @ApiProperty({ example: 6.5 })
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  regulatory_risk: number;

  // --- Expected Value & Analyst ---
  @ApiProperty({ example: 3 })
  @Column({ type: 'integer' })
  time_horizon_years: number;

  @ApiProperty({ example: 5.5 })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  price_target_weighted: number;

  @ApiProperty({ example: 150.0 })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  upside_percent: number;

  @ApiProperty({ example: 8.25 })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  analyst_target_avg: number;

  @ApiProperty({ example: 1.5 })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  analyst_target_range_low: number;

  @ApiProperty({ example: 17 })
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  analyst_target_range_high: number;

  @ApiProperty({ example: 'mixed' })
  @Column({ type: 'text', nullable: true })
  sentiment: string;

  // --- Relations ---
  @OneToMany(() => RiskScenario, (scenario) => scenario.analysis, {
    cascade: true,
  })
  scenarios: RiskScenario[];

  @OneToMany(() => RiskQualitativeFactor, (factor) => factor.analysis, {
    cascade: true,
  })
  qualitative_factors: RiskQualitativeFactor[];

  @OneToMany(() => RiskCatalyst, (catalyst) => catalyst.analysis, {
    cascade: true,
  })
  catalysts: RiskCatalyst[];

  // --- Fundamentals Snapshot (JSONB) ---
  @ApiProperty()
  @Column({ type: 'jsonb' })
  fundamentals: {
    cash_on_hand: number;
    runway_years: number;
    revenue_ttm: number;
    gross_margin: number;
    debt: number | null;
    shares_outstanding: number;
    dilution_forecast_3yr: number;
  };

  // --- Red Flags ---
  @ApiProperty()
  @Column({ type: 'jsonb', default: '[]' })
  red_flags: string[];

  @ApiProperty({ example: 'uuid', required: false })
  @Column({ type: 'text', nullable: true })
  research_note_id: string;

  // --- Metadata ---
  @ApiProperty()
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;
}
