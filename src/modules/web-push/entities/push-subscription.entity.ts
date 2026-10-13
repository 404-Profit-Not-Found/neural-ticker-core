import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Index and constraint names, and nullability, are those of the database as
// the migrations build it (CreatePushSubscriptions) — the entity describes the
// schema, it does not rename it.
@Entity('push_subscriptions')
@Index('idx_push_subscriptions_endpoint', ['endpoint'], { unique: true })
@Index('idx_push_subscriptions_user', ['user_id'])
export class PushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'push_subscriptions_user_id_fkey',
  })
  user: User;

  @Column({ type: 'text' })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  created_at: Date;
}
