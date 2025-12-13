import { Body, Controller, Post, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { Public } from '../auth/public.decorator';

@ApiTags('Market Data')
@ApiBearerAuth()
@Controller('v1/market-data')
@Public()
export class MarketDataBulkController {
  constructor(private readonly service: MarketDataService) {}

  @Post('snapshots')
  @ApiOperation({ summary: 'Get snapshots for multiple tickers (Bulk)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: {
            type: 'string',
          },
          example: ['AAPL', 'MSFT', 'TSLA'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Snapshots retrieved.' })
  getSnapshots(@Body() body: { symbols: string[] }) {
    return this.service.getSnapshots(body.symbols || []);
  }

  @ApiOperation({
    summary: 'Get Stock Analyzer Data',
    description:
      'Paginated, sorted, and filtered list of all stocks with analysis.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'sortBy', required: false, example: 'market_cap' })
  @ApiQuery({
    name: 'sortDir',
    required: false,
    example: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @ApiQuery({ name: 'search', required: false, example: 'AAP' })
  @ApiResponse({
    status: 200,
    description: 'Analyzer list retrieved.',
  })
  @Get('analyzer')
  getAnalyzer(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'ASC' | 'DESC',
    @Query('search') search?: string,
  ) {
    return this.service.getAnalyzerTickers({
      page,
      limit,
      sortBy,
      sortDir,
      search,
    });
  }
}
