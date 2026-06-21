import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Materialized simulator cash balance, one row per (user, currency). Proceeds
 * from sells and manual deposits credit it; strict buys and withdrawals debit
 * it. Kept per-currency because positions are multi-currency — selling an EUR
 * stock credits EUR cash, not USD.
 *
 * A missing row is treated as a zero balance everywhere, so users start at 0
 * with no backfill needed.
 */
@Entity('portfolio_cash_balances')
@Index(['user_id', 'currency'], { unique: true })
export class PortfolioCashBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 3 })
  currency: string;

  @Column('decimal', { precision: 20, scale: 2, default: 0 })
  amount: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
