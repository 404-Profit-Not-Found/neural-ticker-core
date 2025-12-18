import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { PortfolioAnalysis } from './entities/portfolio-analysis.entity';
import { CreatePortfolioPositionDto } from './dto/create-portfolio-position.dto';
import { UpdatePortfolioPositionDto } from './dto/update-portfolio-position.dto';
import { MarketDataService } from '../market-data/market-data.service';
import { LlmService } from '../llm/llm.service';
import { TickersService } from '../tickers/tickers.service';
import { CreditService } from '../users/credit.service';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioPosition)
    private readonly positionRepo: Repository<PortfolioPosition>,
    @InjectRepository(PortfolioAnalysis)
    private readonly analysisRepo: Repository<PortfolioAnalysis>,
    private readonly marketDataService: MarketDataService,
    private readonly llmService: LlmService,
    private readonly tickersService: TickersService,
    private readonly creditService: CreditService,
  ) {}

  async create(
    userId: string,
    dto: CreatePortfolioPositionDto,
  ): Promise<PortfolioPosition> {
    const position = this.positionRepo.create({
      ...dto,
      user_id: userId,
    });
    return this.positionRepo.save(position);
  }

  async findAll(userId: string): Promise<any[]> {
    const positions = await this.positionRepo.find({
      where: { user_id: userId },
      order: { symbol: 'ASC' },
    });

    const symbols = positions.map((p) => p.symbol);
    if (symbols.length === 0) return [];

    let snapshots: any[] = [];
    try {
      // Fetch full snapshots (Price, Risk, Fundamentals) for all symbols
      snapshots = await this.marketDataService.getSnapshots(symbols);
    } catch {
      // Fallback to empty if fails
    }

    // Create a map for fast lookup
    const snapshotMap = new Map();
    snapshots.forEach((s) => {
      if (s && s.ticker) {
        snapshotMap.set(s.ticker.symbol, s);
      }
    });

    const enriched = positions.map((pos) => {
      const snapshot = snapshotMap.get(pos.symbol);

      // Default values from position or fallback
      let currentPrice = Number(pos.buy_price);
      let changePercent = 0;

      if (snapshot && snapshot.latestPrice) {
        currentPrice = Number(snapshot.latestPrice.close);
        changePercent = Number(snapshot.latestPrice.change || 0); // Assuming 'change' or similar property exists, or calculate diff
        // If latestPrice has 'change' (daily change %), use it.
        // Finnhub quote usually has 'dp'. MarketDataService.getSnapshot maps quote to OHLCV.
        // Let's check MarketDataService.getSnapshot logic.
        // It maps Finnhub quote: o, h, l, c, pc.
        // It doesn't explicitly save 'change' or 'dp' to OHLCV entity usually, unless extended.
        // But getAnalyzerTickers calculates it: ((close - prevClose) / prevClose) * 100

        if (snapshot.latestPrice.prevClose) {
          const close = Number(snapshot.latestPrice.close);
          const prev = Number(snapshot.latestPrice.prevClose);
          if (prev !== 0) {
            changePercent = ((close - prev) / prev) * 100;
          }
        }
      }

      const currentValue = Number(pos.shares) * currentPrice;
      const costBasis = Number(pos.shares) * Number(pos.buy_price);
      const gainLoss = currentValue - costBasis;
      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

      // Merge the full snapshot data into the response
      // This gives frontend access to:
      // - fundamentals (market_cap, pe, sector)
      // - aiAnalysis (risk, upside, rating)
      // - ticker (logo, name)
      // - counts (analysts, news)
      return {
        ...pos,
        ...snapshot, // Spread the full snapshot (ticker, fundamentals, aiAnalysis, etc.)
        current_price: currentPrice,
        change_percent: changePercent,
        current_value: currentValue,
        cost_basis: costBasis,
        gain_loss: gainLoss,
        gain_loss_percent: gainLossPercent,
      };
    });

    return enriched;
  }

  async findOne(userId: string, id: string): Promise<PortfolioPosition> {
    const position = await this.positionRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!position) {
      throw new NotFoundException(`Position not found`);
    }
    return position;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdatePortfolioPositionDto,
  ): Promise<PortfolioPosition> {
    const position = await this.findOne(userId, id);
    Object.assign(position, dto);
    return this.positionRepo.save(position);
  }

  async remove(userId: string, id: string): Promise<void> {
    const position = await this.findOne(userId, id);
    await this.positionRepo.remove(position);
  }

  async analyzePortfolio(
    userId: string,
    riskAppetite: string,
    horizon: string = 'medium-term',
    goal: string = 'growth',
    model: string = 'gemini',
  ): Promise<string> {
    const portfolio = await this.findAll(userId);
    if (portfolio.length === 0) {
      return 'You have no positions to analyze. Add some stocks to your portfolio first.';
    }

    // Deduct Credits
    const cost = this.creditService.getModelCost(model);
    await this.creditService.deductCredits(
      userId,
      cost,
      'portfolio_analysis_spend',
      {
        riskAppetite,
        horizon,
        goal,
        model,
      },
    );

    // Construct Prompt
    const portfolioSummary = portfolio
      .map(
        (p) =>
          `- ${p.symbol}: ${p.shares} shares @ $${p.buy_price} (Current: $${p.current_price.toFixed(2)}). G/L: ${p.gain_loss_percent.toFixed(2)}%`,
      )
      .join('\n');

    const riskDir = this.getRiskInstructions(riskAppetite);
    const horizonDir = this.getHorizonInstructions(horizon);
    const goalDir = this.getGoalInstructions(goal);

    const prompt = `
    ### ANALYST PERSONA & CORE MANDATE
    You are a high-conviction financial strategist.
    TONE: ${riskDir.tone}
    STRATEGY FOCUS: ${goalDir.focus} ${horizonDir.focus}
    
    ### CRITICAL CONSTRAINTS (MANDATORY)
    1. ${riskDir.mandate}
    2. ${horizonDir.mandate}
    3. ${goalDir.mandate}

    ### USER PROFILE
    - Risk Appetite: ${riskAppetite} (Stick to this strictly)
    - Investment Horizon: ${horizon}
    - Primary Goal: ${goal}
    
    ### PORTFOLIO DATA
    ${portfolioSummary}

    ### ANALYSIS TASKS
    1. **Risk-Profile Alignment**: ${riskDir.assessmentGuideline}
    2. **Strategic Moves**: Suggest 1-2 moves (Trim/Sell/Add) explicitly designed to achieve the "${goal}" goal within the ${horizon} timeframe.
    3. **High-Impact Opportunities**: ${goalDir.opportunityGuideline} ${riskDir.suggestionGuideline}
    
    ### FORMATTING
    - DO NOT use generic boilerplate.
    - Be punchy, direct, and opinionated.
    - Max 300 words. Use clear Markdown headings.
    `;

    const response = await this.llmService.generateText(prompt, model);

    // Persist to DB
    const analysis = this.analysisRepo.create({
      userId,
      riskAppetite,
      horizon,
      goal,
      model,
      prompt,
      response,
    });
    await this.analysisRepo.save(analysis);

    return response;
  }

  async getAnalyses(userId: string) {
    return this.analysisRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  private getRiskInstructions(riskAppetite: string) {
    const risk = riskAppetite.toLowerCase();

    if (risk === 'high') {
      return {
        tone: "Aggressive, opportunistic, and calculated. Think 'YOLO' but with financial logic.",
        mandate:
          "Do NOT give conservative or 'safe' advice. The user is here for growth and high-risk plays. If they have high-risk stocks, don't tell them to sell just because they are risky—tell them how to double down or find regular high-beta winners.",
        assessmentGuideline:
          "Embrace the volatility. Identify if the 'alpha' potential is high enough.",
        suggestionGuideline:
          "Suggest similar high-risk, high-reward plays, small-caps, or speculative catalysts. Focus on the 'odds' and potential multiples.",
      };
    }

    if (risk === 'low') {
      return {
        tone: 'Conservative, defensive, and wealth-preserving.',
        mandate:
          'Focus on capital preservation, dividends, and blue-chip stability. Warn against excessive volatility.',
        assessmentGuideline:
          "Flag any speculative positions as dangerous 'mismatches' for a conservative profile.",
        suggestionGuideline:
          'Suggest defensive sectors, index funds, or high-dividend yielding blue chips.',
      };
    }

    // Default: Medium
    return {
      tone: 'Balanced, rational, and growth-oriented.',
      mandate:
        "Balance risk and reward. Avoid extreme speculative plays but don't be overly defensive.",
      assessmentGuideline:
        'Identify the core holdings and suggest trimming outliers that are either too risky or too stagnant.',
      suggestionGuideline:
        'Suggest established growth stocks and sector-leading companies.',
    };
  }

  private getHorizonInstructions(horizon: string) {
    const h = horizon.toLowerCase();
    if (h.includes('short')) {
      return {
        focus: 'Immediate catalysts, technical setups, and liquidity.',
        mandate:
          'Ignore 5-year outlooks; focus on what moves the needle in the next 3-6 months.',
      };
    }
    if (h.includes('long')) {
      return {
        focus: 'Fundamental moats, compounding potential, and macro-trends.',
        mandate:
          'Ignore short-term noise; focus on positions that can be held through full market cycles.',
      };
    }
    return {
      focus: 'Medium-term business execution and sector tailwinds.',
      mandate:
        'Focus on the 1-3 year horizon; look for sustainable operational performance.',
    };
  }

  private getGoalInstructions(goal: string) {
    const g = goal.toLowerCase();
    if (g === 'trading' || g.includes('momentum')) {
      return {
        focus: 'Momentum, relative strength, and price action.',
        mandate:
          'Prioritize tickers with high relative strength and clear upward trends.',
        opportunityGuideline:
          "Look for 'hot' sectors and stocks with high institutional accumulation markers.",
      };
    }
    if (g === 'income' || g.includes('dividend')) {
      return {
        focus: 'Cash flow, dividend coverage, and yield stability.',
        mandate: 'Prioritize payout safety and dividend-growth consistency.',
        opportunityGuideline:
          'Identify high-quality yield generators with strong balance sheets.',
      };
    }
    return {
      focus: 'Capital appreciation and revenue growth.',
      mandate:
        'Prioritize companies with accelerating sales or expanding margins.',
      opportunityGuideline:
        'Identify growth engines that are gaining market share.',
    };
  }
}
