import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';

@ApiTags('Ticker')
@ApiBearerAuth()
@Controller('api/v1/tickers')
export class TickersController {
  constructor(private readonly tickersService: TickersService) {}

  @ApiOperation({
    summary: 'List all tickers',
    description: 'Returns a list of all tracked tickers with basic info.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of tickers.',
    schema: {
      example: [{ symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' }],
    },
  })
  @Get()
  getAll() {
    return this.tickersService.getAllTickers();
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
