import { IsNumber, Min, IsOptional, IsString, IsIn } from 'class-validator';
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
    description: 'Currency of the cash balance.',
    required: false,
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES as unknown as string[])
  currency?: string;

  @ApiProperty({ required: false, description: 'Optional free-text note.' })
  @IsOptional()
  @IsString()
  note?: string;
}
