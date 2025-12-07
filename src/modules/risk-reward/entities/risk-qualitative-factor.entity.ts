import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RiskAnalysis } from './risk-analysis.entity';

export enum QualitativeFactorType {
  STRENGTH = 'strength',
  WEAKNESS = 'weakness',
  OPPORTUNITY = 'opportunity',
  THREAT = 'threat',
}

@Entity('risk_qualitative_factors')
export class RiskQualitativeFactor {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  analysis_id: string;

  @ManyToOne(() => RiskAnalysis, (analysis) => analysis.qualitative_factors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'analysis_id' })
  analysis: RiskAnalysis;

  @ApiProperty({ enum: QualitativeFactorType })
  @Column({ type: 'enum', enum: QualitativeFactorType })
  factor_type: QualitativeFactorType;

  @ApiProperty()
  @Column({ type: 'text' })
  description: string;
}
