import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  type: string; // 'research_complete', 'price_alert', etc.

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'simple-json', nullable: true })
  data: any; // e.g., { researchId: '...' }

  @CreateDateColumn()
  created_at: Date;
}
