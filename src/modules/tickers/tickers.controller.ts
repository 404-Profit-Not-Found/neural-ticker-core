import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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
    summary: 'Get ticker logo',
    description: 'Serves the cached logo for a ticker from the database.',
  })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'Logo image.' })
  @ApiResponse({ status: 404, description: 'Logo not found.' })
  @Public()
  @Get(':symbol/logo')
  async getLogo(@Param('symbol') symbol: string, @Res() res: Response) {
    const logo = await this.tickersService.getLogo(symbol);
    if (!logo) {
      // Fallback or 404. Since we have ensureTicker running, it should be there.
      // Or we can redirect to the finnhub url via proxy if we have the ticker?
      // For now, strict 404 and let frontend handle default.
      return res.status(404).send('Logo not found');
    }

    res.set('Content-Type', logo.mime_type);
    res.set('Cache-Control', 'public, max-age=604800'); // 7 days
    res.send(logo.image_data);
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
