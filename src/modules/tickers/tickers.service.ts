import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
  Inject,
  forwardRef,
  HttpStatus,
} from '@nestjs/common';
import { getErrorMessage } from '../../utils/error.util';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, ILike, In, MoreThanOrEqual } from 'typeorm';
import { TickerEntity } from './entities/ticker.entity';
import { TickerLogoEntity } from './entities/ticker-logo.entity';
import { TickerRequestEntity } from '../ticker-requests/entities/ticker-request.entity'; // Added
import { PriceOhlcv } from '../market-data/entities/price-ohlcv.entity';
import {
  inferCurrencyFromExchange,
  isUsStyleSymbol,
} from './utils/exchange-currency.util';
import {
  TICKER_SYMBOL_REGEX,
  normalizeTickerSymbol,
} from './utils/ticker-symbol.util';
import { FinnhubService } from '../finnhub/finnhub.service';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { JobsService } from '../jobs/jobs.service'; // Added
import { RequestType } from '../jobs/entities/request-queue.entity'; // Added
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  RequestActor,
  currentActor,
} from '../../common/request-actor/request-actor';

/**
 * 429 for a non-admin user who has created their daily allowance of NEW
 * tickers. A class of its own so callers can tell it from a provider rate
 * limit, which is also a 429 but transient.
 */
export class TickerCreationCapException extends HttpException {
  constructor(limit: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message:
          `You have reached the limit of ${limit} new tickers per day. ` +
          'Tickers already on the platform are not affected. To get another ' +
          'one added, submit a ticker request instead.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class TickersService {
  private readonly logger = new Logger(TickersService.name);

  constructor(
    @InjectRepository(TickerEntity)
    private readonly tickerRepo: Repository<TickerEntity>,
    @InjectRepository(TickerLogoEntity)
    private readonly logoRepo: Repository<TickerLogoEntity>,
    @InjectRepository(PriceOhlcv)
    private readonly ohlcvRepo: Repository<PriceOhlcv>,
    @InjectRepository(TickerRequestEntity) // Added
    private readonly requestRepo: Repository<TickerRequestEntity>, // Added
    @Inject(forwardRef(() => FinnhubService))
    private readonly finnhubService: FinnhubService,
    private readonly yahooFinanceService: YahooFinanceService,
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService: JobsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getTicker(symbol: string, isAdmin = false): Promise<TickerEntity> {
    // If not in DB, try to fetch from Finnhub via ensureTicker
    const ticker = await this.ensureTicker(symbol);
    if (!isAdmin && ticker.is_hidden) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }
    return ticker;
  }

  /**
   * Gate for the PUBLIC ticker reads (the composite / snapshot / news /
   * history / profile routes and the anonymous MCP market-data tools). Call it
   * before anything else in the handler.
   *
   * Those reads resolve their symbol through ensureTicker(), which — for a
   * symbol we do not track yet — asks the data providers, INSERTS the ticker
   * and starts its initialisation (history sync + an LLM research run). That
   * is fine for a signed-in user discovering a ticker; an anonymous caller
   * must never be able to trigger it.
   *
   *  1. not a plausible symbol at all (empty, or longer than 32 characters)
   *                                  → 400, without a lookup
   *  2. a ticker we already track    → allowed for everyone, WHATEVER its
   *                                    symbol looks like: the format rule
   *                                    below must never lock an existing
   *                                    listing out (`RELIANCE.NS` is 11
   *                                    characters, indices start with `^`)
   *  3. untracked + malformed        → 400: the strict pattern guards
   *                                    creation and provider calls
   *  4. untracked + anonymous        → 404, whether or not a provider knows
   *                                    the symbol
   *  5. untracked + signed-in        → passes (creation works as before)
   */
  async assertPublicReadAllowed(
    symbol: string,
    isSignedIn: boolean,
  ): Promise<void> {
    const normalized = normalizeTickerSymbol(symbol);
    if (!TickersService.isLookupCandidate(normalized)) {
      throw new BadRequestException('Invalid ticker symbol format');
    }

    const tracked = await this.tickerRepo.count({
      where: { symbol: normalized },
    });
    const refusal = TickersService.publicReadRefusal(
      normalized,
      tracked > 0,
      isSignedIn,
    );
    if (refusal) throw refusal;
  }

  /**
   * The same gate for a LIST of symbols, with one lookup: which of them may be
   * read, and — per refused symbol — why not. Never throws.
   */
  async partitionPublicRead(
    symbols: string[],
    isSignedIn: boolean,
  ): Promise<{
    readable: string[];
    refused: { symbol: string; error: string }[];
  }> {
    const normalized = [
      ...new Set((symbols || []).map((s) => normalizeTickerSymbol(s))),
    ].filter(Boolean);
    const candidates = normalized.filter((s) =>
      TickersService.isLookupCandidate(s),
    );

    const trackedRows = candidates.length
      ? await this.tickerRepo.find({
          where: { symbol: In(candidates) },
          select: ['symbol'],
        })
      : [];
    const tracked = new Set(trackedRows.map((t) => t.symbol));

    const readable: string[] = [];
    const refused: { symbol: string; error: string }[] = [];
    for (const symbol of normalized) {
      const refusal = TickersService.isLookupCandidate(symbol)
        ? TickersService.publicReadRefusal(
            symbol,
            tracked.has(symbol),
            isSignedIn,
          )
        : new BadRequestException('Invalid ticker symbol format');
      if (refusal) refused.push({ symbol, error: refusal.message });
      else readable.push(symbol);
    }
    return { readable, refused };
  }

  /**
   * Short enough to be a symbol, and free of control characters — worth a
   * (parameterised) lookup. A NUL byte in particular cannot be sent to
   * PostgreSQL as text at all: the query fails ("invalid byte sequence") and
   * the public route answered 500 instead of 400.
   */
  private static isLookupCandidate(normalized: string): boolean {
    return (
      normalized.length >= 1 &&
      normalized.length <= 32 &&
      // eslint-disable-next-line no-control-regex
      !/[\u0000-\u001f\u007f]/.test(normalized)
    );
  }

  /** Steps 2-5 of the gate: why this read is refused, or null. */
  private static publicReadRefusal(
    normalized: string,
    isTracked: boolean,
    isSignedIn: boolean,
  ): HttpException | null {
    if (isTracked) return null;
    if (!TICKER_SYMBOL_REGEX.test(normalized)) {
      return new BadRequestException('Invalid ticker symbol format');
    }
    // Same body as the 404 for a ticker that is hidden.
    if (!isSignedIn) {
      return new NotFoundException(`Ticker ${normalized} not found`);
    }
    return null;
  }

  async findOneBySymbol(symbol: string): Promise<TickerEntity | null> {
    return this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
  }

  // Alias for backward compatibility if needed, or primarily used by other services
  async awaitEnsureTicker(symbol: string): Promise<TickerEntity> {
    return this.ensureTicker(symbol);
  }

  async ensureTicker(symbol: string): Promise<TickerEntity> {
    const upperSymbol = symbol.toUpperCase();

    const existing = await this.tickerRepo.findOne({
      where: { symbol: upperSymbol },
    });
    if (existing) {
      // Trigger background logo download if missing, just in case
      if (existing.logo_url && !existing.logo_url.startsWith('http')) {
        // Assume if it's not http, it might be already processed or invalid?
        // Actually we want to check if we have it in logoRepo
        void this.checkAndDownloadLogo(existing);
      } else if (existing.logo_url) {
        void this.checkAndDownloadLogo(existing);
      }
      return existing;
    }

    // From here on this call CREATES a ticker. A non-admin user may only do
    // that a limited number of times a day; refuse before spending a provider
    // call on it. (Checked again, under a lock, at the insert below.)
    const creator = currentActor();
    await this.assertCreationAllowed(creator);

    let profile;
    let source = 'finnhub';

    try {
      this.logger.log(
        `Ticker ${upperSymbol} not found, fetching from Finnhub...`,
      );
      profile = await this.finnhubService.getCompanyProfile(upperSymbol);

      // If Finnhub returns empty object or null, it's a "not found" or "restricted" case for us
      if (!profile || Object.keys(profile).length === 0) {
        this.logger.warn(
          `Finnhub returned no profile for ${upperSymbol}, trying Yahoo Finance fallback...`,
        );
        profile = await this.fetchFromYahoo(upperSymbol);
        source = 'yahoo';
      }
    } catch (error) {
      const status = error.response?.status;
      if (status === 429) {
        this.logger.warn(`Finnhub Rate Limit Exceeded for ${upperSymbol}.`);
        throw new NotFoundException(`Ticker ${upperSymbol} rate limited.`);
      }

      if (status === 401 || status === 403) {
        this.logger.warn(
          `Finnhub restricted access for ${upperSymbol}, trying Yahoo Finance fallback...`,
        );
        profile = await this.fetchFromYahoo(upperSymbol);
        source = 'yahoo';
      } else {
        this.logger.error(
          `Finnhub fetch error for ${upperSymbol}: ${getErrorMessage(error)}`,
        );
        // Final fallback try
        profile = await this.fetchFromYahoo(upperSymbol).catch(async (e) => {
          const msg = (getErrorMessage(e) || '').toLowerCase();
          const statusText = (e.statusText || '').toLowerCase();
          const fullErrorString = JSON.stringify(e).toLowerCase();

          this.logger.warn(
            `Yahoo Error for ${upperSymbol}: ${getErrorMessage(e)}`,
          );

          const isRateLimit =
            (e instanceof HttpException && e.getStatus() === 429) ||
            e.status === 429 ||
            msg.includes('rate limit') ||
            msg.includes('too many requests') ||
            msg.includes('429') ||
            msg.includes('status 429') ||
            msg.includes('crumb') || // Catch "Failed to get crumb" even without 429
            msg.includes('cookie') ||
            statusText.includes('too many requests') ||
            fullErrorString.includes('too many requests') ||
            fullErrorString.includes('429');

          if (isRateLimit) {
            this.logger.error(
              `🚨 YAHOO RATE LIMIT HIT for ${upperSymbol}, queueing for background retry.`,
            );
            await this.jobsService.queueRequest(RequestType.ADD_TICKER, {
              symbol: upperSymbol,
              // The worker creates the ticker on this user's behalf, so the
              // retry still counts against their daily cap.
              ...(TickersService.isCapped(creator)
                ? { requested_by: creator.userId }
                : {}),
            });
            throw new HttpException(
              { message: 'Ticker addition queued', status: 'QUEUED' },
              HttpStatus.ACCEPTED,
            );
          }

          if (e instanceof HttpException) {
            throw e;
          }

          // Log unknown errors but return null (swallow) so we can proceed to 'tick not found' logic or just fail safely
          this.logger.error(
            `Unexpected Yahoo fallback error for ${upperSymbol}: ${getErrorMessage(e)}`,
          );
          return null;
        });
        source = 'yahoo';
      }
    }

    if (!profile) {
      throw new NotFoundException(
        `Ticker ${upperSymbol} not found in any provider`,
      );
    }

    const newTicker = this.tickerRepo.create({
      symbol: upperSymbol,
      name: profile.name || upperSymbol,
      exchange: profile.exchange || 'Unknown',
      // Native trading currency: trust the data provider first; fall back to
      // exchange/symbol inference only when both Finnhub and Yahoo returned
      // nothing (avoids defaulting EU stocks to USD during degraded windows).
      currency:
        profile.currency ||
        inferCurrencyFromExchange(profile.exchange, upperSymbol) ||
        'USD',
      country: profile.country || 'Unknown',
      ipo_date: profile.ipo,
      market_capitalization: profile.marketCapitalization,
      share_outstanding: profile.shareOutstanding,
      phone: profile.phone,
      web_url: profile.weburl,
      logo_url: profile.logo,
      finnhub_industry: profile.finnhubIndustry,
      sector: profile.finnhubIndustry || profile.sector,
      description: profile.description,
      finnhub_raw: source === 'finnhub' ? profile : { yahoo_fallback: profile },
    });

    newTicker.created_by_user_id = creator?.userId ?? null;

    const inserted = await this.insertNewTicker(newTicker, creator);
    // Read the row back the way every later call sees it: the creator column
    // is `select: false` and must not ride along in an API response.
    const savedTicker = await this.tickerRepo.findOneOrFail({
      where: { symbol: upperSymbol },
    });
    if (!inserted) {
      // Another request created the same symbol while we were asking the
      // providers. That request owns the initialisation — starting it here too
      // would research the ticker twice.
      return savedTicker;
    }

    // Initial background sync: Download logo, Fetch Snapshot, History and Research
    void this.jobsService.initializeTicker(savedTicker.symbol);

    // Download logo in background
    if (savedTicker.logo_url) {
      this.downloadAndSaveLogo(savedTicker.id, savedTicker.logo_url).catch(
        (err) =>
          this.logger.error(
            `Failed to download logo for ${savedTicker.symbol}: ${getErrorMessage(err)}`,
          ),
      );
    }

    return savedTicker;
  }

  // --- Per-user daily cap on NEW tickers ---------------------------------

  /** New tickers a non-admin user may create per 24 hours (admins: no cap). */
  static readonly DEFAULT_CREATE_DAILY_LIMIT = 10;

  getCreateDailyLimit(): number {
    const configured = Number(
      this.configService.get('tickers.createDailyLimit'),
    );
    return Number.isInteger(configured) && configured >= 0
      ? configured
      : TickersService.DEFAULT_CREATE_DAILY_LIMIT;
  }

  /** The cap applies to an identified, non-admin user — not to system jobs. */
  private static isCapped(actor: RequestActor | null): actor is RequestActor {
    return !!actor && actor.role !== 'admin';
  }

  /** Tickers this user created in the last 24 hours. */
  private countRecentlyCreatedBy(
    manager: EntityManager,
    userId: string,
  ): Promise<number> {
    return manager.count(TickerEntity, {
      where: {
        created_by_user_id: userId,
        created_at: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });
  }

  private async assertCreationAllowed(
    actor: RequestActor | null,
  ): Promise<void> {
    if (!TickersService.isCapped(actor)) return;
    const limit = this.getCreateDailyLimit();
    const used = await this.countRecentlyCreatedBy(
      this.tickerRepo.manager,
      actor.userId,
    );
    if (used >= limit) throw new TickerCreationCapException(limit);
  }

  /**
   * Inserts the new ticker. Returns false when the symbol was created by a
   * concurrent request in the meantime (unique `symbol`).
   *
   * For a capped user the count and the insert happen in one transaction under
   * an advisory lock keyed by the user, so parallel requests for different
   * symbols cannot all pass the check and overshoot the cap.
   */
  private async insertNewTicker(
    ticker: TickerEntity,
    actor: RequestActor | null,
  ): Promise<boolean> {
    try {
      await this.tickerRepo.manager.transaction(async (manager) => {
        if (TickersService.isCapped(actor)) {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`ticker-create:${actor.userId}`],
          );
          const limit = this.getCreateDailyLimit();
          const used = await this.countRecentlyCreatedBy(manager, actor.userId);
          if (used >= limit) throw new TickerCreationCapException(limit);
        }
        await manager.save(ticker);
      });
      return true;
    } catch (error) {
      // 23505 = unique_violation: lost the race for this symbol.
      if (error?.code === '23505' || error?.driverError?.code === '23505') {
        return false;
      }
      throw error;
    }
  }

  private async checkAndDownloadLogo(ticker: TickerEntity) {
    // Non-blocking check
    try {
      const exists = await this.logoRepo.findOne({
        where: { symbol_id: ticker.id },
      });
      if (!exists && ticker.logo_url) {
        void this.downloadAndSaveLogo(ticker.id, ticker.logo_url);
      }
    } catch (e) {
      this.logger.error(
        `Error checking logo for ${ticker.symbol}: ${getErrorMessage(e)}`,
      );
    }
  }

  /**
   * SSRF guard for server-fetched image URLs (logos). Requires https and
   * rejects localhost / internal hostnames / private/reserved IP literals
   * (incl. cloud metadata 169.254.169.254). Pair with maxRedirects:0 so a
   * redirect can't escape the check.
   */
  static isSafeRemoteImageUrl(rawUrl: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return !TickersService.isPrivateOrReservedHost(host);
  }

  private static isPrivateOrReservedHost(host: string): boolean {
    // IPv6 loopback / link-local (fe80::/10) / unique-local (fc00::/7)
    if (
      host === '::1' ||
      /^fe[89ab]/.test(host) ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return true;
    }
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true; // private / loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }

  async downloadAndSaveLogo(symbolId: string, url: string) {
    if (!url) return;
    if (!TickersService.isSafeRemoteImageUrl(url)) {
      this.logger.warn(
        `Refusing logo download for ticker ID ${symbolId}: unsafe URL ${url}`,
      );
      return;
    }
    try {
      this.logger.debug(
        `Downloading logo for ticker ID ${symbolId} from ${url}`,
      );
      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'arraybuffer',
          maxRedirects: 0,
          // Some image hosts reject a blank/default library User-Agent with
          // HTTP 403 — notably Wikimedia/Wikipedia, a common source of company
          // logos ("Please set a user-agent..."). Send a descriptive UA so the
          // fetch is accepted. maxRedirects stays 0 so the SSRF host check
          // above can't be bypassed via a redirect to a private address.
          headers: {
            'User-Agent':
              'neural-ticker-logo-fetcher/1.0 (+https://neuralticker.com)',
          },
          timeout: 10000,
        }),
      );

      const buffer = Buffer.from(response.data);
      // axios now types header values as a broad union; content-type is a string.
      const mimeType =
        (response.headers['content-type'] as string) || 'image/png';

      const logo = this.logoRepo.create({
        symbol_id: symbolId,
        image_data: buffer,
        mime_type: mimeType,
      });

      await this.logoRepo.save(logo);
      this.logger.log(`Saved logo for ticker ID ${symbolId}`);
    } catch (error) {
      this.logger.error(
        `Failed to download logo from ${url}: ${getErrorMessage(error)}`,
      );
    }
  }

  async getLogo(
    symbol: string,
    isAdmin = false,
  ): Promise<TickerLogoEntity | null> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker || (!isAdmin && ticker.is_hidden)) return null;

    return this.logoRepo.findOne({ where: { symbol_id: ticker.id } });
  }

  async getCount(): Promise<number> {
    return this.tickerRepo.count();
  }

  async getAllTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      // Include `id` so callers can match on the internal primary key instead of
      // the symbol string (symbols drift for suffixed/foreign tickers and are an
      // unreliable join key). Include `currency` so callers (cron syncs,
      // frontend list views) can render prices in their native currency without
      // an extra round-trip.
      select: ['id', 'symbol', 'name', 'exchange', 'currency'],
      where: { is_hidden: false },
      order: { symbol: 'ASC' },
    });
  }

  async searchTickers(
    search?: string,
    includeExternal = false,
  ): Promise<
    Partial<
      TickerEntity & {
        is_locally_tracked: boolean;
        is_queued?: boolean;
        sparkline?: number[] | null;
      }
    >[]
  > {
    if (!search || search.trim() === '') {
      const all = await this.getAllTickers();
      return all.map((t) => ({ ...t, is_locally_tracked: true }));
    }

    const searchPattern = `${search.toUpperCase()}%`;

    // 1. Local DB Search & Pending Request Search
    let dbResults: TickerEntity[] = [];
    let pendingRequests: TickerRequestEntity[] = [];

    try {
      const [results, requests] = await Promise.all([
        this.tickerRepo
          .createQueryBuilder('ticker')
          .select([
            'ticker.id',
            'ticker.symbol',
            'ticker.name',
            'ticker.exchange',
            'ticker.currency',
            'ticker.logo_url',
            'ticker.sector',
            'ticker.finnhub_industry',
          ])
          .where('ticker.is_hidden = :hidden', { hidden: false })
          .andWhere(
            '(UPPER(ticker.symbol) LIKE :pattern OR UPPER(ticker.name) LIKE :pattern)',
            { pattern: searchPattern },
          )
          .orderBy(
            'CASE WHEN UPPER(ticker.symbol) = :exact THEN 1 ELSE 2 END',
            'ASC',
          )
          .addOrderBy('ticker.symbol', 'ASC')
          .setParameter('exact', search.toUpperCase())
          .limit(20)
          .getMany(),
        this.requestRepo.find({
          where: {
            symbol: ILike(`${searchPattern}`),
            status: 'PENDING',
          },
          take: 10,
        }),
      ]);
      dbResults = results;
      pendingRequests = requests;
    } catch (err) {
      this.logger.error(`Local search failed: ${getErrorMessage(err)}`);
      // dbResults and pendingRequests remain empty arrays
    }

    // Batch fetch sparklines for all results in a single query (avoiding N+1)
    const symbolIds = dbResults.map((t) => t.id);
    const sparklineMap = new Map<string, number[]>();

    if (symbolIds.length > 0) {
      try {
        // Single query to get last 14 days of prices for ALL tickers at once
        const allPrices = await this.ohlcvRepo
          .createQueryBuilder('ohlcv')
          .select(['ohlcv.symbol_id', 'ohlcv.close', 'ohlcv.ts'])
          .where('ohlcv.symbol_id IN (:...symbolIds)', { symbolIds })
          .andWhere('ohlcv.timeframe = :timeframe', { timeframe: '1d' })
          // Remove arbitrary date filter to rely on explicit subquery limits if possible,
          // but for bulk mapped queries, 'take' per group is hard in standard SQL/TypeORM without lateral joins.
          // Fallback: Fetch slightly more history (e.g. 30 days) and slice in memory to ensure coverage
          // or use a WINDOW function approach if TypeORM supports it well.
          // SIMPLIFIED APPROACH: Fetch last 30 days calendar, then slice to 14 points per symbol.
          .andWhere('ohlcv.ts >= :fromDate', {
            fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          })
          .orderBy('ohlcv.symbol_id', 'ASC')
          .addOrderBy('ohlcv.ts', 'DESC')
          .getMany();

        // Group by symbol_id
        const groupedPrices = new Map<string, { close: number; ts: Date }[]>();
        for (const price of allPrices) {
          const existing = groupedPrices.get(price.symbol_id) || [];
          existing.push({ close: price.close, ts: price.ts });
          groupedPrices.set(price.symbol_id, existing);
        }

        // Convert to sparkline arrays (reversed for chronological order)
        for (const [symbolId, prices] of groupedPrices) {
          // Take only last 14 points
          const limitedPrices = prices.slice(0, 14);
          sparklineMap.set(
            symbolId,
            limitedPrices.reverse().map((p) => p.close),
          );
        }
      } catch {
        // Gracefully handle sparkline fetch failure (table may not exist or other DB issues)
        this.logger.warn('Sparkline fetch failed');
      }
    }

    const mappedDbResults = dbResults.map((t) => ({
      ...t,
      is_locally_tracked: true,
      sparkline: sparklineMap.get(t.id) || [],
      industry: t.sector || t.finnhub_industry,
    }));

    // Map pending requests to results
    const mappedPendingResults = pendingRequests.map((req) => ({
      symbol: req.symbol,
      name: 'Requested Ticker',
      exchange: 'Unknown',
      logo_url: null,
      is_locally_tracked: false,
      is_queued: true,
      sparkline: null,
    }));

    // Combine Local + Pending (Deduplicate)
    const combinedResults: any[] = [...mappedDbResults];
    const existingSymbols = new Set(
      combinedResults.map((r) => r.symbol.toUpperCase()),
    );

    mappedPendingResults.forEach((r) => {
      if (!existingSymbols.has(r.symbol.toUpperCase())) {
        combinedResults.push(r);
        existingSymbols.add(r.symbol.toUpperCase());
      }
    });

    // 2. External Search (Fallback/Supplement)
    if (search.length >= 2 && includeExternal) {
      try {
        const [finnhubResult, yahooResult, extPendingRequests] =
          await Promise.allSettled([
            this.finnhubService.searchSymbols(search),
            this.yahooFinanceService.search(search),
            this.requestRepo.find({ where: { status: 'PENDING' } }), // Fetch pending requests
          ]);

        const pendingSymbols = new Set<string>();
        if (extPendingRequests.status === 'fulfilled') {
          extPendingRequests.value.forEach((req) =>
            pendingSymbols.add(req.symbol.toUpperCase()),
          );
        }

        const existingSymbols = new Set(
          mappedDbResults.map((t) => t.symbol.toUpperCase()),
        );
        const externalResults: any[] = [];

        // Process Finnhub Results
        if (
          finnhubResult.status === 'fulfilled' &&
          finnhubResult.value?.result &&
          Array.isArray(finnhubResult.value.result)
        ) {
          finnhubResult.value.result.forEach((item: any) => {
            if (!item.symbol) return;
            const sym = item.symbol.toUpperCase();
            // Finnhub results are kept for US-style symbols only (exchange-
            // suffixed ones come from Yahoo below) — which includes US share
            // classes such as BRK.B. Just filter duplicates.
            if (!existingSymbols.has(sym) && isUsStyleSymbol(sym)) {
              existingSymbols.add(sym); // Add to set so Yahoo doesn't duplicate it
              externalResults.push({
                symbol: item.symbol,
                name: item.description,
                exchange: item.type || 'External',
                logo_url: null,
                is_locally_tracked: false,
                is_queued: pendingSymbols.has(sym), // Check if pending
                sparkline: null,
              });
            }
          });
        }

        // Process Yahoo Results
        if (
          yahooResult.status === 'fulfilled' &&
          yahooResult.value?.quotes &&
          Array.isArray(yahooResult.value.quotes)
        ) {
          yahooResult.value.quotes.forEach((item: any) => {
            if (!item.symbol) return;
            const sym = item.symbol.toUpperCase();
            if (!existingSymbols.has(sym)) {
              existingSymbols.add(sym);
              externalResults.push({
                symbol: item.symbol,
                name: item.shortname || item.longname || item.symbol,
                exchange: item.exchDisp || item.exchange || 'External',
                logo_url: null,
                is_locally_tracked: false,
                is_queued: pendingSymbols.has(sym),
                sparkline: null,
              });
            }
          });
        }

        // Return combined (limit external results to avoid huge payload? 20 is safe)
        return [...combinedResults, ...externalResults.slice(0, 20)];
      } catch (err) {
        this.logger.error(`External search failed: ${getErrorMessage(err)}`);
        // If external fails, return combined results
        return combinedResults;
      }
    }

    return combinedResults;
  }

  async getSymbolsByIds(ids: string[] | number[]): Promise<string[]> {
    if (!ids || ids.length === 0) return [];

    const tickers = await this.tickerRepo
      .createQueryBuilder('ticker')
      .select('ticker.symbol')
      .where('ticker.id IN (:...ids)', { ids })
      .getMany();

    return tickers.map((t) => t.symbol);
  }

  async getBulkSparklines(
    symbols: string[],
  ): Promise<Record<string, number[]>> {
    if (!symbols || symbols.length === 0) return {};

    const upperSymbols = symbols.map((s) => s.toUpperCase());
    const results: Record<string, number[]> = {};

    // 1. Fetch from Local DB
    // Symbols passed might be external too.
    // Let's just find tickers in DB for these symbols.
    const dbTickers = await this.tickerRepo
      .createQueryBuilder('ticker')
      .where('ticker.symbol IN (:...upperSymbols)', {
        upperSymbols,
      })
      .getMany();

    const dbSymbolIds = dbTickers.map((t) => t.id);
    const idToSymbol = new Map(dbTickers.map((t) => [t.id, t.symbol]));

    if (dbSymbolIds.length > 0) {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const allPrices = await this.ohlcvRepo
        .createQueryBuilder('ohlcv')
        .select(['ohlcv.symbol_id', 'ohlcv.close', 'ohlcv.ts'])
        .where('ohlcv.symbol_id IN (:...dbSymbolIds)', {
          dbSymbolIds,
        })
        .andWhere('ohlcv.timeframe = :timeframe', { timeframe: '1d' })
        .andWhere('ohlcv.ts >= :fromDate', { fromDate: fourteenDaysAgo })
        .orderBy('ohlcv.ts', 'DESC')
        .getMany();

      const grouped = new Map<string, number[]>();
      for (const p of allPrices) {
        const sym = idToSymbol.get(p.symbol_id);
        if (sym) {
          const existing = grouped.get(sym) || [];
          existing.push(p.close);
          grouped.set(sym, existing);
        }
      }

      for (const [sym, prices] of grouped) {
        // Take last 14 effectively
        results[sym] = prices.slice(0, 14).reverse();
      }
    }

    // 2. Fetch missing from Yahoo Finance in bulk
    const missingSymbols = upperSymbols.filter((s) => !results[s]);
    if (missingSymbols.length > 0) {
      this.logger.log(
        `Fetching bulk sparklines for ${missingSymbols.join(', ')} from Yahoo Finance`,
      );
      const from = new Date();
      from.setDate(from.getDate() - 20); // Get slightly more to ensure 14 close prices

      // Process in smaller chunks to avoid too long URLs or Yahoo limits
      const chunkSize = 10;
      for (let i = 0; i < missingSymbols.length; i += chunkSize) {
        const chunk = missingSymbols.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (symbol) => {
            try {
              const history = await this.yahooFinanceService.getHistorical(
                symbol,
                from,
                new Date(),
                '1d',
              );
              if (Array.isArray(history)) {
                results[symbol] = history
                  .slice(-14)
                  .map((h: any) => h.close)
                  .filter((c) => c !== undefined && c !== null);
              }
            } catch {
              this.logger.warn(`Bulk sparkline fetch failed for ${symbol}`);
            }
          }),
        );
      }
    }

    return results;
  }

  getRepo(): Repository<TickerEntity> {
    return this.tickerRepo;
  }

  // Admin: Shadow ban management
  async setTickerHidden(
    symbol: string,
    hidden: boolean,
  ): Promise<TickerEntity> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }
    ticker.is_hidden = hidden;
    return this.tickerRepo.save(ticker);
  }

  async updateLogo(symbol: string, logoUrl: string): Promise<TickerEntity> {
    const ticker = await this.tickerRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!ticker) {
      throw new NotFoundException(`Ticker ${symbol} not found`);
    }

    ticker.logo_url = logoUrl;
    const saved = await this.tickerRepo.save(ticker);

    // Trigger download in background
    if (logoUrl) {
      this.downloadAndSaveLogo(saved.id, logoUrl).catch((err) =>
        this.logger.error(
          `Failed to download logo for ${saved.symbol}: ${getErrorMessage(err)}`,
        ),
      );
    }

    return saved;
  }

  async getHiddenTickers(): Promise<Partial<TickerEntity>[]> {
    return this.tickerRepo.find({
      select: ['id', 'symbol', 'name', 'exchange', 'currency', 'is_hidden'],
      where: { is_hidden: true },
      order: { symbol: 'ASC' },
    });
  }

  async searchTickersAdmin(
    search?: string,
    missingLogo?: boolean,
  ): Promise<Partial<TickerEntity>[]> {
    const query = this.tickerRepo
      .createQueryBuilder('ticker')
      .select([
        'ticker.id',
        'ticker.symbol',
        'ticker.name',
        'ticker.exchange',
        'ticker.currency',
        'ticker.is_hidden',
        'ticker.logo_url',
      ])
      .orderBy('ticker.symbol', 'ASC')
      .limit(50);

    // Filter by missing logo if requested
    if (missingLogo) {
      query.andWhere(
        '(ticker.logo_url IS NULL OR ticker.logo_url = :empty OR ticker.logo_url = :broken)',
        { empty: '', broken: 'null' }, // Sometimes string 'null' gets saved
      );
    }

    // Apply search calculation if provided
    if (search && search.trim() !== '') {
      const searchPattern = `${search.toUpperCase()}%`;
      query.andWhere(
        '(UPPER(ticker.symbol) LIKE :pattern OR UPPER(ticker.name) LIKE :pattern)',
        { pattern: searchPattern },
      );
    } else if (!missingLogo) {
      // If no search AND no missingLogo filter, just return basic list
      // But we already set up the query, just need to limit it.
      // The default behavior before was:
      // if (!search) return this.tickerRepo.find(...)
      // We can replicate that efficiency or just use the query builder we started.
      // Query builder is fine.
    }

    return query.getMany();
  }

  async getUniqueSectors(): Promise<string[]> {
    // 1. Try to get distinct 'sector' column
    // 2. Fallback to 'finnhub_industry' if sector is null/empty
    // We can just query both or coalesce.
    // Given the current state where `sector` might be null but `finnhub_industry` is populated:
    const results = await this.tickerRepo
      .createQueryBuilder('ticker')
      .select(
        "DISTINCT COALESCE(NULLIF(ticker.sector, ''), ticker.finnhub_industry)",
        'sector',
      )
      .where('ticker.sector IS NOT NULL OR ticker.finnhub_industry IS NOT NULL')
      .andWhere("ticker.sector != '' OR ticker.finnhub_industry != ''")
      .orderBy('sector', 'ASC') // sort by the alias
      .getRawMany();

    return results.map((r) => r.sector).filter((s) => s && s.trim().length > 0);
  }

  /**
   * Get all unique currencies from tracked tickers
   */
  async getUniqueCurrencies(): Promise<string[]> {
    const results = await this.tickerRepo
      .createQueryBuilder('ticker')
      .select('DISTINCT ticker.currency', 'currency')
      .where('ticker.currency IS NOT NULL')
      .andWhere("ticker.currency != ''")
      .orderBy('currency', 'ASC')
      .getRawMany();

    return results
      .map((r) => r.currency)
      .filter((c) => c && c.trim().length > 0);
  }

  /**
   * Backfill currency on existing tickers from Yahoo Finance.
   * Updates tickers where currency is NULL, empty, or 'USD' (potential default).
   */
  async backfillTickerCurrencies(): Promise<{
    updated: number;
    skipped: number;
    failed: number;
  }> {
    this.logger.log('Starting ticker currency backfill...');

    // Get tickers that might need currency updates
    const tickers = await this.tickerRepo.find({
      where: [
        { currency: '' },
        { currency: 'USD' }, // USD might be the default fallback
      ],
    });

    // Also get tickers with NULL currency
    const nullCurrencyTickers = await this.tickerRepo
      .createQueryBuilder('ticker')
      .where('ticker.currency IS NULL')
      .getMany();

    // US-listed tickers (no '.' in symbol) with non-USD currency — likely ADR misclassification
    const misclassifiedUS = await this.tickerRepo
      .createQueryBuilder('ticker')
      .where("ticker.symbol NOT LIKE '%.__'")
      .andWhere("ticker.symbol NOT LIKE '%.%'")
      .andWhere("ticker.currency != 'USD'")
      .andWhere('ticker.currency IS NOT NULL')
      .getMany();

    const allTickers = [...tickers, ...nullCurrencyTickers, ...misclassifiedUS];
    const uniqueTickers = [
      ...new Map(allTickers.map((t) => [t.symbol, t])).values(),
    ];

    this.logger.log(
      `Found ${uniqueTickers.length} tickers to check for currency backfill`,
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const ticker of uniqueTickers) {
      try {
        const quote = await this.yahooFinanceService.getQuote(ticker.symbol);
        let currency = quote?.currency?.toUpperCase();

        // US-listed stocks (no exchange suffix like .DE, .PA, .L) always trade in USD,
        // even if Yahoo reports the company's home currency (e.g. DKK for NVO ADR).
        if (currency && isUsStyleSymbol(ticker.symbol) && currency !== 'USD') {
          this.logger.debug(
            `Overriding reported currency ${currency} -> USD for US-listed ${ticker.symbol}`,
          );
          currency = 'USD';
        }

        // Yahoo returned nothing — try exchange/symbol inference before
        // giving up. Better than leaving an EU ticker on its USD default.
        if (!currency) {
          const inferred = inferCurrencyFromExchange(
            ticker.exchange,
            ticker.symbol,
          );
          if (inferred) {
            this.logger.debug(
              `Inferred currency ${inferred} for ${ticker.symbol} from exchange/suffix`,
            );
            currency = inferred;
          }
        }

        if (currency && currency !== ticker.currency) {
          await this.tickerRepo.update(ticker.id, { currency });
          this.logger.log(
            `Updated ${ticker.symbol} currency: ${ticker.currency} -> ${currency}`,
          );
          updated++;
        } else {
          skipped++;
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
      } catch (error) {
        this.logger.warn(
          `Failed to update currency for ${ticker.symbol}: ${error}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Currency backfill complete. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
    );
    return { updated, skipped, failed };
  }

  private async fetchFromYahoo(symbol: string): Promise<any> {
    try {
      this.logger.log(`Fetching ${symbol} from Yahoo Finance...`);
      // Use catch() on individual calls to avoid total failure if one module is missing (common for international/OTC)
      const summary = await this.yahooFinanceService
        .getSummary(symbol)
        .catch((err) => {
          if (
            getErrorMessage(err) &&
            (getErrorMessage(err).toLowerCase().includes('429') ||
              getErrorMessage(err)
                .toLowerCase()
                .includes('too many requests') ||
              getErrorMessage(err).toLowerCase().includes('crumb') ||
              getErrorMessage(err).toLowerCase().includes('cookie'))
          ) {
            throw new HttpException(
              'Yahoo Finance Rate Limit Exceeded (Summary).',
              429,
            );
          }
          this.logger.warn(
            `Yahoo Summary failed for ${symbol}: ${getErrorMessage(err)}`,
          );
          return null;
        });
      const quote = await this.yahooFinanceService
        .getQuote(symbol)
        .catch((err) => {
          if (
            getErrorMessage(err) &&
            (getErrorMessage(err).toLowerCase().includes('429') ||
              getErrorMessage(err)
                .toLowerCase()
                .includes('too many requests') ||
              getErrorMessage(err).toLowerCase().includes('crumb') ||
              getErrorMessage(err).toLowerCase().includes('cookie'))
          ) {
            throw new HttpException(
              'Yahoo Finance Rate Limit Exceeded (Quote).',
              429,
            );
          }
          this.logger.warn(
            `Yahoo Quote failed for ${symbol}: ${getErrorMessage(err)}`,
          );
          return null; // Return null to continue if just quote fails
        });

      if (!summary && !quote) {
        this.logger.warn(`Both Yahoo summary and quote failed for ${symbol}`);
        return null;
      }

      // Map to a common format similar to Finnhub profile
      // We prioritize any available data
      return {
        name:
          quote?.longName ||
          quote?.shortName ||
          summary?.summaryProfile?.longName ||
          symbol,
        exchange: quote?.fullExchangeName || quote?.exchange || 'External',
        // Same fallback chain as ensureTicker: provider first, then exchange
        // inference, then USD default.
        currency:
          quote?.currency ||
          inferCurrencyFromExchange(
            quote?.fullExchangeName || quote?.exchange,
            symbol,
          ) ||
          'USD',
        country: summary?.summaryProfile?.country || 'Unknown',
        ipo: null,
        marketCapitalization:
          quote?.marketCap ||
          summary?.defaultKeyStatistics?.marketCap ||
          summary?.defaultKeyStatistics?.enterpriseValue,
        shareOutstanding: summary?.defaultKeyStatistics?.sharesOutstanding,
        phone: summary?.summaryProfile?.phone,
        weburl: summary?.summaryProfile?.website,
        logo: null,
        finnhubIndustry:
          summary?.summaryProfile?.industry || summary?.summaryProfile?.sector,
        sector: summary?.summaryProfile?.sector,
        description: summary?.summaryProfile?.longBusinessSummary,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e; // Propagate rate limits
      this.logger.error(
        `Unexpected Yahoo fallback error for ${symbol}: ${getErrorMessage(e)}`,
      );
      return null;
    }
  }
}
