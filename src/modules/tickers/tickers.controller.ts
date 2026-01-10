import {
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Body,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TickersService } from './tickers.service';
import { TickerEntity } from './entities/ticker.entity';

import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Ticker')
@ApiBearerAuth()
@Controller('v1/tickers')
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
  getAll(
    @Query('search') search: string,
    @Query('external') external: string,
    @Req() req: any,
  ) {
    const isPro = req.user?.tier === 'pro' || req.user?.role === 'admin';
    const shouldSearchExternal = isPro && external === 'true';
    return this.tickersService.searchTickers(search, shouldSearchExternal);
  }

  @ApiOperation({
    summary: 'Get total ticker count',
    description: 'Returns the total number of tickers in the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Total ticker count.',
    schema: { example: { count: 150 } },
  })
  @Public()
  @Get('count')
  async getCount() {
    const count = await this.tickersService.getCount();
    return { count };
  }

  @ApiOperation({
    summary: 'Get unique sectors',
    description:
      'Returns a list of all unique sectors present in the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of unique sectors.',
    schema: { example: ['Technology', 'Healthcare'] },
  })
  @Public()
  @Get('sectors')
  getSectors() {
    return this.tickersService.getUniqueSectors();
  }

  @ApiOperation({
    summary: 'Admin: Get hidden (shadow banned) tickers',
    description: 'Returns a list of all hidden tickers. Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of hidden tickers.',
  })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('admin/hidden')
  getHiddenTickers() {
    return this.tickersService.getHiddenTickers();
  }

  @ApiOperation({
    summary: 'Admin: Search tickers',
    description: 'Search tickers including hidden ones. Admin only.',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'missing_logo', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of tickers.' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('admin/search')
  adminSearch(
    @Query('search') search?: string,
    @Query('missing_logo') missingLogo?: string,
  ) {
    const isMissingLogo = missingLogo === 'true';
    return this.tickersService.searchTickersAdmin(search, isMissingLogo);
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
  @Public()
  @ApiOperation({
    summary: 'Ensure ticker exists (Body Payload)',
    description: 'Safe alternative for symbols with special chars (dots).',
  })
  @ApiBody({
    schema: { type: 'object', properties: { symbol: { type: 'string' } } },
  })
  @ApiResponse({ status: 201, description: 'Ticker ensured/created.' })
  @ApiResponse({
    status: 202,
    description: 'Ticker addition queued due to rate limiting.',
  }) // Added
  @Public()
  @Post()
  ensureBody(@Body('symbol') symbol: string) {
    if (!symbol) return;
    return this.tickersService.ensureTicker(symbol.trim());
  }

  @ApiResponse({ status: 404, description: 'Ticker not found in Finnhub.' })
  @ApiResponse({
    status: 202,
    description: 'Ticker addition queued due to rate limiting.',
  }) // Added
  @Public()
  @Post(':symbol')
  ensure(@Param('symbol') symbol: string) {
    return this.tickersService.ensureTicker(symbol.trim());
  }

  @ApiOperation({
    summary: 'Admin: Set ticker hidden status (shadow ban)',
    description: 'Hides or unhides a ticker from suggestions. Admin only.',
  })
  @ApiParam({
    name: 'symbol',
    example: 'INTC',
    description: 'Stock Ticker Symbol',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { hidden: { type: 'boolean', example: true } },
    },
  })
  @ApiResponse({ status: 200, description: 'Ticker visibility updated.' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':symbol/hidden')
  setHidden(@Param('symbol') symbol: string, @Body('hidden') hidden: boolean) {
    return this.tickersService.setTickerHidden(symbol.trim(), hidden);
  }

  @ApiOperation({
    summary: 'Admin: Update ticker logo',
    description: 'Updates the logo URL for a ticker. Admin only.',
  })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiBody({ schema: { properties: { logo_url: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Ticker updated.' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':symbol')
  updateTicker(
    @Param('symbol') symbol: string,
    @Body('logo_url') logoUrl: string,
  ) {
    return this.tickersService.updateLogo(symbol.trim(), logoUrl);
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
  async getLogo(
    @Req() req: any,
    @Param('symbol') symbol: string,
    @Res() res: Response,
  ) {
    const isAdmin = req.user?.role === 'admin';
    const logo = await this.tickersService.getLogo(symbol, isAdmin);
    if (!logo) {
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
  @Public()
  @Get(':symbol')
  get(@Req() req: any, @Param('symbol') symbol: string) {
    const isAdmin = req.user?.role === 'admin';
    return this.tickersService.getTicker(symbol.trim(), isAdmin);
  }
}
