import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany, // Added
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('users')
export class User {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ example: '1234567890' })
  @Column({ unique: true, nullable: true })
  google_id: string;

  @ApiProperty({ example: 'John Doe' })
  @Column({ nullable: true })
  full_name: string;

  @ApiProperty({ enum: ['user', 'admin', 'waitlist'], default: 'user' })
  @Column({ default: 'user' })
  role: string;

  @ApiProperty({ example: 'https://lh3.googleusercontent.com/...' })
  @Column({ nullable: true })
  avatar_url: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ApiProperty()
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  last_login: Date;

  @OneToMany('Watchlist', 'user')
  watchlists: any[]; // Using string/any to avoid circular dependency import issues for now, or use forwardRef

  @ApiProperty({ example: { gemini_api_key: '...' } })
  @Column({ type: 'jsonb', nullable: true })
  preferences: Record<string, any>;

  @ApiProperty({ example: 'FunnyPanda123' })
  @Column({ nullable: true })
  nickname: string;

  @ApiProperty({ enum: ['KISS', 'PRO'], default: 'PRO' })
  @Column({ default: 'PRO' })
  view_mode: string;

  @ApiProperty({ example: 'dark' })
  @Column({ default: 'dark' })
  theme: string;
}
