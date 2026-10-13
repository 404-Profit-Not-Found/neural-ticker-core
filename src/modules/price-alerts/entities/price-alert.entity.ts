import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TickerEntity } from '../../tickers/entities/ticker.entity';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

export type AlertType =
  | 'price_above'
  | 'price_below'
  | 'percent_change_up'
  | 'percent_change_down';

@Entity('price_alerts')
@Index('idx_price_alerts_user', ['user_id'])
@Index('idx_price_alerts_active', ['enabled', 'symbol'], {
  where: '(enabled = true)',
})
export class PriceAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'price_alerts_user_id_fkey',
  })
  user: User;

  @Column({ type: 'bigint' })
  ticker_id: string;

  @ManyToOne(() => TickerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'ticker_id',
    foreignKeyConstraintName: 'price_alerts_ticker_id_fkey',
  })
  ticker: TickerEntity;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 30 })
  alert_type: AlertType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  target_value: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  reference_price: number;

  // These four are nullable in the database (created with a DEFAULT only).
  @Column({ default: true, nullable: true })
  enabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  triggered_at: Date;

  @Column({ type: 'int', default: 60, nullable: true })
  cooldown_minutes: number;

  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updated_at: Date;
}
