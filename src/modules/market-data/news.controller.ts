import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { Public } from '../auth/public.decorator';

@ApiTags('News')
@ApiBearerAuth()
@Controller('v1/news')
@Public()
export class NewsController {
  constructor(private readonly service: MarketDataService) {}

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
