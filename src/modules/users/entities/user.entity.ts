import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { CreditTransaction } from './credit-transaction.entity';

@Entity('users')
export class User {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ example: '1234567890' })
  @Column({ unique: true, nullable: true })
  google_id: string;

  @ApiProperty({ example: 'John Doe' })
  @Column({ nullable: true })
  full_name: string;

  @ApiProperty({ enum: ['user', 'admin', 'waitlist'], default: 'user' })
  @Column({ default: 'user' })
  role: string;

  @ApiProperty({ enum: ['free', 'pro'], default: 'free' })
  @Column({ type: 'text', default: 'free' })
  tier: 'free' | 'pro';

  @ApiProperty({ default: 10 })
  @Column({ type: 'int', default: 10 })
  credits_balance: number;

  @ApiProperty()
  @Column({ type: 'datetime', nullable: true })
  credits_reset_at: Date;

  @OneToMany(() => CreditTransaction, (tx) => tx.user)
  credit_transactions: CreditTransaction[];

  @ApiProperty({ example: 'https://lh3.googleusercontent.com/...' })
  @Column({ nullable: true })
  avatar_url: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @ApiProperty()
  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  last_login: Date;

  @OneToMany('Watchlist', 'user')
  watchlists: any[]; // Using string/any to avoid circular dependency import issues for now, or use forwardRef

  @ApiProperty({ example: { gemini_api_key: '...' } })
  @Column({ type: 'simple-json', nullable: true })
  preferences: Record<string, any>;

  @ApiProperty({ example: 'FunnyPanda123' })
  @Column({ nullable: true })
  nickname: string;

  @ApiProperty({ enum: ['KISS', 'PRO'], default: 'PRO' })
  @Column({ default: 'PRO' })
  view_mode: string;

  @ApiProperty({ example: 'dark' })
  @Column({ default: 'dark' })
  theme: string;
}
