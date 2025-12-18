import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('allowed_users')
export class AllowedUser {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ example: 'admin@example.com' })
  @Column({ nullable: true })
  added_by: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
