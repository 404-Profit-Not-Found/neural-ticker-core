import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RequestType {
  ADD_TICKER = 'ADD_TICKER',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('request_queue')
export class RequestQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'simple-enum', enum: RequestType })
  type: RequestType;

  @Column({ type: 'json' }) // Use 'simple-json' if sqlite, but we are in postgres now? Environment says Postres. but wait.
  // Checking package.json... typeorm config uses postgres.
  // The previous prompt said database is "neural_db" neon pooler (Postgres).
  // So 'json' type is fine.
  payload: Record<string, any>;

  @Column({
    type: 'simple-enum',
    enum: RequestStatus,
    default: RequestStatus.PENDING,
  })
  status: RequestStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  next_attempt: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
