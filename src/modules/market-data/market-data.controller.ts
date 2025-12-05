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

@ApiTags('Market Data')
@ApiBearerAuth()
@Controller('api/v1/tickers/:symbol')
export class MarketDataController {
  constructor(private readonly service: MarketDataService) {}

  @ApiOperation({
    summary: 'Get latest snapshot (price + fundamentals)',
    description:
      'Retrieves the latest price candle and fundamentals. If data is stale (>15m for price, >24h for fundamentals), it fetches fresh data from Finnhub, persists it to the database, and returns the updated state.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'AAPL',
    description: 'Stock Ticker Symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'Snapshot retrieved.',
    schema: {
      example: {
        symbol: { id: '1', symbol: 'AAPL', name: 'Apple Inc' },
        latestPrice: {
          open: 150.0,
          close: 152.5,
          high: 153.0,
          low: 149.0,
          ts: '2023-10-27T...',
        },
        fundamentals: { market_cap: 2500000 },
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
