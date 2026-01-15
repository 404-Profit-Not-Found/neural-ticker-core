import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThan, Not } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  ResearchNote,
  LlmProvider,
  ResearchStatus,
} from './entities/research-note.entity';
import { LlmService } from '../llm/llm.service';
import { MarketDataService } from '../market-data/market-data.service'; // Added
import { RiskRewardService } from '../risk-reward/risk-reward.service';
import { QualityTier } from '../llm/llm.types';
import { UsersService } from '../users/users.service';
import { CreditService } from '../users/credit.service'; // Added
import { WatchlistService } from '../watchlist/watchlist.service';
import { PortfolioService } from '../portfolio/portfolio.service';

import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Observable, Subject } from 'rxjs';
import * as crypto from 'crypto';
import { TickersService } from '../tickers/tickers.service';

export interface ResearchEvent {
  type: 'status' | 'thought' | 'source' | 'content' | 'error';
  data: any;
}

import { NotificationsService } from '../notifications/notifications.service';
import { QualityScoringService } from './quality-scoring.service';

@Injectable()
export class ResearchService implements OnModuleInit {
  private readonly logger = new Logger(ResearchService.name);
  private client: GoogleGenAI;
  // Using the model user requested, note: this model ID might change
  private readonly AGENT_MODEL = 'deep-research-pro-preview-12-2025';

  constructor(
    @InjectRepository(ResearchNote)
    private readonly noteRepo: Repository<ResearchNote>,
    private readonly llmService: LlmService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly watchlistService: WatchlistService,
    private readonly portfolioService: PortfolioService,

    private readonly creditService: CreditService,
    private readonly qualityScoringService: QualityScoringService,
    // Inject TickersService to fetch profile data
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
    @Inject(forwardRef(() => MarketDataService))
    private readonly marketDataService: MarketDataService,
    @Inject(forwardRef(() => RiskRewardService))
    private readonly riskRewardService: RiskRewardService,
  ) {
    const apiKey = this.config.get<string>('gemini.apiKey');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  // ... (createResearchTicket, etc. unchanged)

  async createResearchTicket(
    userId: string | null, // Nullable for system jobs
    tickers: string[],
    question: string,
    provider: 'openai' | 'gemini' | 'ensemble' = 'gemini',
    quality: QualityTier = 'deep',
  ): Promise<ResearchNote> {
    const note = this.noteRepo.create({
      request_id: uuidv4(),
      tickers,
      question,
      provider: provider as LlmProvider,
      quality,
      numeric_context: {}, // Filled during processing
      status: ResearchStatus.PENDING,
      user_id: userId || undefined, // TypeORM expects undefined for nullable columns in create() sometimes if strict
    });
    return this.noteRepo.save(note);
  }

  async createManualNote(
    userId: string,
    tickers: string[],
    title: string,
    content: string,
    model?: string,
  ): Promise<ResearchNote> {
    // 1. Create Note
    const note = this.noteRepo.create({
      request_id: uuidv4(),
      tickers,
      question: 'Manual Upload',
      provider: LlmProvider.MANUAL,
      quality: 'manual',
      title,
      answer_markdown: content,
      status: ResearchStatus.COMPLETED,
      user_id: userId,
      numeric_context: {},
      models_used: model ? [model] : [],
    });

    // 2. Judge Quality (Universal Judge)
    try {
      const judgment = await this.qualityScoringService.score(content);
      note.quality_score = Math.round(judgment.score);
      note.rarity = judgment.rarity;
      note.grounding_metadata = {
        judgment_reasoning: judgment.details.reasoning,
      };

      // 3. Reward Credits if applicable
      const rewardMap: Record<string, number> = {
        Common: 1,
        Uncommon: 3,
        Rare: 5,
        Epic: 10,
        Legendary: 25,
      };

      // Store the actual tier name (e.g. "Rare") not the color "Blue"
      // Frontend expects: Common, Uncommon, Rare, Epic, Legendary
      note.rarity = judgment.rarity;

      const reward = rewardMap[judgment.rarity] || 0;
      if (reward > 0) {
        await this.creditService.addCredits(
          userId,
          reward,
          'manual_contribution',
          {
            noteId: note.request_id,
            rarity: judgment.rarity,
            score: judgment.score,
          },
        );
      }
    } catch (e) {
      this.logger.warn('Failed to judge manual note', e);
      // Don't fail the upload just because judging failed
    }

    return this.noteRepo.save(note);
  }

  // REMOVED: judgeResearchQuality - replaced by QualityScoringService
  async contribute(
    userId: string,
    tickers: string[],
    content: string,
  ): Promise<ResearchNote> {
    // Alias for createManualNote with intended semantics
    // Extract title from first line or generic
    const titleLine =
      content.split('\n')[0].substring(0, 50) || 'Community Contribution';
    return this.createManualNote(userId, tickers, titleLine, content);
  }

  // Legacy method kept for compatibility if needed, but forwarded to new flow?
  // Or just removed. I will remove it to force usage of new async flow.
  // The controller was the only user.

  async processTicket(id: string): Promise<void> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) return;

    try {
      note.status = ResearchStatus.PROCESSING;
      await this.noteRepo.save(note);

      // --- SPECIAL HANDLER: MARKET_NEWS ---
      if (note.tickers.includes('MARKET_NEWS')) {
        await this.processMarketNewsTicket(note);
        return;
      }

      // 1. Gather Context
      const context: Record<string, any> = {};
      for (const ticker of note.tickers) {
        try {
          const snapshot = await this.marketDataService.getSnapshot(ticker);
          // Also fetch Risk/Reward Score
          const riskScore = await this.riskRewardService.getLatestScore(ticker);

          context[ticker] = {
            ...snapshot,
            risk_reward: riskScore
              ? {
                  overall_score: riskScore.overall_score,
                  financial_risk: riskScore.financial_risk,
                  execution_risk: riskScore.execution_risk,
                  reward_target: riskScore.price_target_weighted,
                  upside: riskScore.upside_percent,
                  scenarios: riskScore.scenarios?.map((s) => ({
                    type: s.scenario_type,
                    target: s.price_mid,
                  })),
                }
              : 'Not available',
          };
        } catch (e) {
          this.logger.warn(`Failed to fetch context for ${ticker}`, e);
        }
      }

      // 2. Resolve API Key
      let apiKey: string | undefined;
      if (note.user_id) {
        const user = await this.usersService.findById(note.user_id);
        apiKey = user?.preferences?.gemini_api_key;
      }
      // Fallback to System Default if User Key missing
      if (!apiKey) {
        apiKey = process.env.GEMINI_API_KEY;
        this.logger.log(`Using System Default Key for ticket ${id}`);
      } else {
        this.logger.log(`Using User Key for ticket ${id}`);
      }

      // 3. Call LLM
      const dataRequirements = `
CRITICAL DATA REQUIREMENT:
You MUST search for and explicitly include the following TTM (Trailing Twelve Month) and MRQ (Most Recent Quarter) data in your report if available:
- Revenue, Gross Margin, Operating Margin, Net Profit Margin
- ROE, ROA
- Debt-to-Equity, Debt-to-Assets, Interest Coverage
- Current Ratio, Quick Ratio
- P/E, PEG, Price-to-Book
- Free Cash Flow
- Latest Analyst Ratings (Firm, Rating, Price Target)

Present these numbers clearly in the text or a table so they can be parsed for downstream systems.

CRITICAL SECTION REQUIREMENT:
You MUST include a "Risk/Reward Profile" section at the end of your report with the following specific format:
- Overall Score: [0-10] (10 = Best Risk/Reward)
- Financial Risk: [0-10] (10 = High Risk)
- Execution Risk: [0-10] (10 = High Risk)
- Reward Target: Estimated 12m price target ($)
- Upside: % Return to target
- Scenarios:
  - Bull: $X.XX (Rationale)
  - Base: $X.XX (Rationale)
  - Bear: $X.XX (Rationale)
- MANDATORY: Only if Financial Risk is 9+ AND the research explicitly indicates high probability of insolvency/bankruptcy, the Bear Scenario should reflect a 100% downside ($0.00). Otherwise, for high risk (7-9), use a significant drawdown (e.g., -50% to -90%) but keep it non-zero unless liquidation is the only outcome.
`;

      this.logger.log(
        `[Research] Generating note for ${note.tickers.join(', ')}...`,
      );
      // this.logger.log(`[Research] Numeric Context: ${JSON.stringify(context)}`);

      const result = await this.llmService.generateResearch({
        question: note.question + dataRequirements,
        tickers: note.tickers,
        numericContext: context,
        quality: note.quality as QualityTier,
        provider: note.provider as any,
        apiKey,
      });

      // 4. COMPLETE CORE DATA (Allows UI to render results immediately)
      note.status = ResearchStatus.COMPLETED;
      note.answer_markdown = result.answerMarkdown;
      note.full_response = JSON.stringify(result, null, 2);
      note.grounding_metadata = result.groundingMetadata || null;
      note.thinking_process = result.thoughts || null;
      note.tokens_in = result.tokensIn || null;
      note.tokens_out = result.tokensOut || null;
      note.numeric_context = context;
      note.models_used = result.models;

      // 5. INITIAL SAVE - Unlock the UI for polling
      await this.noteRepo.save(note);
      this.logger.log(`Core research saved for ticket ${id}. Unlocking UI.`);

      // 6. EARLY NOTIFICATION: Alert creator now, don't wait for extraction
      if (note.user_id) {
        // Fire and forget notification
        this.notificationsService
          .create(
            note.user_id,
            'research_complete',
            `Research Ready: ${note.tickers.join(', ')}`,
            `Your AI research on ${note.tickers.join(', ')} is complete.`,
            { researchId: note.id, ticker: note.tickers[0] },
          )
          .catch((err) =>
            this.logger.error(
              `Failed to send early notification for ${id}`,
              err,
            ),
          );
      }

      // 7. PARALLEL POST-PROCESSING: Enrichment tasks
      // We wrap these in a separate promise chain so they don't block the caller if we were to await them differently,
      // but here we are in a background processTicket call anyway.
      // However, parallelizing these saves real-world seconds.
      this.logger.log(`Starting parallel enrichment for ticket ${id}...`);

      const enrichmentTasks = [
        // A. Title Generation (Fast)
        this.generateTitle(note.question, result.answerMarkdown, note.tickers)
          .then(async (title) => {
            await this.noteRepo.update(id, { title });
            this.logger.log(`Title generated for ticket ${id}: ${title}`);
          })
          .catch((err) =>
            this.logger.error(`Title generation failed for ticket ${id}`, err),
          ),

        // B. Quality Scoring (Fast)
        this.qualityScoringService
          .score(result.answerMarkdown)
          .then(async (judgment) => {
            const groundingWithJudgment = {
              ...(note.grounding_metadata || {}),
              judgment_reasoning: judgment.details.reasoning,
            };
            await this.noteRepo.update(id, {
              quality_score: Math.round(judgment.score),
              rarity: judgment.rarity,
              grounding_metadata: groundingWithJudgment as any,
            });
            this.logger.log(
              `Quality scored for ticket ${id}: ${judgment.score}`,
            );
          })
          .catch((err) =>
            this.logger.error(`Quality scoring failed for ticket ${id}`, err),
          ),

        // C. Risk Verification (Medium)
        this.riskRewardService
          .evaluateFromResearch(note)
          .catch((err) =>
            this.logger.error(`Risk verification failed for ticket ${id}`, err),
          ),

        // D. Financial Extraction (Slowest)
        this.extractFinancialsFromResearch(
          note.tickers,
          result.answerMarkdown,
        ).catch((err) =>
          this.logger.error(
            `Financial extraction failed for ticket ${id}`,
            err,
          ),
        ),
      ];

      // Since each task now has its own catch block, Promise.all will only reject
      // if something truly catastrophic happens in the promise creation itself.
      // This ensures a failure in Title Gen doesn't mark the whole research as FAILED.
      await Promise.all(enrichmentTasks);

      this.logger.log(`Enrichment complete for ticket ${id}.`);
    } catch (e) {
      this.logger.error(`Ticket ${id} failed`, e);
      note.status = ResearchStatus.FAILED;
      note.error = e.message;
      await this.noteRepo.save(note);

      if (note.user_id) {
        await this.notificationsService.create(
          note.user_id,
          'research_failed',
          `Research Failed: ${note.tickers.join(', ')}`,
          `We encountered an error analyzing ${note.tickers.join(', ')}.`,
          { researchId: note.id, error: e.message },
        );
      }
    }
  }

  /**
   * Manually trigger financial extraction from the latest research note.
   */
  async reprocessFinancials(ticker: string): Promise<void> {
    // Fetch last 5 completed notes
    const notes = await this.noteRepo
      .createQueryBuilder('note')
      .where(':symbol = ANY(note.tickers)', { symbol: ticker })
      .andWhere('note.status = :status', { status: ResearchStatus.COMPLETED })
      .orderBy('note.created_at', 'DESC')
      .take(5)
      .getMany();

    if (!notes || notes.length === 0) {
      throw new NotFoundException(`No research found for ${ticker}`);
    }

    // Process Newest -> Oldest to prioritize latest data
    let foundDescription = false;
    let foundFinancials = false;
    let foundRatings = false;

    this.logger.log(
      `Reprocessing last ${notes.length} notes for ${ticker} (Newest First)...`,
    );

    for (const note of notes) {
      if (foundDescription && foundFinancials && foundRatings) {
        this.logger.log(`All data points found, stopping early.`);
        break;
      }

      // We save only what we haven't found yet to avoid overwriting newer data with older data
      const result = await this.extractFinancialsFromResearch(
        [ticker],
        note.answer_markdown,
        {
          saveDescription: !foundDescription,
          saveFinancials: !foundFinancials,
          saveRatings: !foundRatings,
        },
      );

      if (result.description) foundDescription = true;
      if (result.financials) foundFinancials = true;
      if (result.ratings) foundRatings = true;
    }

    this.logger.log(`Completed reprocessing for ${ticker}`);
  }

  /**
   * Extract financial metrics from text and Upsert to DB.
   * Now smarter: returns what it found so caller can manage "gaps".
   */
  private async extractFinancialsFromResearch(
    tickers: string[],
    text: string,
    options: {
      saveDescription?: boolean;
      saveFinancials?: boolean;
      saveRatings?: boolean;
    } = {}, // Default: save everything
  ): Promise<{ description: boolean; financials: boolean; ratings: boolean }> {
    const {
      saveDescription = true,
      saveFinancials = true,
      saveRatings = true,
    } = options;

    if (tickers.length === 0 || !text)
      return { description: false, financials: false, ratings: false };

    // We process each ticker individually for safety
    for (const ticker of tickers) {
      try {
        const extractionPrompt = `You are a strict data extraction engine.
          Extract the following for ticker "${ticker}" from the provided text.
          
          1. Company Profile (Return as string "description"):
             Extract the 2-3 sentence company description if present. Use null if not found.

          2. Financial Metrics (Return as object "financials"):
             keys: "pe_ttm", "eps_ttm", "dividend_yield", "beta", "debt_to_equity", "revenue_ttm", "net_income_ttm", "gross_margin", "net_profit_margin", "operating_margin", "roe", "roa", "price_to_book", "book_value_per_share", "free_cash_flow_ttm", "earnings_growth_yoy", "current_ratio", "quick_ratio", "interest_coverage", "debt_to_assets", "total_assets", "total_liabilities", "total_debt", "total_cash", "next_earnings_date", "next_earnings_estimate_eps", "consensus_rating".
             Values must be NUMBERS (except "next_earnings_date" as YYYY-MM-DD and "consensus_rating" as string). If not found, use null.

          3. Analyst Ratings (Return as array "ratings"):
             Each object: { "firm": string, "analyst_name": string | null, "rating": "Buy"|"Hold"|"Sell", "price_target": number | null, "rating_date": "YYYY-MM-DD" }
             Extract only recent ratings mentioned.

          Return a SINGLE JSON OBJECT structure (TOON format supported):
          {
            "description": "...",
            "financials": { ... },
            "ratings": [ ... ]
          }
          
          Text:
          ${text.substring(0, 500000)}
          
          Output:`;

        const result = await this.llmService.generateResearch({
          question: extractionPrompt,
          tickers: [ticker],
          numericContext: {},
          quality: 'extraction' as QualityTier,
          provider: 'gemini',
          maxTokens: 1000,
        });

        try {
          // Extract JSON-like block if wrapped in markdown or embedded
          const jsonMatch = result.answerMarkdown.match(/\{[\s\S]*\}/);
          const contentToParse = jsonMatch
            ? jsonMatch[0]
            : result.answerMarkdown;

          let data: any;
          try {
            const cleanContent = contentToParse
              .trim()
              .replace(/,\s*([}\]])/g, '$1');
            data = JSON.parse(cleanContent);
          } catch (e) {
            this.logger.warn(
              `Failed to parse extracted data for ${ticker}: ${e.message}`,
            );
            continue;
          }

          let descriptionFound = false;
          let financialsFound = false;
          let ratingsFound = false;

          if (data.financials) {
            if (saveFinancials) {
              await this.marketDataService.upsertFundamentals(
                ticker,
                data.financials,
              );
            }
            financialsFound = true;
          }

          if (data.description) {
            this.logger.log(
              `Found description for ${ticker}: ${data.description.substring(0, 50)}...`,
            );
            if (saveDescription) {
              await this.marketDataService.updateTickerDescription(
                ticker,
                data.description,
              );
            }
            descriptionFound = true;
          } else {
            this.logger.warn(
              `No description found in extraction for ${ticker}`,
            );
          }

          if (data.ratings && Array.isArray(data.ratings)) {
            if (saveRatings) {
              await this.marketDataService.upsertAnalystRatings(
                ticker,
                data.ratings,
              );
              await this.marketDataService.dedupeAnalystRatings(ticker);
            }
            ratingsFound = true;
          }

          this.logger.log(`Extracted financials & ratings for ${ticker}`);
          return {
            description: descriptionFound,
            financials: financialsFound,
            ratings: ratingsFound,
          };
        } catch (e) {
          this.logger.warn(`Failed to parse extracted data for ${ticker}`, e);
        }
      } catch (e) {
        this.logger.warn(`Failed to extract financials for ${ticker}`, e);
      }
    }
    return { description: false, financials: false, ratings: false }; // placeholder
  }

  /**
   * Generate a concise, informative title based on research findings
   */
  private async generateTitle(
    question: string,
    answerMarkdown: string,
    tickers: string[],
  ): Promise<string> {
    try {
      // Extract first 500 chars of answer for context
      const answerPreview = answerMarkdown.substring(0, 500);

      const titlePrompt = `Based on this financial research, generate a concise, informative title (max 80 characters) that captures the KEY FINDING or CONCLUSION. Focus on actionable insights, not generic descriptions.

Question: ${question}
Tickers: ${tickers.join(', ')}
Research Summary: ${answerPreview}...

Generate ONLY the title, nothing else. Examples of good titles:
- "NVDA Q4 Earnings: 50% Revenue Growth Driven by AI Demand"
- "AAPL Services Revenue Concerns Offset by Strong iPhone Sales"
- "TSLA Production Delays May Impact Q1 Delivery Targets"

Title:`;

      const result = await this.llmService.generateResearch({
        question: titlePrompt,
        tickers: [],
        numericContext: {},
        quality: 'low' as QualityTier, // Fast, cheap call
        provider: 'gemini',
        maxTokens: 50,
      });

      // Clean up the title (remove quotes, trim, limit length)
      let title = result.answerMarkdown
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/\n/g, ' ') // Remove newlines
        .substring(0, 80); // Enforce max length

      // Fallback to generic title if generation fails or is too short
      if (!title || title.length < 10) {
        title = `Research: ${tickers.join(', ')} - ${question.substring(0, 40)}`;
      }

      return title;
    } catch (e) {
      this.logger.warn(`Title generation failed, using fallback`, e);
      return `Research: ${tickers.join(', ')} - ${question.substring(0, 40)}`;
    }
  }

  async getResearchNote(id: string): Promise<ResearchNote | null> {
    // if (id === 'daily-digest-latest') { return ... } // Legacy legacy
    return this.noteRepo.findOne({ where: { id }, relations: ['user'] });
  }

  async getLatestNoteForTicker(symbol: string): Promise<ResearchNote | null> {
    return this.noteRepo
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.user', 'user')
      .where(':symbol = ANY(note.tickers)', { symbol })
      .andWhere('note.status = :status', { status: ResearchStatus.COMPLETED })
      .orderBy('note.created_at', 'DESC')
      .getOne();
  }

  async deleteResearchNote(id: string, userId: string): Promise<void> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) {
      throw new NotFoundException('Research note not found');
    }

    // Check permissions
    const requestor = await this.usersService.findById(userId);
    const isAdmin = requestor?.role === 'admin';
    const isOwner = note.user_id === userId;

    if (!isAdmin && !isOwner) {
      throw new Error(
        'Unauthorized: Only Admin or Owner can delete research notes',
      );
    }

    await this.noteRepo.delete(id);
  }

  async updateTitle(
    id: string,
    userId: string,
    newTitle: string,
  ): Promise<ResearchNote> {
    const note = await this.noteRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!note) {
      throw new Error('Research note not found');
    }

    const requestor = await this.usersService.findById(userId);
    const isAdmin = requestor?.role === 'admin';
    const isOwner = note.user_id === userId;

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized to edit this research title');
    }

    note.title = newTitle;
    return this.noteRepo.save(note);
  }

  async findAll(
    userId: string,
    status: string,
    page: number = 1,
    limit: number = 10,
    ticker?: string,
    sinceHours?: number,
  ): Promise<{
    data: ResearchNote[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = this.noteRepo.createQueryBuilder('note');
    query.leftJoinAndSelect('note.user', 'user');

    // MODIFIED: If ticker is provided, we show ALL research for that ticker (Community View).
    // If NO ticker is provided, we filter by User (My Research View).
    if (!ticker) {
      query.where('note.user_id = :userId', { userId });
    }

    if (status && status !== 'all') {
      query.andWhere('note.status = :status', { status });
    }

    if (ticker) {
      query.andWhere(':ticker = ANY(note.tickers)', { ticker });
      // Exclude generic Daily Digests from the specific ticker's research feed
      query.andWhere('note.title NOT LIKE :excludeTitle', {
        excludeTitle: 'Smart News Briefing%',
      });
    }

    // Filter by Time (e.g. for "New Reports")
    if (sinceHours && sinceHours > 0) {
      const threshold = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
      query.andWhere('note.created_at >= :threshold', { threshold });
    }

    query.orderBy('note.created_at', 'DESC');
    query.skip((page - 1) * limit);
    query.take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async onModuleInit() {
    // On startup, any ticket still "processing" is a zombie from a previous crash/restart.
    // In a single-instance environment, we should fail them to clear the UI.
    await this.failStuckTickets(0);
  }

  async failStuckTickets(staleMinutes: number = 20): Promise<number> {
    const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);

    // If staleMinutes is 0, we want to clear ALL processing tickets (e.g. on startup)
    const where: any = {
      status: ResearchStatus.PROCESSING,
    };

    if (staleMinutes > 0) {
      where.updated_at = LessThan(threshold);
    }

    const stuckNotes = await this.noteRepo.find({ where });

    if (stuckNotes.length === 0) return 0;

    for (const note of stuckNotes) {
      note.status = ResearchStatus.FAILED;
      note.error = 'System Restart: Research interrupted.';
      await this.noteRepo.save(note);
    }

    this.logger.warn(`Cleaned up ${stuckNotes.length} stuck research tickets.`);
    return stuckNotes.length;
  }

  // --- STREAMING & DEEP RESEARCH IMPLEMENTATION ---

  streamResearch(
    ticker: string,
    questions?: string,
  ): Observable<ResearchEvent> {
    const subject = new Subject<ResearchEvent>();
    const prompt = this.buildPrompt(ticker, questions);

    void this.runAgent(prompt, subject); // Run async, don't await here
    return subject.asObservable();
  }

  private async runAgent(prompt: string, subject: Subject<ResearchEvent>) {
    try {
      subject.next({
        type: 'status',
        data: 'Initializing Deep Research Agent...',
      });

      if (!this.client) {
        subject.next({
          type: 'error',
          data: 'Gemini Client not initialized (Missing API Key)',
        });
        subject.complete();
        return;
      }

      // Use the specific Deep Research Agent API as requested
      // Casting to 'any' as 'interactions' might not be in the public declarations of the installed SDK version yet
      const stream = await (this.client as any).interactions.create({
        agent: this.AGENT_MODEL,
        input: prompt,
        background: true, // CRITICAL: Offloads execution to Google to avoid HTTP timeouts
        stream: true,
        agent_config: { thinking_summaries: 'auto' }, // CRITICAL: Shows the "reasoning"
      });

      subject.next({ type: 'status', data: 'Deep Research Agent Running...' });

      for await (const chunk of stream) {
        // 1. Capture Thoughts (The "Thinking" UI)
        if (
          chunk.delta?.type === 'thought_summary' ||
          chunk.delta?.part?.thought
        ) {
          const thoughtText =
            chunk.delta.text || chunk.delta.part?.thought || 'Thinking...';
          subject.next({ type: 'thought', data: thoughtText });
        }

        // 2. Capture Sources (The "Sites Browsed" UI)
        if (chunk.groundingMetadata?.groundingChunks) {
          const sources = chunk.groundingMetadata.groundingChunks.map(
            (c: any) => ({
              title: c.web?.title,
              url: c.web?.uri,
            }),
          );
          subject.next({ type: 'source', data: sources });
        }

        // 3. Capture Content (The Report)
        if (chunk.delta?.type === 'text' || chunk.delta?.text) {
          subject.next({ type: 'content', data: chunk.delta.text });
        }
      }

      subject.complete();
    } catch (err: any) {
      this.logger.error('Deep Research Stream Failed', err);
      // Detailed error logging
      if (err.status) this.logger.error(`Status: ${err.status}`);
      if (err.response)
        this.logger.error(`Response: ${JSON.stringify(err.response)}`);

      subject.next({
        type: 'error',
        data: `Deep Research Failed: ${err.message}`,
      });
      subject.complete();
    }
  }

  private buildPrompt(ticker: string, questions?: string): string {
    return `
      ROLE: Senior Equity Research Analyst.
      TASK: Deep dive due diligence on ${ticker}.
      FOCUS: ${questions || 'Growth, Moat, Risks, Valuation'}.
      REQUIREMENTS:
      1. Use Markdown.
      2. Prioritize 10-K/10-Q filings over news snippets.
      3. Create a Markdown table for last 3y Financials.
      4. Cite every numerical claim.
      5. MANDATORY: End with a "Risk/Reward Profile" section containing: Overall Score (0-10), Financial/Execution Risk scores, Price Targets, and Bull/Base/Bear Scenarios.
      6. MANDATORY: If Financial Risk is estimated at 8 or higher, the Bear Scenario MUST reflect a 100% downside (Price Target: $0.00) with a rationale of potential bankruptcy or insolvency.
    `;
  }

  // --- DAILY DIGEST PERSISTENCE (PERSONALIZED) ---

  async getOrGenerateDailyDigest(userId: string): Promise<ResearchNote | null> {
    if (!userId || userId === 'system-trigger') {
      this.logger.warn(
        `Attempted to generate digest with invalid User ID: ${userId}. Blocking.`,
      );
      return null;
    }

    const today = new Date().toISOString().split('T')[0];
    const titlePattern = `Smart News Briefing (${today}%`;

    // 1. Check DB for today's digest for THIS user (Completed OR Pending)
    const existing = await this.noteRepo.findOne({
      where: {
        user_id: userId,
        title: Like(titlePattern),
        status: Not(ResearchStatus.FAILED),
      },
      order: { created_at: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    // 2. Not found? Generate it.

    // CHECK TUTORIAL COMPLETION (Implied by Portfolio Existence)
    // User Requirement: "digest runs daily for users who have completed tutorial"
    try {
      const portfolio = await this.portfolioService.findAll(userId);
      if (!portfolio || portfolio.length === 0) {
        // Double check specifically for "Tutorial" preference if we want to be strict,
        // but explicit user request implies preventing it if they just added favorites.
        // So we strictly enforce Portfolio presence.
        this.logger.log(
          `Skipping digest for ${userId} - No portfolio positions (Tutorial incomplete).`,
        );
        return null;
      }
    } catch (e) {
      this.logger.warn(
        `Failed to check portfolio for digest eligibility: ${e.message}`,
      );
      // Fail safe: If we can't check, maybe we shouldn't block? Or should we?
      // Let's assume safe to proceed if check fails, or maybe safe to block.
      // Blocking is safer to prevent spam.
      return null;
    }

    // PROTECTION: Create a "Pending" record IMMEDIATELY to block other concurrent requests (race condition fix)
    const pendingNote = this.noteRepo.create({
      user_id: userId,
      request_id: crypto.randomUUID(),
      question: 'Smart News Briefing', // Placeholder
      title: `Smart News Briefing (${today}) - Generating...`,
      provider: LlmProvider.GEMINI, // Required field
      tickers: [],
      status: ResearchStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const savedPending = await this.noteRepo.save(pendingNote);

    // 3. Generate content and update the pending record
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    this.logger.log(`Generating Personalized Digest for ${userId}...`);

    let symbols: string[] = [];

    try {
      // 1. Fetch Candidates (User Watchlist)
      const watchlists = await this.watchlistService.getUserWatchlists(userId);

      // Flatten and dedup
      const allTickers = new Set<string>();
      watchlists.forEach((list) => {
        list.items.forEach((item) => {
          if (item.ticker?.symbol) {
            allTickers.add(item.ticker.symbol);
          }
        });
      });

      // 2. Fetch Portfolio Positions and add their symbols
      try {
        const portfolioPositions = await this.portfolioService.findAll(userId);
        portfolioPositions.forEach((position) => {
          if (position.symbol) {
            allTickers.add(position.symbol);
          }
        });
        this.logger.log(
          `Digest sources: ${watchlists.flatMap((w) => w.items).length} watchlist items, ${portfolioPositions.length} portfolio positions`,
        );
      } catch (portfolioError) {
        this.logger.warn(
          `Failed to fetch portfolio positions: ${portfolioError}`,
        );
        // Continue with watchlist items only
      }

      const distinctSymbols = Array.from(allTickers);

      if (distinctSymbols.length > 0) {
        // Fetch Rich Data for Scoring
        const richData = await this.marketDataService.getAnalyzerTickers({
          symbols: distinctSymbols,
          limit: 50,
        });

        // Scoring Logic: Impact Score
        const scored = richData.items.map((item: any) => {
          const change = Math.abs(
            item.latestPrice?.changePercent || item.latestPrice?.change || 0,
          );
          const news = item.counts?.news || 0;
          const score = change * 2 + news * 10;
          return { symbol: item.ticker.symbol, score, data: item };
        });

        scored.sort((a: any, b: any) => b.score - a.score);
        let active = scored.filter((s: any) => s.score > 2);

        if (active.length === 0 && scored.length > 0) {
          this.logger.log(
            'Strict filter returned 0. Relaxing to top 3 watchlist items.',
          );
          active = scored.slice(0, 3);
        }

        const topPicks = active.slice(0, 5);
        symbols = topPicks.map((s: any) => s.symbol);

        this.logger.log(
          `High Impact Filter: Selected ${symbols.join(', ')} from ${distinctSymbols.length} candidates.`,
        );
      }
    } catch (e) {
      this.logger.warn('Failed to fetch user watchlist tickers', e);
    }

    if (symbols.length === 0) {
      // No symbols found, fail gracefully and clear the pending lock
      savedPending.status = ResearchStatus.FAILED;
      savedPending.answer_markdown = 'No active tickers found in watchlist.';
      await this.noteRepo.save(savedPending);
      return null;
    }

    try {
      // 2. Generate Prompt
      const prompt = `
            You are an elite Wall Street Analyst.
            Generate a "Daily Smart News Digest" for these tickers: ${symbols.join(', ')}.
            Date: ${today}.
            
            Using available news, identify Top Market Movers or Thematic Stories.
            
            STRICT RULES:
            1. Select only the TOP 3-5 most profound stories.
            2. Assign an **Impact Index** (1-10) to each story (10 = Market Crash/Explosion, 1 = Noise).
            3. Label Sentiment as **BULLISH**, **BEARISH**, or **NEUTRAL**.
            4. SORT stories by Impact Index (Descending).
            5. **CRITICAL**: END the response with a JSON block containing the structured data.
            
            Structure:
            
            [Markdown Section]
            ## Market Pulse
            (1-2 sentences on macro mood)
            
            ---
            
            ## Key Stories
            
            ### [SYMBOL](/ticker/SYMBOL) (SENTIMENT) [Impact: X/10]
            **Headline**
            - **The Why**: ...
            - **Risk/Catalyst**: ...
            
            [JSON Section]
            \`\`\`json
            {
              "items": [
                {
                  "symbol": "NVDA",
                  "sentiment": "BULLISH",
                  "impact_score": 10,
                  "summary": "Blackwell chips sold out until 2026."
                }
              ]
            }
            \`\`\`
        `;

      // 3. Call LLM
      const result = await this.llmService.generateResearch({
        question: prompt,
        tickers: symbols,
        numericContext: {},
        quality: 'medium',
        provider: 'gemini',
      });

      // 4. Update Pending Note
      savedPending.request_id = crypto.randomUUID();
      savedPending.title = `Smart News Briefing (${today} ${timeString})`;
      savedPending.question = `Daily Smart News Digest for: ${symbols.join(', ')}`;
      savedPending.answer_markdown = result.answerMarkdown;
      savedPending.tickers = symbols as any;
      savedPending.quality = 'medium';
      savedPending.provider = LlmProvider.GEMINI;
      savedPending.status = ResearchStatus.COMPLETED;
      savedPending.models_used = result.models || ['gemini-2.5-flash'];
      savedPending.tokens_in = result.tokensIn ?? 0;
      savedPending.tokens_out = result.tokensOut ?? 0;

      const saved = await this.noteRepo.save(savedPending);
      this.logger.log(`Personalized Digest Saved (ID: ${saved.id})`);

      // 5. PARSE & UPDATE TICKERS (The Smart News Integration)
      try {
        const jsonMatch =
          saved.answer_markdown.match(/```json\s*([\s\S]*?)\s*```/) ||
          saved.answer_markdown.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = (jsonMatch[1] || jsonMatch[0])
            .trim()
            .replace(/,\s*([}\]])/g, '$1'); // Basic cleanup for trailing commas

          const parsed = JSON.parse(jsonStr);

          if (parsed && parsed.items && Array.isArray(parsed.items)) {
            this.logger.log(
              `Found ${parsed.items.length} news items to sync to DB for digest ${saved.id}...`,
            );
            for (const item of parsed.items) {
              if (item.symbol && item.impact_score !== undefined) {
                // HANDLE SPLIT SYMBOLS (e.g. "NVO / LLY")
                const symbols: string[] = item.symbol
                  .split(/[/, &]+/) // Split by slash, comma, space, ampersand
                  .map((s: string) => s.trim())
                  .filter(
                    (s: string) => s.length > 0 && s !== 'AND' && s !== '&',
                  );

                for (const sym of symbols) {
                  try {
                    await this.marketDataService.updateTickerNews(sym, {
                      sentiment: item.sentiment || 'NEUTRAL',
                      score: Number(item.impact_score),
                      summary: item.summary || '',
                    });
                  } catch (err) {
                    this.logger.warn(
                      `Failed to update ticker news for ${sym}: ${err.message}`,
                    );
                  }
                }
              }
            }
          }

          // 6. STRIP JSON FROM PUBLIC VIEW
          // Remove the JSON block and any trailing "JSON Section" headers
          let cleanMarkdown = saved.answer_markdown
            .replace(/```json[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\[JSON Section\].*$/is, '') // Remove everything after the JSON section header
            .trim();

          // If the LLM left trailing artifacts like "---" or "Output:", clean them up
          cleanMarkdown = cleanMarkdown.replace(/\n---\s*$/g, '').trim();

          if (cleanMarkdown !== saved.answer_markdown) {
            await this.noteRepo.update(saved.id, {
              answer_markdown: cleanMarkdown,
            });
            saved.answer_markdown = cleanMarkdown;
            this.logger.log(`Stripped JSON metadata from digest ${saved.id}`);
          }
        }
      } catch (parseErr) {
        this.logger.warn(
          'Failed to parse structured news data from digest',
          parseErr,
        );
      }

      return saved;
    } catch (e) {
      this.logger.error('Failed to generate personalized digest', e);
      savedPending.status = ResearchStatus.FAILED;
      await this.noteRepo.save(savedPending);
      return null;
    }
  }

  // Helper alias
  async getCachedDigest(userId: string): Promise<ResearchNote | null> {
    return this.getOrGenerateDailyDigest(userId);
  }

  async deletePersonalizedDigest(userId: string): Promise<void> {
    const digests = await this.noteRepo.find({
      where: {
        user_id: userId,
        title: Like('Smart News Briefing%'),
      },
    });

    if (digests.length > 0) {
      await this.noteRepo.remove(digests);
      this.logger.log(
        `Deleted ${digests.length} personalized digests for user ${userId}`,
      );
    }
  }

  private async processMarketNewsTicket(note: ResearchNote): Promise<void> {
    // Deprecated. Just mark complete to unblock queue if any exist.
    note.status = ResearchStatus.COMPLETED;
    note.answer_markdown = 'Deprecated: Please use the Daily Digest widget.';
    await this.noteRepo.save(note);
  }

  // --- SECURE PUBLIC VIEW IMPLEMENTATION ---

  /**
   * Generates a signature for the research ID to allow secure public sharing.
   */
  generatePublicSignature(researchId: string): string {
    const secret = this.config.get<string>(
      'RESEARCH_SHARE_SECRET',
      'dev-secret-salt', // Fallback for dev convenience
    );
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(researchId);
    return hmac.digest('hex');
  }

  /**
   * Verifies the signature and fetches the research note + all related ticker context.
   * This is the "Composite Payload" getter.
   */
  async getPublicReportData(researchId: string, signature: string) {
    // 1. Verify Signature
    const expectedSignature = this.generatePublicSignature(researchId);

    // Constant-time comparison to prevent timing attacks
    // First check length to avoid timingSafeEqual throw
    if (signature.length !== expectedSignature.length) {
      throw new Error('Invalid signature');
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );

    if (!isValid) {
      throw new Error('Invalid signature'); // Controller will catch and return 403
    }

    // 2. Fetch Research Note
    const note = await this.getResearchNote(researchId);
    if (!note) {
      throw new NotFoundException('Research note not found');
    }

    // 3. Fetch Context Data in Parallel (Live/Latest Data to match Private View)
    const mainTicker = note.tickers[0];
    if (!mainTicker) {
      return { note }; // Should not happen for valid notes
    }

    // Grab profile, snapshot, news, ratings in parallel
    // (Risk and history require profile.id, so they are fetched waterfall style below)
    const [profile, snapshot, newsData, ratings] = await Promise.all([
      this.tickersService.getTicker(mainTicker),
      this.marketDataService.getSnapshot(mainTicker).catch((e: any) => {
        this.logger.warn(
          `Failed to get snapshot for public view: ${e.message}`,
        );
        return { latestPrice: { close: 0, prevClose: 0, ts: new Date() } };
      }),
      this.marketDataService.getCompanyNews(mainTicker),
      this.marketDataService.getAnalystRatings(mainTicker),
      // Fetch fresh risk analysis for the live dashboard feel
      // We need the ticker ID for this, which we can get from Profile if we chain,
      // but getTicker fetches by symbol.
      // Ideally we'd get risk via symbol wrapper or get profile first.
      // For speed, let's assume we need to wait for profile or use a symbol-based lookup if available?
      // RiskRewardService.getLatestAnalysis takes tickerId (number).
      // So we must await profile first or find a way.
      // Actually, getTicker returns the entity which has ID.
      // So we can't do full parallel unless we have ID.
      // Refactoring to serial/waterfall for ID dependency:
    ]);

    // Re-fetch risk/history now that we have profile (and thus ID) if needed,
    // OR just chain it properly. A better way:
    // Let's rely on TickersService to give us the ID, or use ensureTicker.
    // profile (from getTicker) has the ID.

    let riskAnalysis = null;
    let priceHistory: any[] = [];

    if (profile && profile.id) {
      const [risk, hist] = await Promise.all([
        this.riskRewardService.getLatestAnalysis(profile.id).catch(() => null),
        this.marketDataService
          .getHistory(
            mainTicker,
            '1d',
            new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
            new Date().toISOString(),
          )
          .catch(() => []),
      ]);
      riskAnalysis = risk;
      priceHistory = hist;
    }

    const marketData = snapshot.latestPrice || { close: 0, prevClose: 0 };

    return {
      note: {
        id: note.id,
        title: note.title,
        content: note.answer_markdown,
        created_at: note.created_at,
        models_used: note.models_used,
        rarity: note.rarity,
        quality_score: note.quality_score,
      },
      profile: {
        symbol: profile.symbol,
        name: profile.name,
        logo_url: profile.logo_url,
        industry: profile.finnhub_industry || profile.sector,
        description: profile.description,
        web_url: profile.web_url,
        exchange: profile.exchange,
      },
      market_context: {
        price: marketData.close,
        change_percent: marketData.prevClose
          ? ((marketData.close - marketData.prevClose) / marketData.prevClose) *
            100
          : 0,
        history: priceHistory.map((h) => ({
          price: h.close,
          date: h.ts, // Keep original TS for Chart mapping
        })),
      },
      // Use Live Risk Analysis, fallback to null (frontend handles nulls)
      risk_analysis: riskAnalysis
        ? {
            overall_score: riskAnalysis.overall_score,
            financial_risk: riskAnalysis.financial_risk,
            execution_risk: riskAnalysis.execution_risk,
            dilution_risk: riskAnalysis.dilution_risk,
            competitive_risk: riskAnalysis.competitive_risk,
            regulatory_risk: riskAnalysis.regulatory_risk,
            sentiment: riskAnalysis.sentiment,
            upside_percent: riskAnalysis.upside_percent,
            scenarios: riskAnalysis.scenarios,
            red_flags: (riskAnalysis as any).red_flags || [],
            catalysts: (riskAnalysis as any).catalysts || [],
          }
        : null,
      ratings: ratings || [],
      news: newsData && newsData.length > 0 ? newsData[0] : null,
      fundamentals: {
        ...snapshot.fundamentals,
        pe_ratio: snapshot.fundamentals?.pe_ttm || snapshot.ticker?.pe_ratio,
      },
    };
  }
}
