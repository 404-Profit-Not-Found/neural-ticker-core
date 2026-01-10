import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { TickerRequestsService } from './ticker-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Ticker Requests')
@ApiBearerAuth()
@Controller('v1/ticker-requests')
@UseGuards(JwtAuthGuard)
export class TickerRequestsController {
  constructor(private readonly requestsService: TickerRequestsService) {}

  @ApiOperation({ summary: 'Request a new ticker' })
  @ApiBody({
    schema: { properties: { symbol: { type: 'string', example: 'ORSTED' } } },
  })
  @ApiResponse({ status: 201, description: 'Request created.' })
  @Post()
  create(@Req() req: any, @Body('symbol') symbol: string) {
    if (!symbol) throw new Error('Symbol is required');
    return this.requestsService.createRequest(req.user.id, symbol);
  }

  @ApiOperation({ summary: 'Admin: List all requests' })
  @ApiResponse({ status: 200, description: 'List of requests' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get()
  findAll() {
    return this.requestsService.getRequests();
  }

  @ApiOperation({ summary: 'Admin: Approve a request' })
  @ApiResponse({
    status: 200,
    description: 'Request approved and ticker added.',
  })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.requestsService.approveRequest(id);
  }

  @ApiOperation({ summary: 'Admin: Reject a request' })
  @ApiResponse({ status: 200, description: 'Request rejected.' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.requestsService.rejectRequest(id);
  }
}
