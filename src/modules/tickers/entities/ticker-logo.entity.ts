import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn } from 'typeorm';
import { TickerEntity } from './ticker.entity';

@Entity('ticker_logos')
export class TickerLogoEntity {
  @PrimaryColumn({ type: 'bigint' })
  symbol_id: string; // FK to Tickers

  @Column({ type: 'blob' })
  image_data: Buffer;

  @Column({ type: 'text' })
  mime_type: string;

  @OneToOne(() => TickerEntity, (ticker) => ticker.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'symbol_id' })
  ticker: TickerEntity;
}
