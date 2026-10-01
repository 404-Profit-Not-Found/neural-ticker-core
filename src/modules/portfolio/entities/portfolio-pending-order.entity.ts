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

export type PendingOrderSide = 'buy' | 'sell';
export type PendingOrderStatus = 'pending' | 'filled' | 'cancelled' | 'failed';

/**
 * A buy/sell order that could not execute immediately because the relevant
 * market was CLOSED when it was placed. Parked here as 'pending' and executed by
 * the cron filler (PortfolioService.fillDuePendingOrders) at the next market
 * open, at the MARKET PRICE at fill time — `requested_price` is the snapshot we
 * showed the user at placement and is purely informational; the fill uses a
 * fresh live price.
 *
 * "Add Position" (a historical import where the user types the buy price + date)
 * is intentionally NOT gated and never creates a row here. Only live "Buy at
 * market" and "Sell" do.
 */
@Entity('portfolio_pending_orders')
@Index(['user_id', 'status'])
@Index(['status', 'region'])
export class PortfolioPendingOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // The lot this order targets: the lot to sell from, or the lot a "buy more"
  // adds to. Nullable + ON DELETE SET NULL so a closed lot doesn't cascade-kill
  // a queued order (a sell whose lot vanished is failed gracefully at fill time;
  // a buy whose lot vanished simply opens a fresh lot).
  @Column({ type: 'uuid', name: 'position_id', nullable: true })
  position_id: string | null;

  @ManyToOne(() => PortfolioPosition, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'position_id' })
  position: PortfolioPosition | null;

  @Column()
  symbol: string;

  @Column({ type: 'varchar', length: 4 })
  side: PendingOrderSide;

  @Column('decimal', { precision: 20, scale: 8 })
  shares: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: PendingOrderStatus;

  // Cached market region at placement ('US' | 'EU' | 'OTHER') so the filler can
  // index/scan by region. The fill itself re-checks the live market per order.
  @Column({ type: 'varchar', length: 8, nullable: true })
  region: string | null;

  // The live market price shown to the user at placement. Informational only —
  // the order fills at a fresh market price, NOT this value.
  @Column('decimal', {
    precision: 20,
    scale: 8,
    name: 'requested_price',
    nullable: true,
  })
  requested_price: number | null;

  @Column('decimal', { precision: 20, scale: 2, default: 0 })
  fees: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  // Fill attempts so far. A persistently un-fillable order (e.g. no live price,
  // or insufficient cash) is marked 'failed' after a bounded number of tries.
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', name: 'filled_at', nullable: true })
  filled_at: Date | null;

  @Column('decimal', {
    precision: 20,
    scale: 8,
    name: 'filled_price',
    nullable: true,
  })
  filled_price: number | null;

  // The executed trade-ledger row this order produced (SET NULL if ever purged).
  @Column({ type: 'uuid', name: 'filled_trade_id', nullable: true })
  filled_trade_id: string | null;

  // Last failure reason (insufficient cash, no price, lot gone, …).
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
