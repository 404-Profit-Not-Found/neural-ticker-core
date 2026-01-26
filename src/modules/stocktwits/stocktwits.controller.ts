import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Headers,
  UnauthorizedException,
  Logger,
  UseGuards,
  Req,
  Body,
  Delete,
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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StockTwitsPost } from './entities/stocktwits-post.entity';
import { StockTwitsWatcher } from './entities/stocktwits-watcher.entity';

import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreditGuard } from '../research/guards/credit.guard';

@ApiTags('StockTwits')
@ApiBearerAuth()
@ApiExtraModels(StockTwitsPost)
@Controller('v1/stocktwits')
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
  @Public()
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
  @Public()
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
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
  @Public()
  @ApiOperation({ summary: 'Trigger hourly posts sync (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Job started' })
  async handleHourlyPostsSync(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    await this.stockTwitsService.handleHourlyPostsSync();
    return { message: 'Hourly posts sync completed' };
  }

  @Post('jobs/sync-watchers')
  @Public()
  @ApiOperation({ summary: 'Trigger daily watchers sync (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Job started' })
  async handleDailyWatchersSync(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    await this.stockTwitsService.handleDailyWatchersSync();
    return { message: 'Daily watchers sync completed' };
  }

  // --- AI Analysis Endpoints ---

  @Post(':symbol/analyze')
  @UseGuards(JwtAuthGuard, CreditGuard)
  @ApiOperation({ summary: 'Trigger AI Analysis for comments (Costs Credits)' })
  @ApiResponse({ status: 201, description: 'Analysis started/completed' })
  async analyzeComments(
    @Param('symbol') symbol: string,
    @Req() req: any,
    @Body()
    body: { model?: string; quality?: 'low' | 'medium' | 'high' | 'deep' },
  ) {
    const analysis = await this.stockTwitsService.analyzeComments(
      symbol,
      req.user?.id,
      {
        model: body.model,
        quality: body.quality,
      },
    );
    if (!analysis) {
      return { message: 'Not enough data to analyze' };
    }
    return analysis;
  }

  @Get(':symbol/analysis')
  @Public()
  @ApiOperation({ summary: 'Get latest AI analysis' })
  @ApiResponse({ status: 200, description: 'Latest analysis object' })
  async getAnalysis(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getLatestAnalysis(symbol);
  }

  @Get(':symbol/history')
  @Public()
  @ApiOperation({ summary: 'Get analysis history' })
  @ApiResponse({ status: 200, description: 'List of past analyses' })
  async getHistory(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getAnalysisHistory(symbol);
  }

  @Delete('analysis/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a specific analysis (Admin only)' })
  @ApiResponse({ status: 200, description: 'Analysis deleted' })
  async deleteAnalysis(@Param('id') id: string) {
    await this.stockTwitsService.deleteAnalysis(id);
    return { message: 'Deleted' };
  }

  @Get(':symbol/events')
  @Public()
  @ApiOperation({ summary: 'Get future events' })
  @ApiResponse({ status: 200, description: 'List of future events' })
  async getEvents(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getFutureEvents(symbol);
  }

  @Get(':symbol/stats/volume')
  @Public()
  @ApiOperation({ summary: 'Get daily message volume stats' })
  @ApiResponse({ status: 200, description: 'Daily volume stats' })
  async getVolumeStats(@Param('symbol') symbol: string) {
    return this.stockTwitsService.getVolumeStats(symbol);
  }
}
