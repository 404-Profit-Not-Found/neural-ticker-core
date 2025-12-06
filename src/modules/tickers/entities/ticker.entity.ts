import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('tickers')
export class TickerEntity {
  @ApiProperty({ example: '1', description: 'Unique ID' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string; // BigInt is returned as string in TypeORM by default

  @ApiProperty({ example: 'AAPL', description: 'Stock Ticker' })
  @Column({ type: 'text', unique: true })
  symbol: string;

  @ApiProperty({ example: 'Apple Inc', description: 'Company Name' })
  @Column({ type: 'text' })
  name: string;

  @ApiProperty({ example: 'NASDAQ', description: 'Exchange Code' })
  @Column({ type: 'text' })
  exchange: string;

  @ApiProperty({ example: 'USD', description: 'Currency Code' })
  @Column({ type: 'text' })
  currency: string;

  @ApiProperty({ example: 'US', description: 'Country Code' })
  @Column({ type: 'text' })
  country: string;

  @ApiProperty({
    example: '1980-12-12',
    description: 'IPO Date',
    required: false,
  })
  @Column({ type: 'date', nullable: true })
  ipo_date: string;

  @ApiProperty({
    example: 2500000000000,
    description: 'Market Capitalization',
    required: false,
  })
  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  market_capitalization: number;

  @ApiProperty({
    example: 16000000000,
    description: 'Shares Outstanding',
    required: false,
  })
  @Column({ type: 'numeric', precision: 24, scale: 8, nullable: true })
  share_outstanding: number;

  @ApiProperty({
    example: '1.408.996.1010',
    description: 'Phone Number',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  phone: string;

  @ApiProperty({
    example: 'https://www.apple.com/',
    description: 'Website URL',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  web_url: string;

  @ApiProperty({
    example:
      'https://static.finnhub.io/logo/87cb30d8-80df-11ea-8951-00000000092a.png',
    description: 'Logo URL',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  logo_url: string;

  @ApiProperty({
    example: 'Technology',
    description: 'Finnhub Industry Classification',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  finnhub_industry: string;

  @ApiProperty({
    example: 'Technology',
    description: 'Sector',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  sector: string;

  @ApiProperty({
    example: 'Consumer Electronics',
    description: 'Industry',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  industry: string;

  @ApiProperty({ description: 'Raw Finnhub Profile Data', required: false })
  @Column({ type: 'jsonb', nullable: true })
  finnhub_raw: Record<string, any>;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
