import { Controller, Get, Param, Post } from '@nestjs/common';
import { StockTwitsService } from './stocktwits.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('StockTwits')
@Controller('api/v1/stocktwits')
export class StockTwitsController {
  constructor(private readonly stockTwitsService: StockTwitsService) {}

  @Get(':symbol/posts')
  @ApiOperation({ summary: 'Get cached posts for a symbol' })
  async getPosts(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getPosts(symbol);
  }

  @Get(':symbol/watchers')
  @ApiOperation({ summary: 'Get watcher count history for a symbol' })
  async getWatchersHistory(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getWatchersHistory(symbol);
  }

  @Post(':symbol/sync')
  @ApiOperation({ summary: 'Trigger manual sync for a symbol' })
  async triggerSync(@Param('symbol') symbol: string) {
    await this.stockTwitsService.fetchAndStorePosts(symbol);
    await this.stockTwitsService.trackWatchers(symbol);
    return { message: 'Sync triggered successfully' };
  }
}
