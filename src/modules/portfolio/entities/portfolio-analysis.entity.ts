import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('portfolio_analyses')
export class PortfolioAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  riskAppetite: string;

  @Column({ nullable: true })
  horizon: string;

  @Column({ nullable: true })
  goal: string;

  @Column({ nullable: true })
  model: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text' })
  response: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
