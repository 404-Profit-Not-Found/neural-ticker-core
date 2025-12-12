import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum LlmProvider {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  ENSEMBLE = 'ensemble',
}

export enum ResearchStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
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

  @ApiProperty({ example: 'deep', required: false })
  @Column({ type: 'text', default: 'medium' })
  quality: string;

  @ApiProperty({ example: ['gpt-4'] })
  @Column({ type: 'text', array: true, default: '{}' })
  models_used: string[];

  @ApiProperty({
    example: 'NVDA Earnings Beat: AI Chip Demand Surge Analysis',
    description: 'Auto-generated title reflecting key findings',
  })
  @Column({ type: 'text', nullable: true })
  title: string;

  @ApiProperty({ example: 'Based on recent earnings...' })
  @Column({ type: 'text', nullable: true })
  answer_markdown: string;

  @ApiProperty({
    description: 'Complete original LLM response with all metadata',
  })
  @Column({ type: 'text', nullable: true })
  full_response: string;

  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  numeric_context: Record<string, any>;

  @ApiProperty({
    description: 'Google Search grounding metadata from Gemini',
  })
  @Column({ type: 'jsonb', nullable: true })
  grounding_metadata: Record<string, any>;

  @ApiProperty({
    description: 'Chain of thought reasoning process (if available)',
  })
  @Column({ type: 'text', nullable: true })
  thinking_process: string | null;

  @ApiProperty({ example: 1500, description: 'Input tokens used' })
  @Column({ type: 'integer', nullable: true })
  tokens_in: number | null;

  @ApiProperty({ example: 3000, description: 'Output tokens used' })
  @Column({ type: 'integer', nullable: true })
  tokens_out: number | null;

  @ApiProperty({ enum: ResearchStatus, default: ResearchStatus.PENDING })
  @Column({
    type: 'enum',
    enum: ResearchStatus,
    default: ResearchStatus.PENDING,
  })
  status: ResearchStatus;

  @ApiProperty({ required: false })
  @Column({ type: 'text', nullable: true })
  error: string;

  @ApiProperty({ description: 'ID of the user who requested this research' })
  @Column({ type: 'uuid', nullable: true })
  user_id: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz', onUpdate: 'CURRENT_TIMESTAMP' }) // Using CreateDateColumn logic or UpdateDateColumn
  // TypeORM has @UpdateDateColumn
  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
