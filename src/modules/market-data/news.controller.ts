import { Controller, Get, Query } from '@nestjs/common';
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
@Public()
export class NewsController {
  constructor(
    private readonly service: MarketDataService,
    private readonly researchService: ResearchService,
  ) {}

  @ApiOperation({ summary: 'Get Daily AI News Digest' })
  @Get('digest')
  async getDailyDigest() {
    const digest = await this.researchService.getCachedDigest();
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
  async getGeneralNews() {
    return this.service.getGeneralNews();
  }

  // Temporary: Force trigger digest generation
  @Get('digest/trigger')
  async triggerDigest() {
    // CLEAR CACHE hack: accessing private via any or just relying on overwrite logic
    // Actually generateDailyDigest overwrites the cache.
    return this.researchService.generateDailyDigest();
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
