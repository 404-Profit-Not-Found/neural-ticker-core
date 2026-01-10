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

@Entity('ticker_requests')
export class TickerRequestEntity {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Unique ID',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'AAPL', description: 'Requested Symbol' })
  @Column({ type: 'text' })
  symbol: string;

  @ApiProperty({
    example: 'PENDING',
    description: 'Status: PENDING, APPROVED, REJECTED',
  })
  @Column({
    type: 'text',
    default: 'PENDING',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
  })
  status: string;

  @ApiProperty({ description: 'ID of the user who requested' })
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
