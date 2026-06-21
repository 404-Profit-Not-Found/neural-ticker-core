import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { PortfolioAnalysis } from './entities/portfolio-analysis.entity';
import { PortfolioTrade } from './entities/portfolio-trade.entity';
import { PortfolioCashBalance } from './entities/portfolio-cash-balance.entity';
import { CreatePortfolioPositionDto } from './dto/create-portfolio-position.dto';
import { UpdatePortfolioPositionDto } from './dto/update-portfolio-position.dto';
import { SellPositionDto } from './dto/sell-position.dto';
import { CashOperationDto } from './dto/cash-operation.dto';
import { RecordTradeDto } from './dto/record-trade.dto';
import { MarketDataService } from '../market-data/market-data.service';
import { LlmService } from '../llm/llm.service';
import { TickersService } from '../tickers/tickers.service';
import { CreditService } from '../users/credit.service';
import { CurrencyService } from '../currency/currency.service';
import { QuotaService } from '../../common/quota/quota.service';

@Injectable()
export class PortfolioService implements OnModuleInit {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(PortfolioPosition)
    private readonly positionRepo: Repository<PortfolioPosition>,
    @InjectRepository(PortfolioAnalysis)
    private readonly analysisRepo: Repository<PortfolioAnalysis>,
    @Inject(forwardRef(() => MarketDataService))
    private readonly marketDataService: MarketDataService,
    private readonly llmService: LlmService,
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    @Inject(forwardRef(() => CreditService))
    private readonly creditService: CreditService,
    private readonly currencyService: CurrencyService,
    private readonly quota: QuotaService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing PortfolioService...');
    // Auto-heal currency data on startup
    const result = await this.backfillPositionCurrencies();
    this.logger.log(
      `Currency Backfill Result: Updated ${result.updated}, Skipped ${result.skipped}`,
    );
  }

  /**
   * Buy a position. This is the STRICT simulator path: the buy must be funded
   * by simulator cash in the same currency, which is deducted atomically. New
   * users start at a zero balance, so a buy requires depositing cash first.
   * Every buy is mirrored into the append-only trade ledger.
   */
  async create(
    userId: string,
    dto: CreatePortfolioPositionDto,
  ): Promise<PortfolioPosition> {
    // Auto-detect currency from ticker if not explicitly provided (read-only,
    // safe to resolve before taking the per-user lock).
    const currency = await this.resolveCurrency(dto.symbol, dto.currency);

    // Serialize concurrent creates for THIS user inside a transaction. Without
    // the advisory lock, two parallel requests could both pass the count-based
    // quota check before either inserts, letting the user exceed their limit;
    // it also serializes the read-modify-write on the cash balance.
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);

      const repo = tx.getRepository(PortfolioPosition);
      const count = await repo.count({ where: { user_id: userId } });
      await this.quota.assertWithinLimit(userId, 'portfolioPositions', count);

      // Deduct the cost from cash first — throws if the user can't afford it,
      // aborting the transaction before any position/trade is written.
      const cost = this.round2(dto.shares * dto.buy_price);
      await this.adjustCashTx(tx, userId, currency, -cost, { enforce: true });

      const position = repo.create({
        ...dto,
        currency,
        user_id: userId,
      });
      const saved = await repo.save(position);

      await this.insertTradeTx(tx, {
        userId,
        positionId: saved.id,
        symbol: saved.symbol,
        side: 'buy',
        shares: dto.shares,
        price: dto.buy_price,
        currency,
        tradeDate: dto.buy_date,
        source: 'app',
      });

      return saved;
    });
  }

  /**
   * Sell shares of an existing position. Reduces (or closes) the lot, books the
   * realized P&L, credits the proceeds (gross − fees) to the cash balance, and
   * records a SELL trade. Selling more than is held is rejected.
   */
  async sell(
    userId: string,
    positionId: string,
    dto: SellPositionDto,
  ): Promise<{
    position: PortfolioPosition | null;
    trade: PortfolioTrade;
    proceeds: number;
    realized_pnl: number;
    cash_balance: { currency: string; amount: number };
  }> {
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);

      const repo = tx.getRepository(PortfolioPosition);
      const position = await repo.findOne({
        where: { id: positionId, user_id: userId },
      });
      if (!position) {
        throw new NotFoundException('Position not found');
      }

      const held = Number(position.shares);
      const sharesToSell = dto.shares;
      // Tiny epsilon so floating-point representation of a "sell all" doesn't trip.
      if (sharesToSell > held + 1e-9) {
        throw new BadRequestException(
          `Cannot sell ${sharesToSell} shares; only ${held} held.`,
        );
      }

      const price = dto.price;
      const fees = dto.fees ?? 0;
      const currency = position.currency || 'USD';
      const gross = this.round2(sharesToSell * price);
      const proceeds = this.round2(gross - fees);
      const costBasis = this.round2(sharesToSell * Number(position.buy_price));
      const realizedPnl = this.round2(proceeds - costBasis);
      const sellDate = dto.sell_date || this.todayIso();

      // Reduce or close the lot. A full sell deletes the row; the SELL trade is
      // kept (FK is ON DELETE SET NULL), so history survives.
      const remaining = this.round2(held - sharesToSell);
      let updatedPosition: PortfolioPosition | null;
      let tradePositionId: string | null;
      if (remaining <= 0) {
        await repo.remove(position);
        updatedPosition = null;
        tradePositionId = null;
      } else {
        position.shares = remaining;
        updatedPosition = await repo.save(position);
        tradePositionId = position.id;
      }

      const trade = await this.insertTradeTx(tx, {
        userId,
        positionId: tradePositionId,
        symbol: position.symbol,
        side: 'sell',
        shares: sharesToSell,
        price,
        fees,
        realizedPnl,
        currency,
        tradeDate: sellDate,
        source: 'app',
        note: dto.note,
      });

      const cashAfter = await this.adjustCashTx(
        tx,
        userId,
        currency,
        proceeds,
        { enforce: false },
      );

      return {
        position: updatedPosition,
        trade,
        proceeds,
        realized_pnl: realizedPnl,
        cash_balance: { currency, amount: cashAfter },
      };
    });
  }

  /** Current simulator cash balances, one entry per currency (zero rows omitted). */
  async getCashBalances(
    userId: string,
  ): Promise<{ currency: string; amount: number }[]> {
    const repo = this.positionRepo.manager.getRepository(PortfolioCashBalance);
    const rows = await repo.find({
      where: { user_id: userId },
      order: { currency: 'ASC' },
    });
    return rows.map((r) => ({
      currency: r.currency,
      amount: Number(r.amount),
    }));
  }

  /** Add simulator cash to a currency balance. */
  async depositCash(
    userId: string,
    dto: CashOperationDto,
  ): Promise<{ currency: string; amount: number }> {
    const currency = dto.currency || 'USD';
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const amount = await this.adjustCashTx(
        tx,
        userId,
        currency,
        this.round2(dto.amount),
        { enforce: false },
      );
      return { currency, amount };
    });
  }

  /** Withdraw simulator cash from a currency balance (cannot go negative). */
  async withdrawCash(
    userId: string,
    dto: CashOperationDto,
  ): Promise<{ currency: string; amount: number }> {
    const currency = dto.currency || 'USD';
    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);
      const amount = await this.adjustCashTx(
        tx,
        userId,
        currency,
        -this.round2(dto.amount),
        { enforce: true },
      );
      return { currency, amount };
    });
  }

  /** Trade history (most recent first), optionally filtered to one symbol. */
  async getTrades(
    userId: string,
    opts?: { symbol?: string; limit?: number; offset?: number },
  ): Promise<PortfolioTrade[]> {
    const repo = this.positionRepo.manager.getRepository(PortfolioTrade);
    const where: Record<string, unknown> = { user_id: userId };
    if (opts?.symbol) where.symbol = opts.symbol.toUpperCase();
    return repo.find({
      where,
      order: { trade_date: 'DESC', created_at: 'DESC' },
      take: Math.min(opts?.limit ?? 100, 500),
      skip: opts?.offset ?? 0,
    });
  }

  /**
   * Record an externally-executed trade for consolidation (typically via MCP).
   * Permissive by design — it mirrors a trade that already happened elsewhere,
   * so it does NOT enforce sufficient cash; buys may drive the balance negative.
   * Idempotent on `external_id`: re-recording the same key returns the original
   * trade untouched. Sells reduce the given lot, or the oldest matching lot
   * (FIFO) when no `position_id` is supplied; a sell with no matching lot is
   * still recorded as a pure ledger/cash entry.
   */
  async recordTrade(
    userId: string,
    dto: RecordTradeDto,
  ): Promise<{ trade: PortfolioTrade; idempotent: boolean }> {
    const symbol = dto.symbol.toUpperCase();
    const currency = await this.resolveCurrency(symbol, dto.currency);
    const source = dto.source || 'mcp';
    const fees = dto.fees ?? 0;

    return this.positionRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `portfolio:${userId}`,
      ]);

      // Idempotency: a previously-imported external_id is a no-op.
      if (dto.external_id) {
        const existing = await tx.getRepository(PortfolioTrade).findOne({
          where: { user_id: userId, external_id: dto.external_id },
        });
        if (existing) return { trade: existing, idempotent: true };
      }

      const posRepo = tx.getRepository(PortfolioPosition);

      if (dto.side === 'buy') {
        // Cash mirror (allowed to go negative) + open a new lot.
        const cost = this.round2(dto.shares * dto.price + fees);
        await this.adjustCashTx(tx, userId, currency, -cost, {
          enforce: false,
        });
        const position = posRepo.create({
          user_id: userId,
          symbol,
          shares: dto.shares,
          buy_price: dto.price,
          buy_date: dto.trade_date,
          currency,
        });
        const saved = await posRepo.save(position);
        const trade = await this.insertTradeTx(tx, {
          userId,
          positionId: saved.id,
          symbol,
          side: 'buy',
          shares: dto.shares,
          price: dto.price,
          fees,
          currency,
          tradeDate: dto.trade_date,
          source,
          externalId: dto.external_id,
          note: dto.note,
        });
        return { trade, idempotent: false };
      }

      // side === 'sell'
      let position: PortfolioPosition | null = null;
      if (dto.position_id) {
        position = await posRepo.findOne({
          where: { id: dto.position_id, user_id: userId },
        });
        if (!position) throw new NotFoundException('Position not found');
      } else {
        position = await posRepo.findOne({
          where: { user_id: userId, symbol },
          order: { buy_date: 'ASC' },
        });
      }

      let realizedPnl: number | null = null;
      let tradePositionId: string | null = null;
      if (position) {
        const held = Number(position.shares);
        const sell = Math.min(dto.shares, held);
        const costBasis = this.round2(sell * Number(position.buy_price));
        const proceedsForLot = this.round2(sell * dto.price);
        realizedPnl = this.round2(proceedsForLot - costBasis);
        const remaining = this.round2(held - sell);
        if (remaining <= 0) {
          await posRepo.remove(position);
          tradePositionId = null;
        } else {
          position.shares = remaining;
          await posRepo.save(position);
          tradePositionId = position.id;
        }
      }

      const proceeds = this.round2(dto.shares * dto.price - fees);
      await this.adjustCashTx(tx, userId, currency, proceeds, {
        enforce: false,
      });
      const trade = await this.insertTradeTx(tx, {
        userId,
        positionId: tradePositionId,
        symbol,
        side: 'sell',
        shares: dto.shares,
        price: dto.price,
        fees,
        realizedPnl,
        currency,
        tradeDate: dto.trade_date,
        source,
        externalId: dto.external_id,
        note: dto.note,
      });
      return { trade, idempotent: false };
    });
  }

  /**
   * Net-worth summary: market value of holdings + simulator cash, in an optional
   * display currency. Holdings value is reused from findAll (already converted);
   * cash is converted best-effort (native amount kept if no FX rate is available).
   */
  async getPortfolioSummary(
    userId: string,
    displayCurrency?: string,
  ): Promise<{
    currency: string;
    holdings_value: number;
    cash_value: number;
    net_worth: number;
    positions_count: number;
    cash_balances: { currency: string; amount: number }[];
  }> {
    const positions = await this.findAll(userId, displayCurrency);
    const holdingsValue = positions.reduce(
      (sum, p) => sum + (Number(p.current_value) || 0),
      0,
    );

    const cash = await this.getCashBalances(userId);
    let cashValue = 0;
    for (const c of cash) {
      if (displayCurrency && c.currency !== displayCurrency) {
        const rate = await this.currencyService.getRate(
          c.currency,
          displayCurrency,
        );
        cashValue += rate != null ? c.amount * rate : c.amount;
      } else {
        cashValue += c.amount;
      }
    }

    const currency = displayCurrency || positions[0]?.currency || 'USD';
    return {
      currency,
      holdings_value: this.round2(holdingsValue),
      cash_value: this.round2(cashValue),
      net_worth: this.round2(holdingsValue + cashValue),
      positions_count: positions.length,
      cash_balances: cash,
    };
  }

  // ---------------------------------------------------------------------------
  // Trading-simulator internals
  // ---------------------------------------------------------------------------

  /** Round to 2 decimals, avoiding binary-float drift on .005 boundaries. */
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Today's date as YYYY-MM-DD (the column type is a plain date). */
  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Resolve a trade currency: explicit value wins, else the ticker's native currency. */
  private async resolveCurrency(
    symbol: string,
    explicit?: string,
  ): Promise<string> {
    if (explicit) return explicit;
    const ticker = await this.tickersService.findOneBySymbol(symbol);
    return ticker?.currency || 'USD';
  }

  /**
   * Apply a signed delta to a (user, currency) cash balance inside a transaction
   * and return the new amount. Find-or-create then mutate; the caller must hold
   * the per-user advisory lock so this read-modify-write is race-free. With
   * `enforce`, a resulting negative balance is rejected.
   */
  private async adjustCashTx(
    tx: EntityManager,
    userId: string,
    currency: string,
    delta: number,
    opts: { enforce: boolean },
  ): Promise<number> {
    const repo = tx.getRepository(PortfolioCashBalance);
    let row = await repo.findOne({
      where: { user_id: userId, currency },
    });
    if (!row) {
      row = repo.create({ user_id: userId, currency, amount: 0 });
    }
    const current = Number(row.amount);
    const next = this.round2(current + delta);
    if (opts.enforce && next < 0) {
      throw new BadRequestException(
        `Insufficient ${currency} cash: need ${Math.abs(delta).toFixed(2)}, ` +
          `have ${current.toFixed(2)}. Deposit cash first.`,
      );
    }
    row.amount = next;
    await repo.save(row);
    return next;
  }

  /** Insert an append-only trade-ledger row inside a transaction. */
  private async insertTradeTx(
    tx: EntityManager,
    t: {
      userId: string;
      positionId?: string | null;
      symbol: string;
      side: 'buy' | 'sell';
      shares: number;
      price: number;
      fees?: number;
      realizedPnl?: number | null;
      currency: string;
      tradeDate: string;
      source?: string;
      externalId?: string | null;
      note?: string | null;
    },
  ): Promise<PortfolioTrade> {
    const repo = tx.getRepository(PortfolioTrade);
    const trade = repo.create({
      user_id: t.userId,
      position_id: t.positionId ?? null,
      symbol: t.symbol,
      side: t.side,
      shares: t.shares,
      price: t.price,
      total_value: this.round2(t.shares * t.price),
      fees: t.fees ?? 0,
      realized_pnl: t.realizedPnl ?? null,
      currency: t.currency,
      trade_date: t.tradeDate,
      source: t.source ?? 'app',
      external_id: t.externalId ?? null,
      note: t.note ?? null,
    });
    return repo.save(trade);
  }

  async findAll(userId: string, displayCurrency?: string): Promise<any[]> {
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
      // Base result in native currency
      const result = {
        ...pos,
        ...snapshot, // Spread the full snapshot (ticker, fundamentals, aiAnalysis, etc.)
        current_price: currentPrice,
        change_percent: changePercent,
        current_value: currentValue,
        cost_basis: costBasis,
        gain_loss: gainLoss,
        gain_loss_percent: gainLossPercent,
      };

      return result;
    });

    // If displayCurrency is specified and differs, convert values
    if (displayCurrency) {
      const conversions = await Promise.all(
        enriched.map(async (pos) => {
          const nativeCurrency = pos.currency || 'USD';
          if (nativeCurrency === displayCurrency) {
            return { ...pos, display_currency: displayCurrency };
          }
          const rate = await this.currencyService.getRate(
            nativeCurrency,
            displayCurrency,
          );

          if (rate === null) {
            return {
              ...pos,
              display_currency: displayCurrency,
              conversion_unavailable: true,
            };
          }

          return {
            ...pos,
            original_currency: pos.currency,
            original_current_price: pos.current_price,
            original_current_value: pos.current_value,
            original_cost_basis: pos.cost_basis,
            original_gain_loss: pos.gain_loss,
            original_buy_price: pos.buy_price,

            currency: displayCurrency,
            current_price: pos.current_price * rate,
            current_value: pos.current_value * rate,
            cost_basis: pos.cost_basis * rate,
            gain_loss: pos.gain_loss * rate,
            buy_price: pos.buy_price * rate,

            conversion_rate: rate,
          };
        }),
      );
      return conversions;
    }

    return enriched;
  }

  async getAllDistinctPortfolioSymbols(): Promise<string[]> {
    const positions = await this.positionRepo
      .createQueryBuilder('position')
      .select('DISTINCT position.symbol', 'symbol')
      .getRawMany();

    return positions.map((p) => p.symbol);
  }

  /**
   * Backfill currency on positions that have 'USD' default by looking up their ticker's native currency.
   * Call this from a cron job to auto-heal existing positions.
   */
  async backfillPositionCurrencies(): Promise<{
    updated: number;
    skipped: number;
  }> {
    const positions = await this.positionRepo.find({
      where: { currency: 'USD' }, // Only positions with default USD
    });

    let updated = 0;
    let skipped = 0;

    for (const pos of positions) {
      const ticker = await this.tickersService.findOneBySymbol(pos.symbol);
      if (ticker && ticker.currency && ticker.currency !== 'USD') {
        pos.currency = ticker.currency;
        await this.positionRepo.save(pos);
        updated++;
      } else {
        skipped++;
      }
    }

    return { updated, skipped };
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

  async getQuickRecommendation(userId: string): Promise<{
    recommendation: string;
    model: string;
    positions: number;
  }> {
    const portfolio = await this.findAll(userId);
    if (portfolio.length === 0) {
      return {
        recommendation:
          'No positions yet. Add stocks to your portfolio to get recommendations.',
        model: 'none',
        positions: 0,
      };
    }

    const portfolioSummary = portfolio
      .map(
        (p) =>
          `- ${p.symbol}: ${p.shares} shares @ $${p.buy_price} (Now: $${p.current_price.toFixed(2)}, G/L: ${p.gain_loss_percent.toFixed(2)}%)`,
      )
      .join('\n');

    const prompt = `Analyze this portfolio and give 3 concise, actionable recommendations.

PORTFOLIO:
${portfolioSummary}

OUTPUT FORMAT (strict Markdown):
### Diversification
[1 sentence assessment]

### Risk Flags
[1-2 sentences on concentration / drawdown risks]

### Next Moves
1. [Specific action: Trim/Add/Hold + ticker + 1-line rationale]
2. [Specific action: Trim/Add/Hold + ticker + 1-line rationale]
3. [Specific action: Trim/Add/Hold + ticker + 1-line rationale]

Keep total under 150 words. Be direct, no boilerplate.`;

    const result = await this.llmService.generateResearch({
      question: prompt,
      tickers: portfolio.map((p) => p.symbol),
      numericContext: {},
      quality: 'recommendation',
      provider: 'gemini',
      maxTokens: 400,
    });

    return {
      recommendation: result.answerMarkdown,
      model: result.models[0] || 'gemma-4-31b-it',
      positions: portfolio.length,
    };
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
