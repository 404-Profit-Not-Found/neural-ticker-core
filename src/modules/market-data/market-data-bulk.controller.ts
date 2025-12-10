import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
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
}
