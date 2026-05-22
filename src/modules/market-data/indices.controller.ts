import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';

type IndexQuote = {
  name: string;
  symbol: string;
  val: number;
  ch: number;
};

const INDICES: { symbol: string; name: string }[] = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ' },
  { symbol: '^DJI', name: 'DOW' },
  { symbol: '^RUT', name: 'RUSSELL 2K' },
  { symbol: '^VIX', name: 'VIX' },
  { symbol: 'BZ=F', name: 'BRENT' },
  { symbol: 'GC=F', name: 'GOLD' },
  { symbol: '^TNX', name: '10Y UST' },
  { symbol: 'BTC-USD', name: 'BTC-USD' },
  { symbol: 'EURUSD=X', name: 'EUR/USD' },
];

const CACHE_TTL_MS = 30_000;

@ApiTags('Market Data')
@Controller('v1/market-data')
export class IndicesController {
  private readonly logger = new Logger(IndicesController.name);
  private cache: { data: IndexQuote[]; expires: number } | null = null;
  private inflight: Promise<IndexQuote[]> | null = null;

  constructor(private readonly yahoo: YahooFinanceService) {}

  @ApiOperation({
    summary: 'Get a snapshot of major market indices',
    description:
      'Returns current value and percent change for ~10 reference symbols (S&P 500, NASDAQ, DOW, Russell 2000, VIX, Brent, Gold, 10Y UST, BTC-USD, EUR/USD). 30s cache.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        { name: 'S&P 500', symbol: '^GSPC', val: 5842.18, ch: 0.42 },
      ],
    },
  })
  @Public()
  @Get('indices')
  async getIndices(): Promise<IndexQuote[]> {
    const now = Date.now();
    if (this.cache && this.cache.expires > now) return this.cache.data;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const results = await Promise.allSettled(
          INDICES.map((i) => this.yahoo.getQuote(i.symbol)),
        );

        const data: IndexQuote[] = results.map((r, i) => {
          const meta = INDICES[i];
          if (r.status !== 'fulfilled' || !r.value) {
            return { name: meta.name, symbol: meta.symbol, val: 0, ch: 0 };
          }
          const q = r.value;
          const val =
            q.regularMarketPrice ??
            q.postMarketPrice ??
            q.preMarketPrice ??
            0;
          const ch = q.regularMarketChangePercent ?? 0;
          return {
            name: meta.name,
            symbol: meta.symbol,
            val: Number(val),
            ch: Number(ch),
          };
        });

        this.cache = { data, expires: now + CACHE_TTL_MS };
        return data;
      } catch (err) {
        this.logger.error(`Indices fetch failed: ${(err as Error).message}`);
        return this.cache?.data ?? [];
      } finally {
        this.inflight = null;
      }
    })();

    return this.inflight;
  }
}
