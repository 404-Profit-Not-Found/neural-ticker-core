import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('stocktwits_posts')
@Index(['symbol', 'created_at'])
export class StockTwitsPost {
  @ApiProperty({ example: 123456789, description: 'StockTwits Message ID' })
  @PrimaryColumn({ type: 'bigint' })
  id: number;

  @ApiProperty({ example: 'AAPL', description: 'Stock Symbol' })
  @Index()
  @Column()
  symbol: string;

  @ApiProperty({ example: 'trader1', description: 'Username of the poster' })
  @Column()
  username: string;

  @ApiProperty({
    example: '$AAPL Bullish!',
    description: 'Content of the post',
  })
  @Column({ type: 'text' })
  body: string;

  @ApiProperty({ example: 10, description: 'Number of likes' })
  @Column({ type: 'int', default: 0 })
  likes_count: number;

  @ApiProperty({
    example: 500,
    description: 'Number of followers of the poster',
    default: 0,
  })
  @Column({ type: 'int', default: 0 })
  user_followers_count: number;

  @ApiProperty({
    example: '2023-01-01T12:00:00Z',
    description: 'Post creation timestamp',
  })
  @Index()
  @Column({ type: 'timestamptz' })
  created_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  inserted_at: Date;
}
