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
import { PortfolioPosition } from './portfolio-position.entity';

/**
 * Append-only ledger of executed trades (buys and sells) for the trading
 * simulator. This is the immutable history: "what I traded, how many, at what
 * price, and when". Positions and cash balances are mutated alongside each
 * trade, but trades themselves are never edited — they are the audit trail.
 *
 * `source` records where the trade originated ('app', 'mcp', or an external
 * app name) so trades consolidated from other applications via MCP can be told
 * apart. `external_id` is the idempotency key for those imports: a partial
 * unique index on (user_id, external_id) lets `record_trade` be retried safely.
 */
@Entity('portfolio_trades')
@Index(['user_id', 'symbol'])
@Index(['user_id', 'trade_date'])
export class PortfolioTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // The lot this trade affected. Kept nullable + ON DELETE SET NULL so the
  // history survives when a position is fully sold/closed and its row removed.
  @Column({ name: 'position_id', nullable: true })
  position_id: string | null;

  @ManyToOne(() => PortfolioPosition, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'position_id' })
  position: PortfolioPosition | null;

  @Column()
  symbol: string;

  @Column({ type: 'varchar', length: 4 })
  side: 'buy' | 'sell';

  @Column('decimal', { precision: 20, scale: 8 })
  shares: number;

  @Column('decimal', { precision: 20, scale: 8 })
  price: number;

  // Gross cash value of the trade (shares * price), before fees. Stored for
  // cheap history rendering without re-multiplying decimals on the client.
  @Column('decimal', { precision: 20, scale: 2, name: 'total_value' })
  total_value: number;

  @Column('decimal', { precision: 20, scale: 2, default: 0 })
  fees: number;

  // Realized profit/loss vs the lot's cost basis. Sells only; null for buys.
  @Column('decimal', {
    precision: 20,
    scale: 2,
    name: 'realized_pnl',
    nullable: true,
  })
  realized_pnl: number | null;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'date', name: 'trade_date' })
  trade_date: string; // ISO date string YYYY-MM-DD

  @Column({ length: 32, default: 'app' })
  source: string;

  // Explicit `type` is required: a `string | null` union reflects as `Object`,
  // which TypeORM rejects at startup ("Data type Object not supported"). Matches
  // the migration's varchar(128).
  @Column({ type: 'varchar', name: 'external_id', length: 128, nullable: true })
  external_id: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
