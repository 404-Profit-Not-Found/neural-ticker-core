import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RiskRewardService } from './risk-reward.service';

@ApiTags('Risk/Reward')
@Controller('api/v1/symbols/:symbol/risk-reward')
export class RiskRewardController {
  constructor(private readonly service: RiskRewardService) {}

  @ApiOperation({ summary: 'Get risk/reward score (latest or history)', description: 'Retrieves the calculated R/R score for a symbol.' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiQuery({ name: 'history', required: false, example: 'true', description: 'Set to "true" to get historical scores.' })
  @ApiResponse({ 
      status: 200, 
      description: 'Score retrieved.',
      schema: { example: { score: 7.5, confidence: 0.8, provider: "openai" } }
  })
  @Get()
  getScore(
      @Param('symbol') symbol: string,
      @Query('history') history: string
  ) {
      if (history === 'true') {
          return this.service.getScoreHistory(symbol);
      }
      return this.service.getLatestScore(symbol);
  }
}
