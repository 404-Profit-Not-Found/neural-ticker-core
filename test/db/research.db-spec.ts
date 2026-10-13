import { DataSource, QueryFailedError } from 'typeorm';
import { NumericIdPipe } from '../../src/common/pipes/numeric-id.pipe';
import { MarketDataService } from '../../src/modules/market-data/market-data.service';
import { ResearchNote } from '../../src/modules/research/entities/research-note.entity';
import { ResearchService } from '../../src/modules/research/research.service';
import { RiskAnalysis } from '../../src/modules/risk-reward/entities/risk-analysis.entity';
import { TickerEntity } from '../../src/modules/tickers/entities/ticker.entity';
import { describeDb, ensureMigrated, truncateAll } from './support/test-db';
import {
  createMarketDataService,
  seedCandle,
  seedTicker,
} from './support/market-fixtures';

/**
 * Research on a real PostgreSQL: the ticker feed's NULL-title filter and its
 * paging, note ids at the database boundary, and what the unauthenticated
 * public report actually sends.
 */
describeDb(
  'research: feed filter, note ids, public report (real PostgreSQL)',
  () => {
    let ds: DataSource;
    let marketData: MarketDataService;
    let close: () => Promise<void>;
    let research: ResearchService;
    const users: Record<string, string> = {};
    const SECRET = 'test-share-secret';

    beforeAll(async () => {
      await ensureMigrated();
      ({ service: marketData, ds, close } = await createMarketDataService());
      const tickerRepo = ds.getRepository(TickerEntity);
      research = new ResearchService(
        ds.getRepository(ResearchNote),
        {} as any, // llmService
        {} as any, // llmBudgetService
        {} as any, // usersService
        {
          get: (key: string) =>
            key === 'RESEARCH_SHARE_SECRET' ? SECRET : undefined,
        } as any,
        {} as any, // notifications
        {} as any, // webPush
        {} as any, // watchlist
        {} as any, // portfolio
        {} as any, // credit
        {} as any, // qualityScoring
        {
          findOneBySymbol: (symbol: string) =>
            tickerRepo.findOne({ where: { symbol: symbol.toUpperCase() } }),
          getTicker: (symbol: string) =>
            tickerRepo.findOneOrFail({
              where: { symbol: symbol.toUpperCase() },
            }),
        } as any,
        marketData,
        {
          getLatestAnalysis: (tickerId: string) =>
            ds.getRepository(RiskAnalysis).findOne({
              where: { ticker_id: tickerId },
              order: { created_at: 'DESC' },
              relations: ['scenarios', 'qualitative_factors', 'catalysts'],
            }),
        } as any,
      );
      // Keep the single-ticker snapshot on what is stored (no data providers).
      jest
        .spyOn(marketData, 'getSnapshot')
        .mockImplementation((symbol: string) =>
          (marketData as any).performGetSnapshot(symbol, {
            updateIfStale: false,
          }),
        );
      jest.spyOn(marketData, 'getHistory').mockResolvedValue([] as any);
    });
    afterAll(async () => {
      await close?.();
    });

    beforeEach(async () => {
      await truncateAll(ds);
      for (const name of ['alice', 'bob']) {
        const [{ id }] = await ds.query(
          `INSERT INTO users (email, google_id, full_name, nickname, credits_balance, preferences)
         VALUES ($1, $2, $3, $4, 77, '{"gemini_api_key":"PRIVATE-API-KEY","language":"en"}') RETURNING id`,
          [
            `${name}@private.example`,
            `google-${name}`,
            `${name} Realname`,
            name,
          ],
        );
        users[name] = id;
      }
    });

    const addNote = async (over: {
      user?: string | null;
      title?: string | null;
      tickers?: string[];
      status?: string;
      ageMinutes?: number;
      answer?: string | null;
    }): Promise<string> =>
      (
        await ds.query(
          `INSERT INTO research_notes (request_id, tickers, question, provider, title, status, user_id, answer_markdown, created_at)
         VALUES (uuid_generate_v4(), $1, 'q', 'gemini', $2, $3, $4, $5, now() - ($6 || ' minutes')::interval)
         RETURNING id`,
          [
            over.tickers ?? ['NVDA'],
            over.title === undefined ? 'A title' : over.title,
            over.status ?? 'completed',
            over.user === undefined
              ? users.alice
              : over.user === null
                ? null
                : users[over.user],
            over.answer === undefined ? 'body' : over.answer,
            String(over.ageMinutes ?? 0),
          ],
        )
      )[0].id;

    describe('findAll — the ticker feed', () => {
      // `title NOT LIKE 'Smart News Briefing%'` is NULL — not true — for a NULL
      // title: the feed silently dropped every ticket that had no title yet,
      // i.e. everything still pending or processing.
      it('keeps notes WITHOUT a title, drops daily digests, keeps everything else', async () => {
        await addNote({ title: null, status: 'pending', ageMinutes: 1 });
        await addNote({ title: null, status: 'processing', ageMinutes: 2 });
        await addNote({ title: 'NVDA: AI demand', ageMinutes: 3 });
        await addNote({
          title: 'Smart News Briefing (2026-10-13 08:00)',
          ageMinutes: 4,
        });
        await addNote({
          title: 'smart news briefing in lower case is a normal title',
          ageMinutes: 5,
        });
        await addNote({ title: '', ageMinutes: 6 });
        await addNote({ title: 'About AMD', tickers: ['AMD'], ageMinutes: 7 });

        const feed = await research.findAll(users.bob, 'all', 1, 50, 'NVDA');

        expect(feed.data.map((n) => n.title)).toEqual([
          null,
          null,
          'NVDA: AI demand',
          'smart news briefing in lower case is a normal title',
          '',
        ]);
        expect(feed.total).toBe(5);
      });

      it('the three-valued logic, straight from PostgreSQL', async () => {
        const [row] = await ds.query(
          `SELECT (NULL::text NOT LIKE 'Smart%') AS bare,
                (NULL::text IS NULL OR NULL::text NOT LIKE 'Smart%') AS guarded`,
        );
        expect(row).toEqual({ bare: null, guarded: true });
      });

      it('pages without repeating or dropping a note, with a correct total (the author join does not multiply rows)', async () => {
        for (let i = 0; i < 23; i++) {
          await addNote({
            title: i % 4 === 0 ? null : `note ${i}`,
            user: i % 2 ? 'alice' : 'bob',
            ageMinutes: i,
          });
        }
        await addNote({ title: 'Smart News Briefing (x)', ageMinutes: 100 });

        const seen: string[] = [];
        for (let page = 1; page <= 4; page++) {
          const result = await research.findAll(
            users.alice,
            'all',
            page,
            7,
            'NVDA',
          );
          expect(result.total).toBe(23);
          expect(result.limit).toBe(7);
          seen.push(...result.data.map((n) => String(n.id)));
        }

        expect(seen).toHaveLength(23);
        expect(new Set(seen).size).toBe(23);
        // newest first
        const all = await ds.query(
          `SELECT id::text FROM research_notes WHERE title IS NULL OR title NOT LIKE 'Smart News Briefing%' ORDER BY created_at DESC`,
        );
        expect(seen).toEqual(all.map((r: any) => r.id));
      });

      it('status and "since" filters combine with it; the page size is capped at 50', async () => {
        await addNote({ title: null, status: 'pending', ageMinutes: 1 });
        await addNote({ title: 'done', status: 'completed', ageMinutes: 2 });
        await addNote({
          title: 'old',
          status: 'completed',
          ageMinutes: 60 * 30,
        });

        expect(
          (
            await research.findAll(users.alice, 'pending', 1, 10, 'NVDA')
          ).data.map((n) => n.title),
        ).toEqual([null]);
        expect(
          (await research.findAll(users.alice, 'all', 1, 10, 'NVDA', 24)).total,
        ).toBe(2);
        expect(
          (await research.findAll(users.alice, 'all', 1, 9999, 'NVDA')).limit,
        ).toBe(50);
      });

      it('without a ticker it is "my research": only the caller’s notes, digests included', async () => {
        await addNote({ user: 'alice', title: 'mine' });
        await addNote({
          user: 'alice',
          title: 'Smart News Briefing (mine)',
          ageMinutes: 1,
        });
        await addNote({ user: 'bob', title: 'his', ageMinutes: 2 });
        await addNote({ user: null, title: 'system', ageMinutes: 3 });

        const mine = await research.findAll(users.alice, 'all', 1, 10);

        expect(mine.data.map((n) => n.title)).toEqual([
          'mine',
          'Smart News Briefing (mine)',
        ]);
      });

      it('each note carries its author as a public view only — the join loads nothing else', async () => {
        await addNote({ user: 'alice', title: 'by alice' });
        await addNote({ user: null, title: 'by the system', ageMinutes: 1 });

        const feed = await research.findAll(users.bob, 'all', 1, 10, 'NVDA');

        expect(feed.data[0].user).toEqual({
          id: users.alice,
          nickname: 'alice',
          avatar_url: null,
          tier: 'free',
        });
        expect(feed.data[1].user).toBeNull();
        const json = JSON.stringify(feed);
        for (const secret of [
          'private.example',
          'PRIVATE-API-KEY',
          'google-alice',
          'Realname',
          'credits_balance',
          'preferences',
        ]) {
          expect(json).not.toContain(secret);
        }
      });
    });

    describe('note ids at the database boundary', () => {
      const pipe = new NumericIdPipe();

      // What the pipe exists for: research_notes.id is a bigint.
      it.each(['abc', '12abc', '1; DROP TABLE research_notes', '1.5', ''])(
        'without the pipe, %j reaches PostgreSQL and fails there (a 500); the pipe answers 400 first',
        async (id) => {
          await expect(research.getResearchNote(id)).rejects.toBeInstanceOf(
            QueryFailedError,
          );
          expect(() => pipe.transform(id)).toThrow('a numeric id is expected');
        },
      );

      it('every id the pipe lets through is a valid bigint for PostgreSQL', async () => {
        const id = await addNote({ title: 'real' });
        for (const candidate of [id, '0', '00042', '9'.repeat(18)]) {
          expect(pipe.transform(candidate)).toBe(candidate);
          await expect(
            research.getResearchNote(candidate),
          ).resolves.not.toThrow();
        }
        expect((await research.getResearchNote(id))?.title).toBe('real');
        expect(await research.getResearchNote('9'.repeat(18))).toBeNull();
      });

      it('19 digits can overflow a bigint — which is why the pipe stops at 18', async () => {
        await expect(
          research.getResearchNote('9'.repeat(19)),
        ).rejects.toBeInstanceOf(QueryFailedError);
        expect(() => pipe.transform('9'.repeat(19))).toThrow();
      });

      it('the table survives all of the above', async () => {
        await research
          .getResearchNote('1; DROP TABLE research_notes')
          .catch(() => undefined);
        const [{ present }] = await ds.query(
          `SELECT to_regclass('research_notes') IS NOT NULL AS present`,
        );
        expect(present).toBe(true);
      });
    });

    describe('public report (unauthenticated) — what is really sent', () => {
      const seedReport = async () => {
        const ticker = await seedTicker(ds, {
          symbol: 'NVDA',
          news_sentiment: 'BULLISH',
          news_impact_score: 8,
          fundamentals: {
            market_cap: 3000000,
            pe_ttm: 31.2,
            eps_ttm: 6.4,
            dividend_yield: 0.5,
            revenue_ttm: 400000,
            debt_to_equity: 1.5,
            total_debt: 123456,
            consensus_rating: 'Strong Buy',
            fifty_two_week_high: 237.49,
            fifty_two_week_low: 164.08,
            sector: 'Technology',
            yahoo_metadata: JSON.stringify({ raw: 'PROVIDER-BLOB' }),
          },
          risk: {
            financial_risk: 4,
            overall_score: 7.5,
            upside_percent: 12,
            base: 230,
            bear: 150,
          },
        });
        const today = new Date();
        await seedCandle(ds, ticker, {
          ts: new Date(
            Date.UTC(
              today.getUTCFullYear(),
              today.getUTCMonth(),
              today.getUTCDate(),
            ),
          ),
          timeframe: '1d',
          close: 200,
          prevClose: 190,
        });
        await ds.query(
          `UPDATE tickers SET news_summary = 'INTERNAL NEWS SUMMARY', finnhub_raw = '{"raw":"FINNHUB-BLOB"}' WHERE id = $1`,
          [ticker],
        );
        const note = await addNote({
          user: 'alice',
          title: 'NVDA deep dive',
          answer: '# Report body',
        });
        await ds.query(
          `UPDATE research_notes SET question = 'PRIVATE QUESTION', full_response = 'RAW LLM RESPONSE',
                thinking_process = 'INTERNAL THOUGHTS', numeric_context = '{"internal":"NUMERIC-CONTEXT"}',
                grounding_metadata = '{"internal":"GROUNDING"}', error = 'INTERNAL ERROR TEXT',
                content_hash = 'abc123hash', enrichment_status = '{"title":"ok"}'
          WHERE id = $1`,
          [note],
        );
        return note;
      };

      it('needs the signature', async () => {
        const note = await seedReport();
        await expect(
          research.getPublicReportData(note, 'x'.repeat(64)),
        ).rejects.toThrow('Invalid signature');
        await expect(
          research.getPublicReportData(note, 'short'),
        ).rejects.toThrow('Invalid signature');
      });

      it('sends the report, the market block and the rating inputs — and none of the rest of those rows', async () => {
        const note = await seedReport();

        const report: any = await research.getPublicReportData(
          note,
          research.generatePublicSignature(note),
        );

        expect(Object.keys(report).sort()).toEqual([
          'fundamentals',
          'market_context',
          'news',
          'note',
          'profile',
          'ratings',
          'risk_analysis',
        ]);
        // fundamentals: the allow-list (rating inputs), not the row
        expect(report.fundamentals).toEqual({
          pe_ratio: 31.2,
          consensus_rating: 'Strong Buy',
          fifty_two_week_high: 237.49,
          fifty_two_week_low: 164.08,
          revenue_ttm: 400000,
        });
        expect(report.market_context.price).toBe(200);
        expect(report.market_context.change_percent).toBeCloseTo(
          (10 / 190) * 100,
          10,
        );
        expect(report.news).toMatchObject({ sentiment: 'BULLISH', score: 8 });
        expect(report.risk_analysis).toMatchObject({
          financial_risk: 4,
          overall_score: 7.5,
        });
        // the server's rating, the same as the app shows
        expect(typeof report.risk_analysis.rating).toBe('string');
        expect(typeof report.risk_analysis.rating_score).toBe('number');
        expect(Object.keys(report.note).sort()).toEqual([
          'content',
          'created_at',
          'id',
          'models_used',
          'quality_score',
          'rarity',
          'title',
        ]);
        expect(report.note.content).toBe('# Report body');
        expect(report.note.title).toBe('NVDA deep dive');

        const json = JSON.stringify(report);
        for (const leaked of [
          // the author's account
          'private.example',
          'PRIVATE-API-KEY',
          'google-alice',
          'Realname',
          'credits_balance',
          'preferences',
          // the note's internals
          'PRIVATE QUESTION',
          'RAW LLM RESPONSE',
          'INTERNAL THOUGHTS',
          'NUMERIC-CONTEXT',
          'GROUNDING',
          'INTERNAL ERROR TEXT',
          'abc123hash',
          'enrichment_status',
          // the rest of the fundamentals / ticker rows
          'PROVIDER-BLOB',
          'FINNHUB-BLOB',
          'yahoo_metadata',
          'dividend_yield',
          'debt_to_equity',
          'total_debt',
          'eps_ttm',
          // (scenarios carry their own `expected_market_cap` — the ticker's
          // fundamentals `market_cap` is what must not be here)
          '"market_cap"',
          'INTERNAL NEWS SUMMARY',
        ]) {
          expect(json).not.toContain(leaked);
        }
        // The author is not part of a public report at all.
        expect(json).not.toContain(users.alice);
      });

      it('a report about a ticker we do not track is served alone, and creates nothing', async () => {
        const note = await addNote({
          user: 'alice',
          title: 'About ZZZQ',
          tickers: ['ZZZQ'],
          answer: '# Body',
        });

        const report: any = await research.getPublicReportData(
          note,
          research.generatePublicSignature(note),
        );

        expect(report.profile).toEqual({ symbol: 'ZZZQ', name: 'ZZZQ' });
        expect(report.market_context).toBeNull();
        expect(report.fundamentals).toEqual({});
        expect(report.note.content).toBe('# Body');
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM tickers`,
        );
        expect(n).toBe(0);
      });
    });
  },
);
