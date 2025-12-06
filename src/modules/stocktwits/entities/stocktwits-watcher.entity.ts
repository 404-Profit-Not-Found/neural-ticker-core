import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('stocktwits_watchers')
export class StockTwitsWatcher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  symbol: string;

  @Column({ type: 'int' })
  count: number;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
