import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export enum RiskConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('risk_reward_scores')
@Index(['symbol_id', 'as_of']) // Index as per spec
export class RiskRewardScore {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  symbol_id: string;

  @Column({ type: 'timestamptz' })
  as_of: Date;

  @Column({ type: 'integer' })
  risk_reward_score: number;

  @Column({ type: 'integer', nullable: true })
  risk_score: number;

  @Column({ type: 'integer', nullable: true })
  reward_score: number;

  @Column({ type: 'enum', enum: RiskConfidenceLevel, default: RiskConfidenceLevel.MEDIUM })
  confidence_level: RiskConfidenceLevel;

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'text', array: true })
  models_used: string[];

  @Column({ type: 'bigint', nullable: true })
  research_note_id: string;

  @Column({ type: 'text' })
  rationale_markdown: string;

  @Column({ type: 'jsonb' })
  numeric_context: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
