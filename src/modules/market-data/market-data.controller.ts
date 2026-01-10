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
@Controller('v1/tickers/:symbol')
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
  @ApiOperation({ summary: 'Get Company News' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'List of company news.' })
  @Get('news')
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date (YYYY-MM-DD). Defaults to 7 days ago.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date (YYYY-MM-DD). Defaults to today.',
  })
  getNews(
    @Param('symbol') symbol: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getCompanyNews(symbol, from, to).catch(() => {
      // Return empty array if news fetch fails (ticker may not have news coverage)
      return [];
    });
  }
  @ApiOperation({ summary: 'Get Market Status' })
  @ApiResponse({ status: 200, description: 'Market Status Object' })
  @Get('status')
  async getMarketStatus(@Query('exchange') exchange: string = 'US') {
    const status = await this.service.getMarketStatus(exchange);
    // If Finnhub returns null (access restricted), return a time-based fallback
    if (!status) {
      return this.getMarketStatusFallback(exchange);
    }
    return status;
  }

  private getMarketStatusFallback(exchange: string) {
    // Simple heuristic for US market: Mon-Fri, 9:30 AM - 4:00 PM ET
    const now = new Date();
    const nyOptions = { timeZone: 'America/New_York' };
    const nyTimeStr = now.toLocaleString('en-US', nyOptions);
    const nyTime = new Date(nyTimeStr);
    const day = nyTime.getDay();
    const hours = nyTime.getHours();
    const minutes = nyTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = timeInMinutes >= 570 && timeInMinutes < 960; // 9:30 AM - 4:00 PM
    const isOpen = isWeekday && isMarketHours;

    return {
      exchange,
      isOpen,
      session: isOpen ? 'market' : 'closed',
      timezone: 'America/New_York',
      fallback: true, // Indicate this is a calculated fallback
    };
  }
}
