import {
  IsString,
  IsNumber,
  IsIn,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePriceAlertDto {
  @ApiProperty({ example: 'NVDA', description: 'Ticker symbol' })
  @IsString()
  symbol: string;

  @ApiProperty({
    example: 'price_above',
    enum: [
      'price_above',
      'price_below',
      'percent_change_up',
      'percent_change_down',
    ],
    description: 'Type of alert trigger',
  })
  @IsIn([
    'price_above',
    'price_below',
    'percent_change_up',
    'percent_change_down',
  ])
  alert_type: string;

  @ApiProperty({
    example: 150.0,
    description: 'Target price or percent threshold',
  })
  @IsNumber()
  @Min(0)
  target_value: number;

  @ApiPropertyOptional({
    example: 60,
    description: 'Minimum minutes between re-fires (default: 60)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cooldown_minutes?: number;
}

export class UpdatePriceAlertDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 160.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  target_value?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  cooldown_minutes?: number;
}
