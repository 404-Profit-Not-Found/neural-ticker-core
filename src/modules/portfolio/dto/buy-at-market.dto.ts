import { IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Buy MORE shares of an existing position at the live market price.
 *
 * Unlike "Add Position" (a historical import where the user types the price and
 * date), this is a live order: there is no price field — it executes at the
 * current market price, and is queued as a pending order if the market is
 * closed (filling at the market price at the next open).
 */
export class BuyAtMarketDto {
  @ApiProperty({
    example: 5,
    description: 'Number of shares to buy at the live market price (>= 0.0001)',
  })
  @IsNumber()
  @Min(0.0001)
  shares: number;

  @ApiProperty({
    example: 1.0,
    description: 'Optional transaction fees added to the cost.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fees?: number;

  @ApiProperty({ required: false, description: 'Optional free-text note.' })
  @IsOptional()
  @IsString()
  note?: string;
}
