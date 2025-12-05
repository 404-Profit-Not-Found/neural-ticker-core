import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum LlmProvider {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  ENSEMBLE = 'ensemble',
}

@Entity('research_notes')
export class ResearchNote {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @Column({ type: 'uuid' })
  request_id: string;

  @ApiProperty({ example: ['AAPL', 'MSFT'] })
  @Column({ type: 'text', array: true })
  tickers: string[];

  @ApiProperty({ example: 'What is the long term outlook?' })
  @Column({ type: 'text' })
  question: string;

  @ApiProperty({ enum: LlmProvider, example: LlmProvider.OPENAI })
  @Column({ type: 'enum', enum: LlmProvider })
  provider: LlmProvider;

  @ApiProperty({ example: ['gpt-4'] })
  @Column({ type: 'text', array: true })
  models_used: string[];

  @ApiProperty({ example: 'Based on recent earnings...' })
  @Column({ type: 'text' })
  answer_markdown: string;

  @ApiProperty()
  @Column({ type: 'jsonb' })
  numeric_context: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
