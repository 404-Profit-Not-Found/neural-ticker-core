import { Test, type TestingModule } from '@nestjs/testing';
import { IndicesController } from './indices.controller';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';

describe('IndicesController', () => {
  let controller: IndicesController;
  let getQuoteMock: jest.Mock;

  beforeEach(async () => {
    getQuoteMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndicesController],
      providers: [
        {
          provide: YahooFinanceService,
          useValue: { getQuote: getQuoteMock },
        },
      ],
    }).compile();
    controller = module.get<IndicesController>(IndicesController);
  });

  it('fetches all 10 indices and maps fulfilled quotes', async () => {
    getQuoteMock.mockImplementation((sym: string) =>
      Promise.resolve({
        regularMarketPrice: sym === '^GSPC' ? 5842.18 : 100,
        regularMarketChangePercent: sym === '^GSPC' ? 0.42 : 0.1,
      }),
    );

    const data = await controller.getIndices();
    expect(data).toHaveLength(10);
    const sp = data.find((d) => d.symbol === '^GSPC');
    expect(sp).toEqual({ name: 'S&P 500', symbol: '^GSPC', val: 5842.18, ch: 0.42 });
    expect(getQuoteMock).toHaveBeenCalledTimes(10);
  });

  it('returns zeroed entry for rejected quotes', async () => {
    getQuoteMock.mockRejectedValue(new Error('upstream down'));
    const data = await controller.getIndices();
    expect(data).toHaveLength(10);
    for (const row of data) {
      expect(row.val).toBe(0);
      expect(row.ch).toBe(0);
    }
  });

  it('falls back to postMarketPrice or preMarketPrice when regular is missing', async () => {
    getQuoteMock.mockImplementation((sym: string) => {
      if (sym === '^GSPC') return Promise.resolve({ postMarketPrice: 99.1 });
      if (sym === '^IXIC') return Promise.resolve({ preMarketPrice: 88.2 });
      return Promise.resolve({ regularMarketPrice: 1 });
    });
    const data = await controller.getIndices();
    expect(data.find((d) => d.symbol === '^GSPC')?.val).toBe(99.1);
    expect(data.find((d) => d.symbol === '^IXIC')?.val).toBe(88.2);
  });

  it('caches results for the TTL window — second call does not re-fetch', async () => {
    getQuoteMock.mockResolvedValue({
      regularMarketPrice: 100,
      regularMarketChangePercent: 0,
    });
    const a = await controller.getIndices();
    const b = await controller.getIndices();
    expect(a).toBe(b); // same object reference — cache hit
    expect(getQuoteMock).toHaveBeenCalledTimes(10); // not 20
  });

  it('dedupes concurrent inflight requests — upstream called only once per symbol', async () => {
    // Resolves are deferred but every getQuote call gets its own resolver,
    // so allSettled can still settle once we flush them all.
    const resolvers: Array<(v: { regularMarketPrice: number }) => void> = [];
    getQuoteMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const p1 = controller.getIndices();
    const p2 = controller.getIndices();
    // Drain microtasks so both calls have entered the inflight branch.
    await Promise.resolve();
    expect(getQuoteMock).toHaveBeenCalledTimes(10); // 10 indices × 1 inflight
    for (const r of resolvers) r({ regularMarketPrice: 1 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(getQuoteMock).toHaveBeenCalledTimes(10); // confirm: not 20
  });
});
