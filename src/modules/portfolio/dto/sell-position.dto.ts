import {
  IsNumber,
  IsDateString,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SellPositionDto {
  @ApiProperty({
    example: 5,
    description: 'Number of shares to sell (>= 0.0001)',
  })
  @IsNumber()
  @Min(0.0001)
  shares: number;

  @ApiProperty({ example: 512.3, description: 'Sale price per share' })
  @IsNumber()
  @Min(0.0001)
  price: number;

  @ApiProperty({
    example: '2026-06-21',
    description: 'Date of sale (YYYY-MM-DD). Defaults to today if omitted.',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  sell_date?: string;

  @ApiProperty({
    example: 1.0,
    description: 'Optional transaction fees deducted from proceeds.',
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
