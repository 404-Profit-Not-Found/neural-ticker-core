import { IsString, IsNumber, IsDateString, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePortfolioPositionDto {
  @ApiProperty({ example: 'NVDA', description: 'Stock symbol' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ example: 10, description: 'Number of shares' })
  @IsNumber()
  @Min(0.01)
  shares: number;

  @ApiProperty({ example: 450.50, description: 'Average buy price per share' })
  @IsNumber()
  @Min(0.01)
  buy_price: number;

  @ApiProperty({ example: '2024-01-15', description: 'Date of purchase (YYYY-MM-DD)' })
  @IsDateString()
  buy_date: string;
}
