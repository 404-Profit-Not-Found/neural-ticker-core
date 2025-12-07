import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';

import { Public } from '../auth/public.decorator';

@ApiTags('Market Data')
@ApiBearerAuth()
@Controller('api/v1/tickers/:symbol')
@Public()
export class MarketDataController {
  constructor(private readonly service: MarketDataService) {}

  @ApiOperation({
    summary: 'Get latest snapshot (price + fundamentals)',
    description: `
**Market Data Snapshot**:
- **Price**: Latest real-time price candle (Open, High, Low, Close, Volume).
- **Fundamentals**: Key metrics like Market Cap, PE Ratio, etc.
- **Staleness Logic**: 
    - Price: Refreshes from Finnhub if > 15 mins old.
    - Fundamentals: Refreshes if > 24 hours old.
    - Falls back to database cache if API fails.
    `,
  })
  @ApiParam({
    name: 'symbol',
    example: 'AAPL',
    description: 'Stock Ticker Symbol (e.g. AAPL, MSFT)',
  })
  @ApiResponse({
    status: 200,
    description: 'Snapshot retrieved successfully.',
    schema: {
      example: {
        ticker: { id: '1', symbol: 'AAPL', name: 'Apple Inc' },
        latestPrice: {
          open: 150.0,
          close: 152.5,
          high: 153.0,
          low: 149.0,
          volume: 5000000,
          ts: '2023-10-27T10:00:00Z',
          source: 'finnhub_quote',
        },
        fundamentals: {
          market_cap: 2500000,
          pe_ratio: 28.5,
          beta: 1.2,
        },
        source: 'finnhub',
      },
    },
  })
  @Get('snapshot')
  getSnapshot(@Param('symbol') symbol: string) {
    return this.service.getSnapshot(symbol);
  }

  @ApiOperation({
    summary: 'Get historical OHLCV data',
    description:
      'Retrieves historical candles from the database (TimescaleDB).',
  })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiQuery({
    name: 'days',
    required: false,
    example: 30,
    description: 'Number of days back to fetch. Defaults to 30.',
  })
  @ApiResponse({ status: 200, description: 'History retrieved.' })
  @Get('history')
  getHistory(@Param('symbol') symbol: string, @Query('days') days?: number) {
    const numDays = days || 30;
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - numDays);

    const to = toDate.toISOString().split('T')[0];
    const from = fromDate.toISOString().split('T')[0];
    const interval = 'D';

    return this.service.getHistory(symbol, interval, from, to);
  }
}
