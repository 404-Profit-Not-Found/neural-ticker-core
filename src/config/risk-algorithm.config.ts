export const RISK_ALGO = {
  STRONG_BUY: {
    MAX_RISK_SCORE: 6, // User requested <= 6
    MIN_UPSIDE_PERCENT: 15,
  },
  SELL: {
    MIN_RISK_SCORE: 8,
    MAX_UPSIDE_PERCENT: 0,
  },
};
