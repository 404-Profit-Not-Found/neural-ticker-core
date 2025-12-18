import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Watchlist } from './watchlist.entity';
import { TickerEntity } from '../../tickers/entities/ticker.entity';

@Entity('watchlist_items')
export class WatchlistItem {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: string;

  @ApiProperty({ example: '1' })
  @Column({ type: 'bigint' })
  watchlist_id: string;

  @ManyToOne(() => Watchlist, (list) => list.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'watchlist_id' })
  watchlist: Watchlist;

  @ApiProperty({ example: '1' })
  @Column({ type: 'bigint' })
  ticker_id: string;

  @ManyToOne(() => TickerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticker_id' })
  ticker: TickerEntity;

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime' })
  added_at: Date;
}
