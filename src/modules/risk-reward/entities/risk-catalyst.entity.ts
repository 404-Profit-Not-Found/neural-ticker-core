import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RiskAnalysis } from './risk-analysis.entity';

export enum CatalystTimeframe {
  NEAR_TERM = 'near_term',
  LONG_TERM = 'long_term',
}

@Entity('risk_catalysts')
export class RiskCatalyst {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  analysis_id: string;

  @ManyToOne(() => RiskAnalysis, (analysis) => analysis.catalysts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'analysis_id' })
  analysis: RiskAnalysis;

  @ApiProperty({ enum: CatalystTimeframe })
  @Column({ type: 'enum', enum: CatalystTimeframe })
  timeframe: CatalystTimeframe;

  @ApiProperty()
  @Column({ type: 'text' })
  description: string;
}
