import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';

import { Public } from '../auth/public.decorator';

@ApiTags('Ticker')
@ApiBearerAuth()
@Controller('v1/tickers')
@Public()
export class TickersController {
  constructor(private readonly tickersService: TickersService) {}

  @ApiOperation({
    summary: 'List/search tickers',
    description:
      'Returns a list of tracked tickers. Use ?search= to filter by symbol or name.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter by symbol or name prefix (case-insensitive)',
    example: 'AAP',
  })
  @ApiResponse({
    status: 200,
    description: 'List of tickers.',
    schema: {
      example: [{ symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' }],
    },
  })
  @Get()
  getAll(@Query('search') search?: string) {
    return this.tickersService.searchTickers(search);
  }

  @ApiOperation({
    summary: 'Ensure ticker exists and fetch profile',
    description:
      'Checks if ticker exists in DB. If not, fetches profile from Finnhub and saves it.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'AAPL',
    description: 'Stock Ticker Symbol',
  })
  @ApiResponse({
    status: 201,
    description: 'Ticker ensured/created.',
    type: TickerEntity,
  })
  @ApiResponse({ status: 404, description: 'Ticker not found in Finnhub.' })
  @Post(':symbol')
  ensure(@Param('symbol') symbol: string) {
    return this.tickersService.ensureTicker(symbol);
  }

  @ApiOperation({
    summary: 'Get profile for a ticker',
    description: 'Retrieves the stored profile for a ticker.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'AAPL',
    description: 'Stock Ticker Symbol',
  })
  @ApiResponse({
    status: 200,
    description: 'Ticker profile retrieved.',
    type: TickerEntity,
  })
  @ApiResponse({ status: 404, description: 'Ticker not found.' })
  @Get(':symbol')
  get(@Param('symbol') symbol: string) {
    return this.tickersService.getTicker(symbol);
  }
}
