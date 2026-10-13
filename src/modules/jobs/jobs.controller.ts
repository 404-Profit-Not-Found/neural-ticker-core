import { Controller, Post, Param, UseGuards } from '@nestjs/common';
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
      'Run the risk/reward scanner (Cron) - researches the most-stale tickers and returns when the batch is done',
  })
  @ApiResponse({ status: 201, description: 'Scan completed' })
  async runRiskRewardScanner() {
    // Awaited on purpose — do NOT turn this back into fire-and-forget. Cloud Run
    // only allocates CPU while a request is in flight and may stop an idle
    // instance at any time. When this endpoint returned immediately, the scan
    // kept going only as long as some other request happened to overlap it:
    // the first ticket usually finished, later ones hit DB connection timeouts
    // and "Cannot use a pool after calling end on the pool", and their research
    // notes were left COMPLETED without a risk analysis (or stuck PROCESSING).
    // The batch is sized to finish well inside the 300s request timeout.
    const result = await this.jobsService.runRiskRewardScanner();
    return { message: 'Risk/Reward scan completed', stats: result };
  }

  @Post('cleanup-research')
  @ApiOperation({ summary: 'Fail stuck Research Tickets (Cron)' })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async cleanupResearch() {
    const result = await this.jobsService.cleanupStuckResearch();
    return { message: 'Cleanup completed', stats: result };
  }

  @Post('cleanup-old-research')
  @ApiOperation({
    summary:
      'Purge research notes older than the retention window and sweep orphaned risk analyses (Cron)',
  })
  @ApiResponse({ status: 200, description: 'Old research cleanup completed' })
  async cleanupOldResearch() {
    const result = await this.jobsService.cleanupOldResearch();
    return { message: 'Old research cleanup completed', stats: result };
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

  @Post('fill-pending-orders')
  @ApiOperation({
    summary: 'Fill due pending portfolio orders (Cron)',
    description:
      'Executes buy/sell orders that were queued while the market was closed, ' +
      'now that the relevant market is open. Called from market-hours scheduler.',
  })
  @ApiResponse({ status: 200, description: 'Pending orders processed' })
  async fillPendingOrders() {
    const result = await this.jobsService.fillPendingOrders();
    return { message: 'Pending orders processing triggered', stats: result };
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
