import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RiskRewardService } from './risk-reward.service';

import { Public } from '../auth/public.decorator';

@ApiTags('Risk/Reward')
@ApiBearerAuth()
@Controller('api/v1/tickers/:symbol/risk-reward')
@Public()
export class RiskRewardController {
  constructor(private readonly service: RiskRewardService) {}

  @ApiOperation({
    summary: 'Get Risk/Reward Analysis (Latest or History)',
    description: `
**Tiered Scoring System**:
1. **Basic Tier**: If available, returns a lightweight scan score.
2. **Deep Tier**: If "Deep Research" was run recently, this endpoint returns the **High-Fidelity Verification Score** derived from that research.
    
**Returns**:
- **RiskAnalysis Object**: Contains separate scores for Financial, Execution, Competition, etc.
- **Scenarios**: Bull/Bear/Base case price targets.
- **Qualitative**: SWOT Analysis (Strengths, Weaknesses, etc).
- **Catalysts**: Upcoming events.
    `,
  })
  @ApiParam({ name: 'symbol', example: 'AAPL', description: 'Stock Ticker Symbol' })
  @ApiQuery({
    name: 'history',
    required: false,
    schema: { type: 'boolean', default: false },
    description: 'If true, returns an array of the last 10 scores to show trends over time.',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest Analysis (object) OR History (array).',
    schema: {
      type: 'object',
      example: {
        ticker: { symbol: 'AAPL' },
        overall_score: 8.2,
        financial_risk: 7.5,
        execution_risk: 4.0,
        scenarios: [
          { scenario_type: 'bull', price_target: 220, probability: 0.2 },
          { scenario_type: 'base', price_target: 180, probability: 0.5 }
        ],
        qualitative_factors: [
             { type: 'strength', description: 'Strong cash position' }
        ]
      }
    },
  })
  @Get()
  getScore(@Param('symbol') symbol: string, @Query('history') history: string) {
    if (history === 'true') {
      return this.service.getScoreHistory(symbol);
    }
    return this.service.getLatestScore(symbol);
  }
}
