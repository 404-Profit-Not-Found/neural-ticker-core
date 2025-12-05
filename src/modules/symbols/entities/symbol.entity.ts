import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne } from 'typeorm';

@Entity('symbols')
export class SymbolEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string; // BigInt is returned as string in TypeORM by default

  @Column({ type: 'text', unique: true })
  symbol: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  exchange: string;

  @Column({ type: 'text' })
  currency: string;

  @Column({ type: 'text' })
  country: string;

  @Column({ type: 'date', nullable: true })
  ipo_date: string;

  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  market_capitalization: number;

  @Column({ type: 'numeric', precision: 24, scale: 8, nullable: true })
  share_outstanding: number;

  @Column({ type: 'text', nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  web_url: string;

  @Column({ type: 'text', nullable: true })
  logo_url: string;

  @Column({ type: 'text', nullable: true })
  finnhub_industry: string;

  @Column({ type: 'text', nullable: true })
  sector: string;

  @Column({ type: 'text', nullable: true })
  industry: string;

  @Column({ type: 'jsonb', nullable: true })
  finnhub_raw: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
