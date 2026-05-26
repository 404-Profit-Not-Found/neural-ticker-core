import { Controller, Post, Logger, Param, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { MarketDataService } from '../market-data/market-data.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CronSecretGuard } from '../../common/guards/cron-secret.guard';

@ApiTags('Jobs')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Cron-Secret', required: true })
@Controller('v1/jobs')
@Roles('admin')
@Public()
@UseGuards(CronSecretGuard)
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly marketDataService: MarketDataService,
  ) {}

  @Post('sync-daily-candles')
  @ApiOperation({ summary: 'Trigger daily candle sync (Cron)' })
  @ApiResponse({ status: 200, description: 'Job started' })
  async syncDailyCandles() {
    await this.jobsService.syncDailyCandles();
    return { message: 'Daily candle sync completed' };
  }

  @Post('sync-snapshots')
  @ApiOperation({ summary: 'Trigger light snapshot sync - prices only (Cron)' })
  @ApiResponse({ status: 200, description: 'Snapshot sync completed' })
  async syncSnapshots() {
    const result = await this.jobsService.syncSnapshots();
    return { message: 'Snapshot sync completed', stats: result };
  }

  @Post('run-risk-reward-scanner')
  @ApiOperation({
    summary:
      'Trigger risk/reward scanner (Cron) - queues research for tickers with stale (>14d) or missing analysis',
  })
  @ApiResponse({
    status: 202,
    description: 'Scanner queued (runs in background)',
  })
  runRiskRewardScanner() {
    void this.jobsService.runRiskRewardScanner().catch((err) => {
      this.logger.error('Risk/Reward scanner failed in background', err);
    });
    return { message: 'Risk/Reward scanner queued' };
  }

  @Post('cleanup-research')
  @ApiOperation({ summary: 'Fail stuck Research Tickets (Cron)' })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async cleanupResearch() {
    const result = await this.jobsService.cleanupStuckResearch();
    return { message: 'Cleanup completed', stats: result };
  }

  @Post('sync-research/:symbol')
  @ApiOperation({
    summary: 'Reprocess research + dedupe analyst ratings for a ticker',
  })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  async syncResearch(@Param('symbol') symbol: string) {
    const result = await this.jobsService.syncResearchAndRatings(symbol);
    return { message: 'Sync completed', ...result };
  }

  @Post('daily-digest')
  @ApiOperation({ summary: 'Trigger daily news digest generation (Cron)' })
  @ApiResponse({ status: 200, description: 'Digest generation triggered' })
  async runDailyDigest() {
    await this.jobsService.runDailyDigest();
    return { message: 'Daily digest generation triggered' };
  }

  @Post('process-requests')
  @ApiOperation({ summary: 'Process pending async requests (Cron)' })
  @ApiResponse({ status: 200, description: 'Processing triggered' })
  async processPendingRequests() {
    await this.jobsService.processPendingRequests();
    return { message: 'Pending requests processing triggered' };
  }

  @Post('refresh-top-picks')
  @ApiOperation({
    summary: 'Trigger Top Picks Refresh (Cron)',
    description:
      'Refreshes the dashboard "Top Picks" snapshot if stale. Called from market-hours scheduler.',
  })
  @ApiResponse({ status: 200, description: 'Refresh completed' })
  async refreshTopPicks() {
    await this.marketDataService.refreshTopPicks();
    return { message: 'Top Picks refresh triggered' };
  }

  @Post('refresh-portfolios')
  @ApiOperation({
    summary: 'Trigger Active Portfolios Refresh (Cron)',
    description:
      'Refreshes prices for tickers held in active user portfolios. Called from market-hours scheduler.',
  })
  @ApiResponse({ status: 200, description: 'Refresh completed' })
  async refreshPortfolios() {
    await this.marketDataService.updateActivePortfolios();
    return { message: 'Portfolio refresh triggered' };
  }
}
