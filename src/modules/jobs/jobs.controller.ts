import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  Logger,
  Param,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';

@ApiTags('Jobs')
@Controller('v1/jobs')
@Public()
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(private readonly jobsService: JobsService) {}

  private validateSecret(secret: string) {
    if (secret !== process.env.CRON_SECRET) {
      this.logger.warn('Unauthorized cron attempt');
      throw new UnauthorizedException('Invalid Cron Secret');
    }
  }

  @Post('sync-daily-candles')
  @ApiOperation({ summary: 'Trigger daily candle sync (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Job started' })
  async syncDailyCandles(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    // process in background or await? Using await to ensure it completes for the cron runner logs
    await this.jobsService.syncDailyCandles();
    return { message: 'Daily candle sync completed' };
  }

  @Post('run-risk-reward-scanner')
  @ApiOperation({ summary: 'Trigger risk/reward scanner (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Job started' })
  async runRiskRewardScanner(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    await this.jobsService.runRiskRewardScanner();
    return { message: 'Risk/Reward scanner completed' };
  }

  @Post('cleanup-research')
  @ApiOperation({ summary: 'Fail stuck Research Tickets (Cron)' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async cleanupResearch(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    const result = await this.jobsService.cleanupStuckResearch();
    return { message: 'Cleanup completed', stats: result };
  }

  @Post('sync-research/:symbol')
  @ApiOperation({
    summary: 'Reprocess research + dedupe analyst ratings for a ticker',
  })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  async syncResearch(
    @Headers('X-Cron-Secret') secret: string,
    @Param('symbol') symbol: string,
  ) {
    this.validateSecret(secret);
    const result = await this.jobsService.syncResearchAndRatings(symbol);
    return { message: 'Sync completed', ...result };
  }
}
