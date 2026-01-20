import {
  Controller,
  Get,
  Post,
  Param,
  Inject,
  forwardRef,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TickersService } from './tickers.service';
import { MarketDataService } from '../market-data/market-data.service';
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { ResearchService } from '../research/research.service';
import { Fundamentals } from '../market-data/entities/fundamentals.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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

  @ApiOperation({
    summary: 'Get composite ticker data (Profile, Price, Risk, Research)',
  })
  @ApiParam({ name: 'symbol', example: 'AAPL', description: 'Ticker symbol' })
  @ApiResponse({ status: 200, description: 'Composite data object' })
  @ApiResponse({ status: 404, description: 'Ticker not found' })
  @Get(':symbol/composite')
  async getCompositeData(@Param('symbol') symbol: string) {
    // 1. Get Market Data Snapshot (Handles Ticker existence and Fundamentals)
    // If ticker doesn't exist, getSnapshot attempts to fetch from Finnhub or throws.
    let snapshot;
    try {
      snapshot = await this.marketDataService.getSnapshot(symbol);
    } catch (e) {
      console.error('Error getting snapshot for %s:', symbol, e);
      throw e;
    }

    const { ticker, latestPrice, fundamentals } = snapshot;
    const safeFundamentals = fundamentals || ({} as Partial<Fundamentals>);

    // 2. Parallel Fetching for Risk, Research, and History
    const [riskAnalysis, researchNote, priceHistory, analystRatings] =
      await Promise.all([
        this.riskRewardService.getLatestAnalysis(ticker.id).catch(() => null),
        this.researchService.getLatestNoteForTicker(symbol).catch(() => null),
        this.marketDataService
          .getHistory(
            symbol,
            '1d',
            new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
            new Date().toISOString(),
          )
          .catch(() => []),
        this.marketDataService.getAnalystRatings(symbol).catch(() => []),
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
        description: ticker.description,
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
        ...safeFundamentals,
        market_cap:
          safeFundamentals?.market_cap || ticker.market_capitalization,
        pe_ratio: safeFundamentals?.pe_ttm,
        // Ensure new fields are passed through explicitly if TypeScript or DTO restriction applies,
        // but spread works for generic object return.
        // Explicitly mapping for clarity if API contract demands:
        revenue_ttm: safeFundamentals?.revenue_ttm,
        gross_margin: safeFundamentals?.gross_margin,
        net_profit_margin: safeFundamentals?.net_profit_margin,
        operating_margin: safeFundamentals?.operating_margin,
        roe: safeFundamentals?.roe,
        roa: safeFundamentals?.roa,
        price_to_book: safeFundamentals?.price_to_book,
        book_value_per_share: safeFundamentals?.book_value_per_share,
        free_cash_flow_ttm: safeFundamentals?.free_cash_flow_ttm,
        earnings_growth_yoy: safeFundamentals?.earnings_growth_yoy,
        current_ratio: safeFundamentals?.current_ratio,
        quick_ratio: safeFundamentals?.quick_ratio,
        interest_coverage: safeFundamentals?.interest_coverage,
        debt_to_equity: safeFundamentals?.debt_to_equity,
        dividend_yield: safeFundamentals?.dividend_yield,
        shares_outstanding: ticker.share_outstanding, // Included for UI convenience as requested
      },
      risk_analysis: riskAnalysis
        ? {
            overall_score: riskAnalysis.overall_score,
            // Flattened Risk Dimensions for UI
            financial_risk: riskAnalysis.financial_risk,
            execution_risk: riskAnalysis.execution_risk,
            dilution_risk: riskAnalysis.dilution_risk,
            competitive_risk: riskAnalysis.competitive_risk,
            regulatory_risk: riskAnalysis.regulatory_risk,
            sentiment: riskAnalysis.sentiment,

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
      notes: researchNote ? [researchNote] : [], // Legacy support expects array
      ratings: analystRatings,
      news: {
        sentiment: ticker.news_sentiment,
        score: ticker.news_impact_score,
        summary: ticker.news_summary,
        updated_at: ticker.last_news_update,
        research_id: researchNote?.id,
      },
    };
  }

  @ApiOperation({ summary: 'Trigger background 5-year history sync' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':symbol/sync')
  syncHistory(@Param('symbol') symbol: string) {
    // Fire and forget (or await if fast enough? Better F&F for UI responsiveness)
    this.marketDataService
      .syncTickerHistory(symbol, 5)
      .catch((e) => console.error(e));
    return { status: 'ok', message: 'Sync started' };
  }
}
