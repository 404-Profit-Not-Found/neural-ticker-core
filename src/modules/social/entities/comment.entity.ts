import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';

@Entity('comments')
export class Comment {
  @ApiProperty({ example: '1', description: 'Unique ID' })
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: string;

  @ApiProperty({ example: 'AAPL', description: 'Ticker Symbol' })
  @Column({ type: 'text' })
  ticker_symbol: string;

  @ApiProperty({
    example: 'This stock looks promising!',
    description: 'Comment Content',
  })
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
