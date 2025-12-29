import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SocialAnalysisService } from './social-analysis.service';

@ApiTags('Social Analysis Jobs')
@Controller('v1/social-analysis/jobs')
export class SocialAnalysisController {
  private readonly logger = new Logger(SocialAnalysisController.name);

  constructor(private readonly socialAnalysisService: SocialAnalysisService) {}

  private validateSecret(secret: string) {
    if (secret !== process.env.CRON_SECRET) {
      this.logger.warn('Unauthorized cron attempt');
      throw new UnauthorizedException('Invalid Cron Secret');
    }
  }

  @Public() // Accessible by GitHub Actions without user JWT
  @Post('pre-market-analysis')
  @ApiOperation({
    summary: 'Trigger pre-market social analysis (GitHub Actions)',
    description:
      'Runs 30 min before market open. Analyzes social sentiment and extracts events for enabled tickers.',
  })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({
    status: 200,
    description: 'Job completed',
  })
  async handlePreMarketAnalysis(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    const result = await this.socialAnalysisService.runPreMarketAnalysis();
    return { message: 'Pre-market analysis completed', result };
  }

  @Public()
  @Post('cleanup')
  @ApiOperation({
    summary: 'Cleanup old social analyses (GitHub Actions)',
    description: 'Removes analyses older than 30 days',
  })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async handleCleanup(@Headers('X-Cron-Secret') secret: string) {
    this.validateSecret(secret);
    const deleted = await this.socialAnalysisService.cleanupOldAnalyses(30);
    return { message: 'Cleanup completed', deleted };
  }
}
