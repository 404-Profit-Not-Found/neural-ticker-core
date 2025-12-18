import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Market Data')
@ApiBearerAuth()
@Controller('v1/market-data')
@UseGuards(JwtAuthGuard)
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
  @ApiQuery({ name: 'risk', required: false, isArray: true, type: String })
  @ApiQuery({ name: 'aiRating', required: false, isArray: true, type: String })
  @ApiQuery({ name: 'upside', required: false, type: String, example: '> 20%' })
  @ApiQuery({ name: 'sector', required: false, isArray: true, type: String })
  @ApiQuery({ name: 'symbols', required: false, isArray: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Analyzer list retrieved.',
  })
  @Get('analyzer')
  getAnalyzer(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'ASC' | 'DESC',
    @Query('search') search?: string,
    @Query('risk') risk?: string[],
    @Query('aiRating') aiRating?: string[],
    @Query('upside') upside?: string,
    @Query('sector') sector?: string[],
    @Query('symbols') symbols?: string[],
  ) {
    return this.service.getAnalyzerTickers({
      page,
      limit,
      sortBy,
      sortDir,
      search,
      risk: Array.isArray(risk) ? risk : risk ? [risk] : [],
      aiRating: Array.isArray(aiRating) ? aiRating : aiRating ? [aiRating] : [],
      upside,
      sector: Array.isArray(sector) ? sector : sector ? [sector] : [],
      symbols: Array.isArray(symbols) ? symbols : symbols ? [symbols] : [],
      isAdmin: req.user?.role === 'admin',
    });
  }
}
