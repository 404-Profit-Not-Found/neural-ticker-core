import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('auth_logs')
export class AuthLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  @Index()
  userId: string;

  @Column({ type: 'text' })
  provider: string; // 'google', 'firebase', etc.

  @Column({ type: 'text', nullable: true })
  email: string;

  @CreateDateColumn({ name: 'login_at', type: 'timestamptz' })
  loginAt: Date;

  @Column({ name: 'ip_address', type: 'text', nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;
}
