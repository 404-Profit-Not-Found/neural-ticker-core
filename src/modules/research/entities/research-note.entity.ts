import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum LlmProvider {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  ENSEMBLE = 'ensemble',
}

@Entity('research_notes')
export class ResearchNote {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'text', array: true })
  tickers: string[];

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'enum', enum: LlmProvider })
  provider: LlmProvider;

  @Column({ type: 'text', array: true })
  models_used: string[];

  @Column({ type: 'text' })
  answer_markdown: string;

  @Column({ type: 'jsonb' })
  numeric_context: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
