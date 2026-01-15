import {
  Controller,
  Get,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ResearchService } from './research.service';
import { PublicThrottlerGuard } from './guards/public-throttler.guard';
import { Public } from '../auth/public.decorator';

@ApiTags('Public View')
@Public()
@Controller('v1/public')
export class PublicViewController {
  constructor(private readonly researchService: ResearchService) {}

  @ApiOperation({
    summary: 'Get secure public research report',
    description:
      'Fetches a composite payload of research note, ticker profile, market data, and risk analysis for a read-only view. Requires a valid HMAC signature.',
  })
  @ApiParam({
    name: 'researchId',
    description: 'The UUID of the research note',
  })
  @ApiParam({
    name: 'signature',
    description: 'HMAC-SHA256 signature validating the request',
  })
  @ApiResponse({
    status: 200,
    description: 'Composite payload returned.',
  })
  @ApiResponse({
    status: 403,
    description: 'Invalid or missing signature.',
  })
  @Public() // Bypasses JWT Auth
  @UseGuards(PublicThrottlerGuard) // Applies strict rate limits
  @Get('report/:researchId/:signature')
  async getPublicReport(
    @Param('researchId') researchId: string,
    @Param('signature') signature: string,
  ) {
    try {
      return await this.researchService.getPublicReportData(
        researchId,
        signature,
      );
    } catch (e) {
      if (e.message === 'Invalid signature') {
        throw new ForbiddenException('Access denied: Invalid signature');
      }
      throw e;
    }
  }
}
