import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('stocktwits_posts')
export class StockTwitsPost {
  @PrimaryColumn({ type: 'bigint' })
  id: number;

  @Index()
  @Column()
  symbol: string;

  @Column()
  username: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'int', default: 0 })
  likes_count: number;

  @Column({ type: 'int', default: 0 })
  user_followers_count: number;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
