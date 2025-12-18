import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';
import { WatchlistItem } from './watchlist-item.entity';

@Entity('watchlists')
export class Watchlist {
  @ApiProperty({ example: '1' })
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: string;

  @ApiProperty({ example: 'My Tech Picks' })
  @Column({ type: 'text' })
  name: string;

  @ApiProperty({ description: 'ID of the owner user' })
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.watchlists)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ type: () => [WatchlistItem] })
  @OneToMany(() => WatchlistItem, (item) => item.watchlist)
  items: WatchlistItem[];

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  // Audit improvement: Soft Delete
  @DeleteDateColumn()
  deleted_at: Date;
}
