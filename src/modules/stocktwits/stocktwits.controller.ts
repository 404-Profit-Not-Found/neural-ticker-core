import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { StockTwitsService } from './stocktwits.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  getSchemaPath,
  ApiExtraModels,
  ApiHeader,
} from '@nestjs/swagger';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';

import { Public } from '../auth/public.decorator';

@ApiTags('StockTwits')
@ApiExtraModels(StockTwitsPost)
@Controller('api/v1/stocktwits')
@Public()
export class StockTwitsController {
  private readonly logger = new Logger(StockTwitsController.name);

  constructor(private readonly stockTwitsService: StockTwitsService) {}

  private validateSecret(secret: string) {
    if (secret !== process.env.CRON_SECRET) {
      this.logger.warn('Unauthorized cron attempt');
      throw new UnauthorizedException('Invalid Cron Secret');
    }
  }

  @Get(':symbol/posts')
  @ApiOperation({
    summary: 'Get cached posts for a symbol',
    description: 'Returns paginated cached StockTwits posts.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of StockTwits posts',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: getSchemaPath(StockTwitsPost) } },
        total: { type: 'number', example: 100 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 50 },
      },
    },
  })
  async getPosts(
    @Param('symbol') symbol: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.stockTwitsService.getPosts(symbol, Number(page), Number(limit));
  }

  @Get(':symbol/watchers')
  @ApiOperation({
    summary: 'Get watcher count history for a symbol',
    description:
      'Returns the historical watcher count records for the given symbol.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of watcher count records',
    type: [StockTwitsWatcher],
  })
  async getWatchersHistory(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getWatchersHistory(symbol);
  }

  @Post(':symbol/sync')
  @ApiOperation({
    summary: 'Trigger manual sync for a symbol',
    description:
      'Triggers an immediate fetch of posts and watcher count from the StockTwits API.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sync triggered successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sync triggered successfully' },
      },
    },
  })
  async triggerSync(@Param('symbol') symbol: string) {
    await this.stockTwitsService.fetchAndStorePosts(symbol);
    await this.stockTwitsService.trackWatchers(symbol);
    return { message: 'Sync triggered successfully' };
  }

  @Post('jobs/sync-posts')
  @ApiOperation({ summary: 'Trigger hourly posts sync (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Job started' })
  async handleHourlyPostsSync(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    await this.stockTwitsService.handleHourlyPostsSync();
    return { message: 'Hourly posts sync completed' };
  }

  @Post('jobs/sync-watchers')
  @ApiOperation({ summary: 'Trigger daily watchers sync (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Job started' })
  async handleDailyWatchersSync(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    await this.stockTwitsService.handleDailyWatchersSync();
    return { message: 'Daily watchers sync completed' };
  }
}
