import { IsNumber, Min, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'JPY',
  'CAD',
  'AUD',
] as const;

/** Deposit or withdraw simulator cash for a single currency. */
export class CashOperationDto {
  @ApiProperty({ example: 10000, description: 'Amount of cash to move (> 0).' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    example: 'USD',
    description:
      'Currency of the cash balance (ISO 4217). Any code is accepted because ' +
      "buys debit the ticker's native currency, which may be outside " +
      'SUPPORTED_CURRENCIES (e.g. SEK, HKD).',
    required: false,
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiProperty({ required: false, description: 'Optional free-text note.' })
  @IsOptional()
  @IsString()
  note?: string;
}
