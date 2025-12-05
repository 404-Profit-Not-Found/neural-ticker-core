import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SymbolsService } from './symbols.service';
import { SymbolEntity } from './entities/symbol.entity';

@ApiTags('Symbols')
@Controller('api/v1/symbols')
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  @ApiOperation({ summary: 'Ensure symbol exists and fetch profile', description: 'Checks if symbol exists in DB. If not, fetches profile from Finnhub and saves it.' })
  @ApiParam({ name: 'symbol', example: 'AAPL', description: 'Stock Ticker Symbol' })
  @ApiResponse({ status: 201, description: 'Symbol ensured/created.', type: SymbolEntity })
  @ApiResponse({ status: 404, description: 'Symbol not found in Finnhub.' })
  @Post(':symbol')
  ensure(@Param('symbol') symbol: string) {
    return this.symbolsService.ensureSymbol(symbol);
  }

  @ApiOperation({ summary: 'Get profile for a symbol', description: 'Retrieves the stored profile for a symbol.' })
  @ApiParam({ name: 'symbol', example: 'AAPL', description: 'Stock Ticker Symbol' })
  @ApiResponse({ status: 200, description: 'Symbol profile retrieved.', type: SymbolEntity })
  @ApiResponse({ status: 404, description: 'Symbol not found.' })
  @Get(':symbol')
  get(@Param('symbol') symbol: string) {
    return this.symbolsService.getSymbol(symbol);
  }
}
