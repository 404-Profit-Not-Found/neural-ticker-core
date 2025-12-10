import {
  Controller,
  Get,
  Param,
  Inject,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TickersService } from './tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { ResearchService } from '../research/research.service';

@ApiTags('tickers')
@Controller('v1/tickers')
export class TickerDetailController {
  constructor(
    private readonly tickersService: TickersService,
    @Inject(forwardRef(() => MarketDataService))
    private readonly marketDataService: MarketDataService,
    @Inject(forwardRef(() => RiskRewardService))
    private readonly riskRewardService: RiskRewardService,
    @Inject(forwardRef(() => ResearchService))
    private readonly researchService: ResearchService,
  ) {}

  @Get(':symbol/composite')
  @ApiOperation({
    summary: 'Get composite ticker data (Profile, Price, Risk, Research)',
  })
  async getCompositeData(@Param('symbol') symbol: string) {
    // 1. Get Market Data Snapshot (Handles Ticker existence and Fundamentals)
    // If ticker doesn't exist, getSnapshot attempts to fetch from Finnhub or throws.
    let snapshot;
    try {
      snapshot = await this.marketDataService.getSnapshot(symbol);
    } catch (e) {
      console.error(`Error getting snapshot for ${symbol}:`, e);
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }

    const { ticker, latestPrice, fundamentals } = snapshot;

    // 2. Parallel Fetching for Risk, Research, and History
    const [riskAnalysis, researchNote, priceHistory] = await Promise.all([
      this.riskRewardService.getLatestAnalysis(ticker.id).catch(() => null),
      this.researchService.getLatestNoteForTicker(symbol).catch(() => null),
      this.marketDataService
        .getHistory(
          symbol,
          '1d',
          new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          new Date().toISOString(),
        )
        .catch(() => []),
    ]);

    // 3. Construct Composite Response
    return {
      profile: {
        id: ticker.id,
        symbol: ticker.symbol,
        name: ticker.name,
        exchange: ticker.exchange,
        logo_url: ticker.logo_url,
        industry: ticker.industry,
        sector: ticker.sector,
        web_url: ticker.web_url,
      },
      market_data: {
        price: latestPrice?.close || 0,
        change_percent: latestPrice
          ? ((latestPrice.close - latestPrice.prevClose) /
              latestPrice.prevClose) *
            100
          : 0,
        volume: latestPrice?.volume || 0,
        updated_at: latestPrice?.ts || new Date(),
        history: priceHistory || [],
      },
      fundamentals: {
        market_cap: fundamentals?.market_cap || ticker.market_capitalization,
        pe_ratio: fundamentals?.pe_ttm,
        dividend_yield: fundamentals?.dividend_yield,
        debt_to_equity: fundamentals?.debt_to_equity,
      },
      risk_analysis: riskAnalysis
        ? {
            overall_score: riskAnalysis.overall_score,
            dimensions: {
              financial: riskAnalysis.financial_risk,
              execution: riskAnalysis.execution_risk,
              dilution: riskAnalysis.dilution_risk,
              competitive: riskAnalysis.competitive_risk,
              regulatory: riskAnalysis.regulatory_risk,
            },
            upside_percent: riskAnalysis.upside_percent,
            price_target: riskAnalysis.price_target_weighted,
            scenarios: riskAnalysis.scenarios,
            catalysts: riskAnalysis.catalysts,
            red_flags: riskAnalysis.red_flags,
            updated_at: riskAnalysis.created_at,
          }
        : null,
      research: researchNote
        ? {
            id: researchNote.id,
            question: researchNote.question,
            content: researchNote.answer_markdown,
            updated_at: researchNote.created_at,
          }
        : null,
    };
  }
}
