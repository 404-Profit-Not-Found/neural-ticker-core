import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { Public } from '../auth/public.decorator';

@ApiTags('Statistics')
@ApiBearerAuth()
@Controller('v1/stats')
export class StatsController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @ApiOperation({
    summary: 'Get Strong Buy count',
    description:
      'Returns count of tickers where both analyst consensus = "Strong Buy" AND AI rating is bullish (risk ≤ 3, upside > 20%).',
  })
  @ApiResponse({
    status: 200,
    description: 'Strong Buy statistics.',
    schema: { example: { count: 5, symbols: ['AAPL', 'MSFT', 'GOOGL'] } },
  })
  @Get('strong-buy')
  @Public()
  getStrongBuy() {
    return this.marketDataService.getStrongBuyCount();
  }

  @ApiOperation({
    summary: 'Get Sell count',
    description:
      'Returns count of tickers where both analyst consensus = "Sell" AND AI rating is bearish (risk ≥ 7 or upside < -10%).',
  })
  @ApiResponse({
    status: 200,
    description: 'Sell statistics.',
    schema: { example: { count: 2, symbols: ['COIN', 'RIVN'] } },
  })
  @Get('sell')
  @Public()
  getSell() {
    return this.marketDataService.getSellCount();
  }
}
