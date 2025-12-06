import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
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

  @ApiProperty({ enum: ['user', 'admin'], default: 'user' })
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
  @Column({ type: 'timestamptz', nullable: true })
  last_login: Date;
}
