import {
  safeStringify,
  toolJson,
  toolText,
  serializeResearchNote,
  serializeResearchSummary,
  serializePortfolioPosition,
  serializePortfolioTrade,
  serializePendingOrder,
  serializeCashBalance,
  serializePriceAlert,
  serializeWatchlistItem,
  serializeTickerRequest,
  serializeWatchlist,
  serializeAdminTickerLogo,
} from './serializers';

describe('MCP serializers', () => {
  describe('safeStringify', () => {
    it('serializes plain objects', () => {
      expect(safeStringify({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
    });

    it('coerces bigint to a string', () => {
      expect(safeStringify({ n: 10n })).toBe('{"n":"10"}');
    });

    it('drops circular references instead of throwing', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      expect(() => safeStringify(obj)).not.toThrow();
      expect(JSON.parse(safeStringify(obj))).toEqual({ a: 1 });
    });
  });

  describe('toolJson / toolText', () => {
    it('wraps data as a JSON text tool result', () => {
      expect(toolJson({ ok: true })).toEqual({
        content: [{ type: 'text', text: '{"ok":true}' }],
      });
    });

    it('wraps a raw string as a text tool result', () => {
      expect(toolText('hello')).toEqual({
        content: [{ type: 'text', text: 'hello' }],
      });
    });
  });

  describe('serializeResearchNote', () => {
    it('returns null for a missing note', () => {
      expect(serializeResearchNote(null)).toBeNull();
      expect(serializeResearchNote(undefined)).toBeNull();
    });

    it('whitelists fields and stringifies the id', () => {
      const out = serializeResearchNote({
        id: 42,
        question: 'why?',
        answer_markdown: '# answer',
        user_id: 'u1',
        // a relation that must NOT leak through:
        user: { email: 'secret@example.com', credits: 999 },
      });
      expect(out).toMatchObject({
        id: '42',
        question: 'why?',
        answer_markdown: '# answer',
        user_id: 'u1',
      });
      expect(out).not.toHaveProperty('user');
    });
  });

  describe('serializeResearchSummary', () => {
    it('returns the lightweight list shape', () => {
      const out = serializeResearchSummary({
        id: 7,
        tickers: ['AAPL'],
        question: 'q',
        title: 't',
        status: 'done',
        user_id: 'u1',
      });
      expect(out).toMatchObject({ id: '7', tickers: ['AAPL'], title: 't' });
      expect(out).not.toHaveProperty('answer_markdown');
    });
  });

  describe('serializePortfolioPosition', () => {
    it('whitelists position fields', () => {
      const out = serializePortfolioPosition({
        id: 'p1',
        symbol: 'AAPL',
        shares: '10',
        buy_price: '150',
        currency: 'USD',
        user: { id: 'u1' },
      });
      expect(out).toMatchObject({ id: 'p1', symbol: 'AAPL', currency: 'USD' });
      expect(out).not.toHaveProperty('user');
    });
  });

  describe('serializePortfolioTrade', () => {
    it('coerces decimal-string columns to numbers', () => {
      const out = serializePortfolioTrade({
        id: 't1',
        symbol: 'AAPL',
        side: 'sell',
        shares: '3',
        price: '160.5',
        total_value: '481.5',
        fees: '1',
        realized_pnl: '30.5',
        currency: 'USD',
      });
      expect(out).toMatchObject({
        shares: 3,
        price: 160.5,
        total_value: 481.5,
        fees: 1,
        realized_pnl: 30.5,
      });
    });

    it('keeps a null realized_pnl as null (buys)', () => {
      const out = serializePortfolioTrade({
        side: 'buy',
        shares: '1',
        price: '10',
        total_value: '10',
        fees: '0',
        realized_pnl: null,
      });
      expect(out.realized_pnl).toBeNull();
    });
  });

  describe('serializePendingOrder', () => {
    it('returns null for a missing order', () => {
      expect(serializePendingOrder(null)).toBeNull();
    });

    it('coerces numeric columns and keeps null prices null', () => {
      const out = serializePendingOrder({
        id: 'o1',
        symbol: 'AAPL',
        side: 'buy',
        shares: '5',
        currency: 'USD',
        status: 'pending',
        requested_price: null,
        fees: '0',
        filled_price: null,
      });
      expect(out).toMatchObject({
        shares: 5,
        fees: 0,
        requested_price: null,
        filled_price: null,
        status: 'pending',
      });
    });

    it('coerces present prices to numbers', () => {
      const out = serializePendingOrder({
        shares: '2',
        fees: '0.5',
        requested_price: '100.25',
        filled_price: '101',
      });
      expect(out).toMatchObject({
        requested_price: 100.25,
        filled_price: 101,
        fees: 0.5,
      });
    });
  });

  describe('serializeCashBalance', () => {
    it('coerces the amount to a number', () => {
      expect(serializeCashBalance({ currency: 'EUR', amount: '1234.56' })).toEqual({
        currency: 'EUR',
        amount: 1234.56,
      });
    });
  });

  describe('serializePriceAlert', () => {
    it('prefers an explicit symbol over the ticker relation', () => {
      expect(
        serializePriceAlert({ id: 'a1', symbol: 'TSLA', ticker: { symbol: 'X' } }),
      ).toMatchObject({ id: 'a1', symbol: 'TSLA' });
    });

    it('falls back to the ticker relation symbol', () => {
      expect(serializePriceAlert({ id: 'a2', ticker: { symbol: 'NVDA' } })).toMatchObject(
        { symbol: 'NVDA' },
      );
    });
  });

  describe('serializeWatchlistItem', () => {
    it('flattens the ticker relation', () => {
      expect(
        serializeWatchlistItem({
          id: 5,
          ticker_id: 't1',
          ticker: { symbol: 'AAPL', name: 'Apple Inc.' },
        }),
      ).toMatchObject({ id: '5', symbol: 'AAPL', name: 'Apple Inc.' });
    });

    it('falls back to company_name and a flat symbol', () => {
      expect(
        serializeWatchlistItem({ id: 6, symbol: 'MSFT', ticker: { company_name: 'Microsoft' } }),
      ).toMatchObject({ symbol: 'MSFT', name: 'Microsoft' });
    });
  });

  describe('serializeTickerRequest', () => {
    it('returns null for a missing request', () => {
      expect(serializeTickerRequest(null)).toBeNull();
    });

    it('omits requested_by when there is no user relation', () => {
      const out = serializeTickerRequest({ id: 1, symbol: 'AAPL', status: 'pending' });
      expect(out).toMatchObject({ id: '1', symbol: 'AAPL' });
      expect(out).not.toHaveProperty('requested_by');
    });

    it('flattens the user relation to a safe requested_by summary', () => {
      const out = serializeTickerRequest({
        id: 2,
        symbol: 'AAPL',
        status: 'pending',
        user: { id: 'u1', full_name: 'Jane', email: 'jane@example.com', credits: 50 },
      });
      expect(out?.requested_by).toEqual({
        id: 'u1',
        name: 'Jane',
        email: 'jane@example.com',
      });
    });

    it('falls back through nickname then null for the name', () => {
      const nick = serializeTickerRequest({
        id: 3,
        user: { id: 'u2', nickname: 'jdoe', email: 'j@x.com' },
      });
      expect((nick?.requested_by as { name: string }).name).toBe('jdoe');

      const none = serializeTickerRequest({
        id: 4,
        user: { id: 'u3', email: 'n@x.com' },
      });
      expect((none?.requested_by as { name: string | null }).name).toBeNull();
    });
  });

  describe('serializeWatchlist', () => {
    it('maps items via serializeWatchlistItem', () => {
      const out = serializeWatchlist({
        id: 9,
        name: 'Tech',
        items: [{ id: 1, ticker: { symbol: 'AAPL' } }],
      });
      expect(out.id).toBe('9');
      expect(out.items).toEqual([
        expect.objectContaining({ id: '1', symbol: 'AAPL' }),
      ]);
    });

    it('defaults items to an empty array when absent', () => {
      expect(serializeWatchlist({ id: 10, name: 'Empty' }).items).toEqual([]);
    });
  });

  describe('serializeAdminTickerLogo', () => {
    it('returns null for a missing ticker', () => {
      expect(serializeAdminTickerLogo(null)).toBeNull();
    });

    it('reports a real logo as present', () => {
      expect(
        serializeAdminTickerLogo({ id: 1, symbol: 'AAPL', logo_url: 'https://x/a.png' }),
      ).toMatchObject({ id: '1', symbol: 'AAPL', logo_url: 'https://x/a.png', has_logo: true });
    });

    it("treats the legacy string 'null' and blanks as no logo", () => {
      expect(serializeAdminTickerLogo({ id: 2, logo_url: 'null' })).toMatchObject({
        logo_url: null,
        has_logo: false,
      });
      expect(serializeAdminTickerLogo({ id: 3, logo_url: '   ' })).toMatchObject({
        logo_url: null,
        has_logo: false,
      });
    });

    it('leaves id undefined when the source id is null (partial select)', () => {
      const out = serializeAdminTickerLogo({ symbol: 'AAPL', logo_url: null });
      expect(out?.id).toBeUndefined();
      expect(out?.has_logo).toBe(false);
    });
  });
});
