import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { MarketStatusService } from './market-status.service';

import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Market Data')
@ApiBearerAuth()
@Controller('v1/tickers/:symbol')
export class MarketDataController {
  constructor(
    private readonly service: MarketDataService,
    private readonly marketStatusService: MarketStatusService,
  ) {}

  private validateSecret(secret: string) {
    if (secret !== process.env.CRON_SECRET) {
      throw new UnauthorizedException('Invalid Cron Secret');
    }
  }

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
  @Public()
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
    description:
      'Number of days back to fetch. Defaults to 30. Ignored if from/to are provided.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    example: '2019-01-01',
    description:
      'Start date (YYYY-MM-DD). Used with "to" for explicit date range.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    example: '2024-01-31',
    description:
      'End date (YYYY-MM-DD). Defaults to today if "from" is provided.',
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    example: '1d',
    description: 'Time interval (1m, 5m, 15m, 1h, 1d). Defaults to 1d.',
  })
  @ApiResponse({ status: 200, description: 'History retrieved.' })
  @Get('history')
  @Public()
  getHistory(
    @Param('symbol') symbol: string,
    @Query('days') days?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') interval: string = '1d',
  ) {
    let fromDate: Date;
    let toDate: Date;

    if (from) {
      fromDate = new Date(from);
      toDate = to ? new Date(to) : new Date();
    } else {
      // Default ranges if not specified
      toDate = new Date();
      fromDate = new Date();

      if (['1m', '2m', '5m'].includes(interval)) {
        // High frequency: last 2 days (Yahoo limit ~7 days for 1m, but 2 is safer for 5m chart)
        fromDate.setDate(toDate.getDate() - 2);
      } else if (['15m', '30m', '1h', '60m', '90m'].includes(interval)) {
        // Mid frequency: last 7-14 days
        fromDate.setDate(toDate.getDate() - 14);
      } else {
        // Daily: Default 30 days or requested days
        const numDays = days || 30;
        fromDate.setDate(toDate.getDate() - numDays);
      }
    }

    // For intraday, we need precise ISO strings or timestamps, but service expects YYYY-MM-DD/ISO.
    // Yahoo service handles Date objects or strings, let's pass standardized strings or Date objects.
    // The service signature is (symbol, interval, fromStr, toStr).
    // Let's pass ISO strings for intraday to capture time.

    // NOTE: existing service method assumes YYYY-MM-DD for cache keys on daily.
    // We will update service to handle ISO strings.

    return this.service.getHistory(
      symbol,
      interval,
      fromDate.toISOString(),
      toDate.toISOString(),
    );
  }
  @ApiOperation({ summary: 'Get Company News' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'List of company news.' })
  @Get('news')
  @Public()
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

  @ApiOperation({
    summary: 'Trigger Portfolio Refresh (Cron)',
    description:
      'Triggers the active portfolio refresh logic. Used by external schedulers (GitHub Actions).',
  })
  @ApiResponse({ status: 200, description: 'Refresh triggered.' })
  @Post('cron/refresh-portfolios')
  @Public()
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @Roles('admin')
  async triggerPortfolioRefresh(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    // Fire and forget or await? Await is safer for serverless timeouts.
    await this.service.updateActivePortfolios();
    return { status: 'ok', message: 'Portfolio refresh triggered' };
  }

  @ApiOperation({
    summary: 'Trigger Top Picks Refresh (Cron)',
    description:
      'Triggers the top picks refresh logic. Used by external schedulers (GitHub Actions).',
  })
  @Post('cron/refresh-top-picks')
  @Public()
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @Roles('admin')
  async triggerTopPicksRefresh(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    await this.service.refreshTopPicks();
    return { status: 'ok', message: 'Top Picks refresh triggered' };
  }

  @ApiOperation({
    summary: 'Get Market Status for a Symbol',
    description:
      'Returns market status (open/closed/pre/post) for a specific ticker. Uses Yahoo Finance for EU stocks and Finnhub for US stocks.',
  })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({
    status: 200,
    description: 'Market status including session state and timezone.',
    schema: {
      example: {
        isOpen: false,
        session: 'pre',
        timezone: 'America/New_York',
        exchange: 'NASDAQ',
        region: 'US',
      },
    },
  })
  @Get('status')
  @Public()
  async getMarketStatus(@Param('symbol') symbol: string) {
    return this.marketStatusService.getMarketStatus(symbol);
  }
}
