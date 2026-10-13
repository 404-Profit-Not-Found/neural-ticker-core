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
import { PublicUser, toPublicUser } from '../public-user';

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

  @ApiProperty({ enum: ['free', 'pro', 'whale'], default: 'free' })
  @Column({ type: 'text', default: 'free' })
  tier: 'free' | 'pro' | 'whale';

  @ApiProperty({ default: 10 })
  @Column({ type: 'int', default: 10 })
  credits_balance: number;

  @ApiProperty()
  @Column({ type: 'timestamptz', nullable: true })
  credits_reset_at: Date;

  @OneToMany(() => CreditTransaction, (tx) => tx.user)
  credit_transactions: CreditTransaction[];

  @ApiProperty({ example: 'https://lh3.googleusercontent.com/...' })
  @Column({ nullable: true })
  avatar_url: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ApiProperty()
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  last_login: Date;

  @OneToMany('Watchlist', 'user')
  watchlists: any[]; // Using string/any to avoid circular dependency import issues for now, or use forwardRef

  @ApiProperty({ example: { gemini_api_key: '...' } })
  @Column({ type: 'jsonb', nullable: true })
  preferences: Record<string, any>;

  /**
   * The user's personal Gemini API key, ENCRYPTED (SecretBox:
   * `v1:<keyId>:<iv>:<tag>:<ciphertext>`, bound to this user's id). Written
   * and read only through UsersService (`getUserLlmKey`); never returned to a
   * client — the account view reports `preferences.gemini_api_key_set` and
   * drops this column. NULL = no key, or encryption at rest is not configured
   * (then the key, if any, is in `preferences.gemini_api_key` as before).
   */
  @Column({ type: 'text', nullable: true })
  gemini_api_key_enc: string | null;

  @ApiProperty({ example: 'FunnyPanda123' })
  @Column({ nullable: true })
  nickname: string;

  @ApiProperty({ enum: ['KISS', 'PRO'], default: 'PRO' })
  @Column({ default: 'PRO' })
  view_mode: string;

  @ApiProperty({ default: false })
  @Column({ default: false })
  has_onboarded: boolean;

  @ApiProperty({ example: 'dark' })
  @Column({ default: 'dark' })
  theme: string;

  /**
   * Structural guard: a `User` that reaches `JSON.stringify` (an HTTP
   * response, an SSE frame, an MCP tool result) serializes as its PUBLIC view,
   * whatever columns were loaded. So an entity embedded through a relation or
   * returned as-is can never carry `email`, `google_id`, `credits_balance` or
   * `preferences` (API keys) to a client. Server code reads the properties and
   * is unaffected; endpoints that return an account to its owner or an admin
   * opt in with `toAccountUser()` (see ../public-user.ts).
   */
  toJSON(): PublicUser {
    return toPublicUser(this) as PublicUser;
  }
}
