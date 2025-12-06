import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('stocktwits_watchers')
export class StockTwitsWatcher {
  @ApiProperty({ example: 'uuid-v4', description: 'Unique ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'AAPL', description: 'Stock Symbol' })
  @Index()
  @Column()
  symbol: string;

  @ApiProperty({ example: 154300, description: 'Number of watchers' })
  @Column({ type: 'int' })
  count: number;

  @ApiProperty({
    example: '2023-01-01T12:00:00Z',
    description: 'Record timestamp',
  })
  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
