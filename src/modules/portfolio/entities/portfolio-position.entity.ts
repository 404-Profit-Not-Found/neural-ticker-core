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

@Entity('portfolio_positions')
@Index(['user_id', 'symbol']) // optimize lookups per user per symbol
export class PortfolioPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  symbol: string;

  @Column('decimal', { precision: 10, scale: 2 })
  shares: number;

  @Column('decimal', { precision: 10, scale: 2, name: 'buy_price' })
  buy_price: number;

  @Column({ type: 'date', name: 'buy_date' })
  buy_date: string; // ISO date string YYYY-MM-DD

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Column({ length: 3, default: 'USD' })
  currency: string;
}
