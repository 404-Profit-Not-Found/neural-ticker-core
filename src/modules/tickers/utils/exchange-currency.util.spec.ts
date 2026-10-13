import {
  getExchangeSuffix,
  inferCurrencyFromExchange,
  isUsStyleSymbol,
} from './exchange-currency.util';

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

describe('getExchangeSuffix', () => {
  it.each([
    ['SAP.DE', 'DE'],
    ['ASML.AS', 'AS'],
    ['7203.T', 'T'],
    ['BARC.L', 'L'],
    // Hyphen = share class, dot = venue: the suffix is after the LAST dot.
    ['VOLV-B.ST', 'ST'],
    ['sap.de', 'DE'],
    [' SAP.DE ', 'DE'],
  ])('returns the venue suffix of %s', (symbol, suffix) => {
    expect(getExchangeSuffix(symbol)).toBe(suffix);
  });

  it.each([
    'AAPL',
    'COIN', // contains "CO"
    'SMCI', // contains "MC" / "MI"
    'BRK.A', // US share class — a dot, but not a venue
    'BRK.B',
    'RDS-A',
    '',
  ])('returns null for %s (no exchange suffix)', (symbol) => {
    expect(getExchangeSuffix(symbol)).toBeNull();
  });

  it('returns null for null / undefined', () => {
    expect(getExchangeSuffix(null)).toBeNull();
    expect(getExchangeSuffix(undefined)).toBeNull();
  });
});

describe('isUsStyleSymbol', () => {
  it.each([
    'AAPL',
    'COIN',
    'RDS-A', // hyphenated share class, no dot
    'BRK.A', // dot + one letter that is not a venue = US share class
    'BRK.B',
    'BF.B',
    'brk.b',
    ' BRK.B ',
  ])('is true for %s', (symbol) => {
    expect(isUsStyleSymbol(symbol)).toBe(true);
  });

  it.each([
    'SAP.DE',
    'ASML.AS',
    'VOLV-B.ST',
    'BARC.L', // one letter, but London IS a venue
    'BMW.F', // Frankfurt
    '7203.T', // Tokyo
    'SHOP.TO',
    'ABC.V', // TSX Venture
    'BBCA.JK', // a venue we do not know is still an exchange suffix
    'XYZ.WS',
  ])('is false for %s', (symbol) => {
    expect(isUsStyleSymbol(symbol)).toBe(false);
  });

  it('treats empty input as "no suffix"', () => {
    expect(isUsStyleSymbol('')).toBe(true);
    expect(isUsStyleSymbol(null)).toBe(true);
    expect(isUsStyleSymbol(undefined)).toBe(true);
  });
});
