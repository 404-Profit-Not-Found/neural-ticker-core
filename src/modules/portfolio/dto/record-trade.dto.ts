import {
  IsNumber,
  IsDateString,
  Min,
  IsOptional,
  IsString,
  IsIn,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from './cash-operation.dto';

/**
 * Generic trade record used to consolidate buys/sells imported from other
 * applications (typically via MCP). Unlike the interactive add/sell flows this
 * is permissive: it does NOT enforce sufficient cash (the trade already
 * happened elsewhere), only mirrors its cash effect. `external_id` makes the
 * import idempotent so the same external trade is never recorded twice.
 */
export class RecordTradeDto {
  @ApiProperty({ example: 'AAPL', description: 'Ticker symbol.' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: ['buy', 'sell'], description: 'Trade side.' })
  @IsString()
  @IsIn(['buy', 'sell'])
  side: 'buy' | 'sell';

  @ApiProperty({ example: 5, description: 'Number of shares (>= 0.0001).' })
  @IsNumber()
  @Min(0.0001)
  shares: number;

  @ApiProperty({ example: 187.4, description: 'Execution price per share.' })
  @IsNumber()
  @Min(0.0001)
  price: number;

  @ApiProperty({
    example: '2026-06-21',
    description: 'Date the trade executed (YYYY-MM-DD).',
  })
  @IsDateString()
  trade_date: string;

  @ApiProperty({
    example: 'USD',
    required: false,
    description: 'Trade currency. Auto-detected from the ticker if omitted.',
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES as unknown as string[])
  currency?: string;

  @ApiProperty({ required: false, description: 'Transaction fees.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fees?: number;

  @ApiProperty({
    required: false,
    description:
      'For sells: the lot/position id to reduce. If omitted, the oldest ' +
      'matching open lot for the symbol is used (FIFO).',
  })
  @IsOptional()
  @IsString()
  position_id?: string;

  @ApiProperty({
    required: false,
    example: 'robinhood',
    description:
      "Origin of the trade, e.g. the source app name. Defaults to 'mcp'.",
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    required: false,
    description:
      'Idempotency key from the source system. Re-recording the same ' +
      'external_id is a no-op that returns the original trade.',
  })
  @IsOptional()
  @IsString()
  external_id?: string;

  @ApiProperty({ required: false, description: 'Optional free-text note.' })
  @IsOptional()
  @IsString()
  note?: string;
}
