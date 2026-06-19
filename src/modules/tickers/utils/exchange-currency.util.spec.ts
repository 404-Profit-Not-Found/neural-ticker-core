import { inferCurrencyFromExchange } from './exchange-currency.util';

describe('inferCurrencyFromExchange', () => {
  describe('symbol-suffix rules', () => {
    it.each([
      ['BARC.L', 'GBP'],
      ['VOD.IL', 'GBP'],
      ['SAP.DE', 'EUR'],
      ['BMW.F', 'EUR'],
      ['MC.PA', 'EUR'],
      ['ASML.AS', 'EUR'],
      ['STLA.MI', 'EUR'],
      ['SAN.MC', 'EUR'],
      ['UCB.BR', 'EUR'],
      ['EDP.LS', 'EUR'],
      ['NOKIA.HE', 'EUR'],
      ['CRH.IR', 'EUR'],
      ['EBS.VI', 'EUR'],
      ['NESN.SW', 'CHF'],
      ['VOLV-A.ST', 'SEK'],
      ['EQNR.OL', 'NOK'],
      ['NOVO-B.CO', 'DKK'],
      ['PKN.WA', 'PLN'],
      ['7203.T', 'JPY'],
      ['7974.TYO', 'JPY'],
      ['0700.HK', 'HKD'],
      ['600519.SS', 'CNY'],
      ['000001.SZ', 'CNY'],
      ['005930.KS', 'KRW'],
      ['293490.KQ', 'KRW'],
      ['RELIANCE.BO', 'INR'],
      ['TCS.NS', 'INR'],
      ['BHP.AX', 'AUD'],
      ['D05.SI', 'SGD'],
      ['SHOP.TO', 'CAD'],
      ['HUT.V', 'CAD'],
      ['PETR4.SA', 'BRL'],
      ['WALMEX.MX', 'MXN'],
    ])('maps %s → %s by suffix', (symbol, expected) => {
      expect(inferCurrencyFromExchange(null, symbol)).toBe(expected);
    });

    it('is case-insensitive on the suffix', () => {
      expect(inferCurrencyFromExchange(null, 'sap.de')).toBe('EUR');
      expect(inferCurrencyFromExchange(null, 'BARC.l')).toBe('GBP');
    });
  });

  describe('exchange-name lookup', () => {
    it.each([
      ['LSE', 'GBP'],
      ['LON', 'GBP'],
      ['XETRA', 'EUR'],
      ['FRA', 'EUR'],
      ['EPA', 'EUR'],
      ['SWX', 'CHF'],
      ['TYO', 'JPY'],
      ['HKEX', 'HKD'],
      ['ASX', 'AUD'],
      ['TSX', 'CAD'],
      ['BMV', 'MXN'],
      ['NYSE', 'USD'],
      ['NASDAQ', 'USD'],
      ['AMEX', 'USD'],
    ])('maps exchange %s → %s', (exchange, expected) => {
      expect(inferCurrencyFromExchange(exchange, null)).toBe(expected);
    });

    it('normalizes case and whitespace', () => {
      expect(inferCurrencyFromExchange('  xetra  ', null)).toBe('EUR');
      expect(inferCurrencyFromExchange('Nasdaq', null)).toBe('USD');
    });
  });

  describe('priority: symbol suffix beats exchange', () => {
    it('uses the symbol suffix even when exchange would yield a different currency', () => {
      // Edge case: a German stock cross-listed and reported under generic 'OTC'.
      // The .DE suffix is the truth.
      expect(inferCurrencyFromExchange('OTC', 'SAP.DE')).toBe('EUR');
    });
  });

  describe('no-match cases', () => {
    it.each([
      ['AAPL', null],
      ['MSFT', null],
      ['NVDA', null],
      ['BRK.A', null], // dot but unknown suffix
    ])(
      'returns null for US-style symbol %s with no exchange hint',
      (symbol) => {
        expect(inferCurrencyFromExchange(null, symbol)).toBeNull();
      },
    );

    it('returns null for unknown exchange', () => {
      expect(inferCurrencyFromExchange('UNKNOWN', null)).toBeNull();
      expect(inferCurrencyFromExchange('OTC', null)).toBeNull();
    });

    it('returns null for empty / null inputs', () => {
      expect(inferCurrencyFromExchange(null, null)).toBeNull();
      expect(inferCurrencyFromExchange('', '')).toBeNull();
      expect(inferCurrencyFromExchange(undefined, undefined)).toBeNull();
    });
  });
});
