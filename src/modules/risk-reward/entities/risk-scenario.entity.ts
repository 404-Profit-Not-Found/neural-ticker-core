import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RiskAnalysis } from './risk-analysis.entity';

export enum ScenarioType {
  BULL = 'bull',
  BASE = 'base',
  BEAR = 'bear',
}

@Entity('risk_scenarios')
export class RiskScenario {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: string;

  @Column({ type: 'bigint' })
  analysis_id: string;

  @ManyToOne(() => RiskAnalysis, (analysis) => analysis.scenarios, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'analysis_id' })
  analysis: RiskAnalysis;

  @ApiProperty({ enum: ScenarioType })
  @Column({ type: 'text' })
  scenario_type: ScenarioType;

  @ApiProperty({ example: 0.275 })
  @Column({ type: 'numeric', precision: 5, scale: 4 })
  probability: number;

  @ApiProperty()
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ example: 10.0 })
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price_low: number;

  @ApiProperty({ example: 18.0 })
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price_high: number;

  @ApiProperty({ example: 14.0 })
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price_mid: number;

  @ApiProperty({ example: 5.0 })
  @Column({ type: 'numeric', precision: 20, scale: 2 })
  expected_market_cap: number;

  @ApiProperty({ type: [String] })
  @Column({ type: 'json' })
  key_drivers: string[];
}
