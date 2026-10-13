import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../../users/entities/user.entity';

// One like per user per comment. The unique index itself was created by the
// AddCommentRepliesAndLikes migration; it is declared here so the entity
// metadata matches the schema (a `synchronize` run would otherwise drop it).
@Index('idx_comment_likes_unique', ['comment_id', 'user_id'], { unique: true })
@Index('idx_comment_likes_comment', ['comment_id'])
@Entity('comment_likes')
export class CommentLike {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  comment_id: string;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'comment_id',
    foreignKeyConstraintName: 'comment_likes_comment_id_fkey',
  })
  comment: Comment;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'comment_likes_user_id_fkey',
  })
  user: User;

  // Nullable in the database (the column was created with a DEFAULT only).
  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  created_at: Date;
}
