import { Controller, Get, Query, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { Public } from '../auth/public.decorator';

import { ResearchService } from '../research/research.service';

@ApiTags('News')
@ApiBearerAuth()
@Controller('v1/news')
export class NewsController {
  constructor(
    private readonly service: MarketDataService,
    private readonly researchService: ResearchService,
  ) {}

  @ApiOperation({ summary: 'Get Daily AI News Digest' })
  @Get('digest')
  async getDailyDigest(@Request() req?: any) {
    // If public user, maybe return a generic system digest?
    // We try to use the user ID if available.
    const userId = req?.user?.id;

    // If no userId, we can pass a 'global' identifier or null if our service supports it.
    // My previous edit to ResearchService allowed userId to be passed, but the fallback logic
    // for finding watchlists might fail if userId is null.
    // But I added a catch block there!
    // And if symbols are empty, it falls back to Market Opportunities.
    // So passing null/undefined is actually safe-ish?
    // Let's pass userId || 'system-global' to be explicit about a shared cache key if we wanted,
    // but the DB schema might enforce UUID.
    // If user_id is nullable (it is in ResearchNote entity), then passing null is fine?
    // Let's pass userId || null.
    const digest = await this.researchService.getCachedDigest(userId ?? null);
    if (!digest) {
      return {
        status: 'pending',
        message: 'Digest generation in progress or scheduled.',
      };
    }

    // Enrich with live data for the mentioned tickers
    let relatedTickers: any[] = [];
    try {
      if (digest.tickers && digest.tickers.length > 0) {
        // Enrich with live data for the mentioned tickers
        if (digest.tickers && digest.tickers.length > 0) {
          relatedTickers = await this.service.getTickerSnapshots(
            digest.tickers,
          );
        }
      }
    } catch (e) {
      console.error('Failed to enrich digest', e);
    }

    return {
      ...digest,
      relatedTickers,
    };
  }

  @ApiOperation({ summary: 'Get General Market News' })
  @Get('general')
  @Public()
  async getGeneralNews() {
    return this.service.getGeneralNews();
  }

  // Temporary: Force trigger digest generation
  @Get('digest/trigger')
  @Public()
  async triggerDigest() {
    // Forcing generation for a 'system' user or similar.
    return this.researchService.getOrGenerateDailyDigest('system-trigger');
  }

  @ApiOperation({
    summary: 'News stats across tickers',
    description:
      'Returns counts of news items for the given tickers within the provided date window.',
  })
  @ApiQuery({
    name: 'tickers',
    required: false,
    description:
      'Comma-separated list of ticker symbols. If omitted, returns zero.',
    example: 'AAPL,MSFT,NVDA',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description:
      'Start date (YYYY-MM-DD). Defaults to 24 hours ago if not provided.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date (YYYY-MM-DD). Defaults to today.',
  })
  @Get('stats')
  @Public()
  getNewsStats(
    @Query('tickers') tickers?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const symbols = tickers
      ? tickers
          .split(',')
          .map((t) => t.trim().toUpperCase())
          .filter((t) => !!t)
      : [];

    return this.service.getNewsStats(symbols, from, to);
  }
}
