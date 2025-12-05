import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum RiskConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('risk_reward_scores')
@Index(['symbol_id', 'as_of']) // Index as per spec
export class RiskRewardScore {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty({ example: '1' })
  @Column({ type: 'bigint' })
  symbol_id: string;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  as_of: Date;

  @ApiProperty({ example: 75, description: 'Composite Risk/Reward Score (0-100)' })
  @Column({ type: 'integer' })
  risk_reward_score: number;

  @ApiProperty({ example: 40, description: 'Risk Component Score (Lower is better usually, or context dependent)' })
  @Column({ type: 'integer', nullable: true })
  risk_score: number;

  @ApiProperty({ example: 80, description: 'Reward Component Score' })
  @Column({ type: 'integer', nullable: true })
  reward_score: number;

  @ApiProperty({ enum: RiskConfidenceLevel, example: RiskConfidenceLevel.HIGH })
  @Column({ type: 'enum', enum: RiskConfidenceLevel, default: RiskConfidenceLevel.MEDIUM })
  confidence_level: RiskConfidenceLevel;

  @ApiProperty({ example: 'openai' })
  @Column({ type: 'text' })
  provider: string;

  @ApiProperty({ example: ['gpt-4'] })
  @Column({ type: 'text', array: true })
  models_used: string[];

  @ApiProperty({ example: '10', required: false })
  @Column({ type: 'bigint', nullable: true })
  research_note_id: string;

  @ApiProperty({ example: 'The stock shows strong fundamentals...' })
  @Column({ type: 'text' })
  rationale_markdown: string;

  @ApiProperty()
  @Column({ type: 'jsonb' })
  numeric_context: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
