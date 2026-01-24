import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('credit_transactions')
export class CreditTransaction {
  @ApiProperty()
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  user_id: string;

  @ManyToOne(() => User, (user) => user.credit_transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ description: 'Negative for spend, positive for earn/gift' })
  @Column({ type: 'int' })
  amount: number;

  @ApiProperty({
    enum: [
      'research_spend',
      'portfolio_analysis_spend',
      'social_analysis_spend',
      'manual_contribution',
      'monthly_reset',
      'admin_gift',
    ],
  })
  @Column({ type: 'text' })
  reason:
    | 'research_spend'
    | 'portfolio_analysis_spend'
    | 'social_analysis_spend'
    | 'manual_contribution'
    | 'monthly_reset'
    | 'admin_gift';

  @ApiProperty({ example: { note_id: '...', score: 85 } })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
