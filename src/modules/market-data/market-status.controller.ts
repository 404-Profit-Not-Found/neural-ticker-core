import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MarketStatusService } from './market-status.service';
import { Public } from '../auth/public.decorator';

@ApiTags('Market Status')
@ApiBearerAuth()
@Controller('v1/market')
@Public()
export class MarketStatusController {
  constructor(private readonly marketStatusService: MarketStatusService) {}

  @ApiOperation({
    summary: 'Get All Markets Status',
    description:
      'Returns the current status of all major markets (US and EU) for the MarketStatusBar component.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status of US and EU markets.',
    schema: {
      example: {
        us: {
          isOpen: false,
          session: 'pre',
          timezone: 'America/New_York',
          exchange: 'US',
          region: 'US',
          fallback: true,
        },
        eu: {
          isOpen: true,
          session: 'regular',
          timezone: 'Europe/Berlin',
          exchange: 'EU',
          region: 'EU',
          fallback: true,
        },
      },
    },
  })
  @Get('status/all')
  async getAllMarketsStatus() {
    return this.marketStatusService.getAllMarketsStatus();
  }
}
