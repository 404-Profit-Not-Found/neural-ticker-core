import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { WatchlistService } from './watchlist.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Watchlist } from './entities/watchlist.entity';

@ApiTags('Watchlists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/watchlists')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @ApiOperation({
    summary: 'List user watchlists',
    description:
      'Returns all watchlists created by the authenticated user, including their items (tickers).',
  })
  @ApiResponse({
    status: 200,
    description: 'List of watchlists.',
    type: [Watchlist],
  })
  @Get()
  async getMyWatchlists(@Req() req: any) {
    return this.watchlistService.getUserWatchlists(req.user.id);
  }

  @ApiOperation({
    summary: 'Create a new watchlist',
    description: 'Creates a named watchlist container (e.g., "High Risks").',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Tech Moonshots' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Watchlist created.',
    type: Watchlist,
  })
  @Post()
  async createWatchlist(@Req() req: any, @Body('name') name: string) {
    console.log('DEBUG: createWatchlist req.user:', req.user);
    if (!req.user || !req.user.id) {
      console.error('DEBUG: User ID missing in request', req.user);
    }
    return this.watchlistService.createWatchlist(req.user.id, name);
  }

  @ApiOperation({
    summary: 'Rename Watchlist',
    description: 'Updates the name of an existing watchlist.',
  })
  @ApiParam({ name: 'id', example: '1', description: 'Watchlist ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { name: { type: 'string', example: 'New Name' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Watchlist updated.' })
  @Patch(':id') // Nestjs Patch import needed? Checked logic below.
  async updateWatchlist(
    @Req() req: any,
    @Param('id') watchlistId: string,
    @Body('name') name: string,
  ) {
    return this.watchlistService.updateWatchlist(
      req.user.id,
      watchlistId,
      name,
    );
  }

  @ApiOperation({
    summary: 'Add Ticker to Watchlist',
    description:
      'Adds a stock symbol to a specific watchlist. Auto-creates ticker if missing.',
  })
  @ApiParam({ name: 'id', example: '1', description: 'Watchlist ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: { type: 'string', example: 'NVDA' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Ticker added.',
  })
  @Post(':id/items')
  async addItem(
    @Req() req: any,
    @Param('id') watchlistId: string,
    @Body('symbol') symbol: string,
  ) {
    return this.watchlistService.addTickerToWatchlist(
      req.user.id,
      watchlistId,
      symbol,
    );
  }

  @ApiOperation({
    summary: 'Remove Ticker from Watchlist',
    description: 'Removes a specific ticker association from a watchlist.',
  })
  @ApiParam({ name: 'id', example: '1', description: 'Watchlist ID' })
  @ApiParam({
    name: 'tickerId',
    example: '42',
    description: 'Ticker ID (BigInt)',
  })
  @ApiResponse({ status: 200, description: 'Ticker removed.' })
  @Delete(':id/items/:tickerId')
  async removeItem(
    @Req() req: any,
    @Param('id') watchlistId: string,
    @Param('tickerId') tickerId: string,
  ) {
    await this.watchlistService.removeItemFromWatchlist(
      req.user.id,
      watchlistId,
      tickerId,
    );
    return { success: true };
  }

  @ApiOperation({
    summary: 'Delete Watchlist',
    description: 'Deletes a watchlist and all its items for the authenticated user.',
  })
  @ApiParam({ name: 'id', example: '1', description: 'Watchlist ID' })
  @ApiResponse({ status: 200, description: 'Watchlist deleted.' })
  @Delete(':id')
  @HttpCode(200)
  async deleteWatchlist(@Req() req: any, @Param('id') watchlistId: string) {
    await this.watchlistService.deleteWatchlist(req.user.id, watchlistId);
    return { success: true };
  }
}
