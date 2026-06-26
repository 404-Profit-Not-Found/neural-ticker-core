import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PortfolioService } from '../../portfolio/portfolio.service';
import { WatchlistService } from '../../watchlist/watchlist.service';
import { PriceAlertsService } from '../../price-alerts/price-alerts.service';
import { requireUser } from '../auth/mcp-user.util';
import {
  serializePortfolioPosition,
  serializePortfolioTrade,
  serializePendingOrder,
  serializeCashBalance,
  serializePriceAlert,
  serializeWatchlist,
  toolJson,
  toolText,
} from '../dto/serializers';

const symbol = z
  .string()
  .trim()
  .min(1)
  .describe('Ticker symbol, e.g. "AAPL"')
  .transform((s) => s.toUpperCase());

const currency = z
  .enum(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'])
  .describe('ISO 4217 currency code.');

/**
 * User-scoped portfolio, watchlist and price-alert tools. All require
 * authentication (an `Authorization: Bearer` app JWT). `analyze_portfolio`
 * deducts credits inside the service — it is NOT charged again here.
 */
@Injectable()
export class PortfolioTools {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly watchlist: WatchlistService,
    private readonly priceAlerts: PriceAlertsService,
  ) {}

  // ---- Portfolio ----------------------------------------------------------

  @Tool({
    name: 'get_portfolio',
    description:
      "Get the authenticated user's portfolio positions with current values. " +
      'Optionally convert displayed values to a chosen currency.',
    parameters: z.object({
      displayCurrency: currency
        .optional()
        .describe('Optional currency to convert displayed values into.'),
    }),
  })
  async getPortfolio(
    args: { displayCurrency?: string },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    return toolJson(
      await this.portfolio.findAll(user.id, args.displayCurrency),
    );
  }

  @Tool({
    name: 'add_portfolio_position',
    description:
      "Add a position to the authenticated user's portfolio (symbol, shares, " +
      'buy price, buy date, optional currency).',
    parameters: z.object({
      symbol,
      shares: z.number().min(0.01).describe('Number of shares (>= 0.01).'),
      buy_price: z
        .number()
        .min(0.01)
        .describe('Average buy price per share (>= 0.01).'),
      buy_date: z.string().trim().min(1).describe('Purchase date, YYYY-MM-DD.'),
      currency: currency
        .optional()
        .describe('Currency of the purchase. Auto-detected if omitted.'),
    }),
  })
  async addPortfolioPosition(
    args: {
      symbol: string;
      shares: number;
      buy_price: number;
      buy_date: string;
      currency?: string;
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const position = await this.portfolio.create(user.id, {
      symbol: args.symbol,
      shares: args.shares,
      buy_price: args.buy_price,
      buy_date: args.buy_date,
      currency: args.currency,
    });
    return toolJson(serializePortfolioPosition(position));
  }

  @Tool({
    name: 'remove_portfolio_position',
    description:
      "Remove a position from the authenticated user's portfolio by id.",
    parameters: z.object({
      id: z.string().trim().min(1).describe('The portfolio position id.'),
    }),
  })
  async removePortfolioPosition(args: { id: string }, _ctx: unknown, req: any) {
    const user = requireUser(req);
    await this.portfolio.remove(user.id, args.id);
    return toolJson({ removed: true, id: args.id });
  }

  @Tool({
    name: 'analyze_portfolio',
    description:
      "Generate an AI analysis of the authenticated user's portfolio for a " +
      'given risk appetite, horizon and goal. Costs credits (deducted by the ' +
      'service). Returns a markdown analysis.',
    parameters: z.object({
      riskAppetite: z
        .string()
        .trim()
        .min(1)
        .describe('e.g. "conservative", "balanced", "aggressive".'),
      horizon: z
        .string()
        .trim()
        .default('medium-term')
        .describe('Investment horizon. Defaults to medium-term.'),
      goal: z
        .string()
        .trim()
        .default('growth')
        .describe('Investment goal. Defaults to growth.'),
      model: z
        .string()
        .trim()
        .default('gemini')
        .describe('LLM model to use. Defaults to gemini.'),
    }),
  })
  async analyzePortfolio(
    args: {
      riskAppetite: string;
      horizon: string;
      goal: string;
      model: string;
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const analysis = await this.portfolio.analyzePortfolio(
      user.id,
      args.riskAppetite,
      args.horizon,
      args.goal,
      args.model,
    );
    return toolText(analysis);
  }

  @Tool({
    name: 'get_portfolio_recommendation',
    description:
      "Get a quick, lightweight recommendation for the authenticated user's " +
      'portfolio.',
    parameters: z.object({}),
  })
  async getPortfolioRecommendation(_args: unknown, _ctx: unknown, req: any) {
    const user = requireUser(req);
    return toolJson(await this.portfolio.getQuickRecommendation(user.id));
  }

  // ---- Trading simulator: sell, cash, trade history -----------------------

  @Tool({
    name: 'sell_portfolio_position',
    description:
      'Sell shares of an existing position. Reduces (or closes) the lot, ' +
      'books realized P&L, and credits the proceeds (gross − fees) to the ' +
      'matching-currency cash balance. Returns the updated position (null if ' +
      'fully sold), the trade, proceeds and realized P&L.',
    parameters: z.object({
      id: z
        .string()
        .trim()
        .min(1)
        .describe('The portfolio position id to sell.'),
      shares: z.number().min(0.0001).describe('Number of shares to sell.'),
      price: z.number().min(0.0001).describe('Sale price per share.'),
      sell_date: z
        .string()
        .trim()
        .optional()
        .describe('Sale date YYYY-MM-DD. Defaults to today.'),
      fees: z
        .number()
        .min(0)
        .optional()
        .describe('Transaction fees deducted from proceeds.'),
      note: z.string().trim().optional().describe('Optional free-text note.'),
    }),
  })
  async sellPortfolioPosition(
    args: {
      id: string;
      shares: number;
      price: number;
      sell_date?: string;
      fees?: number;
      note?: string;
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const result = await this.portfolio.sell(user.id, args.id, {
      shares: args.shares,
      price: args.price,
      sell_date: args.sell_date,
      fees: args.fees,
      note: args.note,
    });
    // The market was closed: the sell was queued and will fill at the market
    // price when the relevant market reopens.
    if (result.status === 'pending') {
      return toolJson({
        status: 'pending',
        order: serializePendingOrder(result.order),
      });
    }
    return toolJson({
      status: 'executed',
      position: result.position
        ? serializePortfolioPosition(result.position)
        : null,
      trade: serializePortfolioTrade(result.trade),
      proceeds: result.proceeds,
      realized_pnl: result.realized_pnl,
      cash_balance: result.cash_balance,
    });
  }

  @Tool({
    name: 'get_cash_balances',
    description:
      "Get the authenticated user's simulator cash balances, one entry per " +
      'currency. A missing currency means a zero balance.',
    parameters: z.object({}),
  })
  async getCashBalances(_args: unknown, _ctx: unknown, req: any) {
    const user = requireUser(req);
    const balances = await this.portfolio.getCashBalances(user.id);
    return toolJson(balances.map(serializeCashBalance));
  }

  @Tool({
    name: 'deposit_cash',
    description:
      'Deposit simulator cash into a currency balance. Buys are funded from ' +
      'cash, so deposit before buying.',
    parameters: z.object({
      amount: z.number().min(0.01).describe('Amount to deposit (> 0).'),
      currency: currency
        .optional()
        .describe('Currency of the balance. Defaults to USD.'),
      note: z.string().trim().optional().describe('Optional free-text note.'),
    }),
  })
  async depositCash(
    args: { amount: number; currency?: string; note?: string },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    return toolJson(
      await this.portfolio.depositCash(user.id, {
        amount: args.amount,
        currency: args.currency,
        note: args.note,
      }),
    );
  }

  @Tool({
    name: 'withdraw_cash',
    description:
      'Withdraw simulator cash from a currency balance. Cannot go negative.',
    parameters: z.object({
      amount: z.number().min(0.01).describe('Amount to withdraw (> 0).'),
      currency: currency
        .optional()
        .describe('Currency of the balance. Defaults to USD.'),
      note: z.string().trim().optional().describe('Optional free-text note.'),
    }),
  })
  async withdrawCash(
    args: { amount: number; currency?: string; note?: string },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    return toolJson(
      await this.portfolio.withdrawCash(user.id, {
        amount: args.amount,
        currency: args.currency,
        note: args.note,
      }),
    );
  }

  @Tool({
    name: 'get_trade_history',
    description:
      "Get the authenticated user's trade history (buys and sells), most " +
      'recent first. Optionally filter by symbol.',
    parameters: z.object({
      symbol: symbol.optional().describe('Optional symbol filter.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Max trades to return (default 100, max 500).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of trades to skip (pagination).'),
    }),
  })
  async getTradeHistory(
    args: { symbol?: string; limit?: number; offset?: number },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const trades = await this.portfolio.getTrades(user.id, {
      symbol: args.symbol,
      limit: args.limit,
      offset: args.offset,
    });
    return toolJson(trades.map(serializePortfolioTrade));
  }

  @Tool({
    name: 'get_portfolio_summary',
    description:
      'Net-worth summary for the authenticated user: market value of holdings ' +
      'plus simulator cash. Optionally expressed in a chosen display currency.',
    parameters: z.object({
      displayCurrency: currency
        .optional()
        .describe('Optional currency to express the summary in.'),
    }),
  })
  async getPortfolioSummary(
    args: { displayCurrency?: string },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    return toolJson(
      await this.portfolio.getPortfolioSummary(user.id, args.displayCurrency),
    );
  }

  @Tool({
    name: 'record_trade',
    description:
      'Record an externally-executed trade (buy or sell) to consolidate ' +
      'holdings from other apps into this portfolio. Permissive: it mirrors a ' +
      'trade that already happened, so it does NOT require sufficient cash. ' +
      'Idempotent on external_id — re-recording the same key returns the ' +
      'original trade. Sells reduce the given position_id, else the oldest ' +
      'matching lot (FIFO).',
    parameters: z.object({
      symbol,
      side: z.enum(['buy', 'sell']).describe('Trade side.'),
      shares: z.number().min(0.0001).describe('Number of shares.'),
      price: z.number().min(0.0001).describe('Execution price per share.'),
      trade_date: z
        .string()
        .trim()
        .min(1)
        .describe('Date the trade executed, YYYY-MM-DD.'),
      currency: currency
        .optional()
        .describe('Trade currency. Auto-detected from the ticker if omitted.'),
      fees: z.number().min(0).optional().describe('Transaction fees.'),
      position_id: z
        .string()
        .trim()
        .optional()
        .describe('For sells: the lot to reduce. Defaults to FIFO.'),
      source: z
        .string()
        .trim()
        .optional()
        .describe("Origin app name, e.g. 'robinhood'. Defaults to 'mcp'."),
      external_id: z
        .string()
        .trim()
        .optional()
        .describe('Idempotency key from the source system.'),
      note: z.string().trim().optional().describe('Optional free-text note.'),
    }),
  })
  async recordTrade(
    args: {
      symbol: string;
      side: 'buy' | 'sell';
      shares: number;
      price: number;
      trade_date: string;
      currency?: string;
      fees?: number;
      position_id?: string;
      source?: string;
      external_id?: string;
      note?: string;
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const result = await this.portfolio.recordTrade(user.id, {
      symbol: args.symbol,
      side: args.side,
      shares: args.shares,
      price: args.price,
      trade_date: args.trade_date,
      currency: args.currency,
      fees: args.fees,
      position_id: args.position_id,
      source: args.source,
      external_id: args.external_id,
      note: args.note,
    });
    return toolJson({
      trade: serializePortfolioTrade(result.trade),
      idempotent: result.idempotent,
    });
  }

  // ---- Watchlists ---------------------------------------------------------

  @Tool({
    name: 'get_watchlists',
    description:
      "Get the authenticated user's watchlists, each with its ticker items.",
    parameters: z.object({}),
  })
  async getWatchlists(_args: unknown, _ctx: unknown, req: any) {
    const user = requireUser(req);
    const lists = await this.watchlist.getUserWatchlists(user.id);
    return toolJson(lists.map(serializeWatchlist));
  }

  @Tool({
    name: 'create_watchlist',
    description:
      'Create a new watchlist for the authenticated user. Idempotent on name: ' +
      'an existing list with the same name is returned.',
    parameters: z.object({
      name: z.string().trim().min(1).describe('Watchlist name.'),
    }),
  })
  async createWatchlist(args: { name: string }, _ctx: unknown, req: any) {
    const user = requireUser(req);
    const list = await this.watchlist.createWatchlist(user.id, args.name);
    return toolJson(serializeWatchlist(list));
  }

  @Tool({
    name: 'add_to_watchlist',
    description: "Add a ticker to one of the authenticated user's watchlists.",
    parameters: z.object({
      watchlistId: z
        .string()
        .trim()
        .min(1)
        .describe('The target watchlist id.'),
      symbol,
    }),
  })
  async addToWatchlist(
    args: { watchlistId: string; symbol: string },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const item = await this.watchlist.addTickerToWatchlist(
      user.id,
      args.watchlistId,
      args.symbol,
    );
    return toolJson({
      added: true,
      watchlist_id: args.watchlistId,
      symbol: args.symbol,
      item_id: String(item.id),
      ticker_id: item.ticker_id,
    });
  }

  // ---- Price alerts -------------------------------------------------------

  @Tool({
    name: 'get_price_alerts',
    description: "Get the authenticated user's price alerts.",
    parameters: z.object({}),
  })
  async getPriceAlerts(_args: unknown, _ctx: unknown, req: any) {
    const user = requireUser(req);
    const alerts = await this.priceAlerts.findAllForUser(user.id);
    return toolJson(alerts.map(serializePriceAlert));
  }

  @Tool({
    name: 'create_price_alert',
    description:
      'Create a price alert for the authenticated user. alert_type is one of ' +
      'price_above, price_below, percent_change_up, percent_change_down.',
    parameters: z.object({
      symbol,
      alert_type: z
        .enum([
          'price_above',
          'price_below',
          'percent_change_up',
          'percent_change_down',
        ])
        .describe('Trigger type.'),
      target_value: z
        .number()
        .min(0)
        .describe('Target price or percent threshold (>= 0).'),
      cooldown_minutes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Minimum minutes between re-fires.'),
    }),
  })
  async createPriceAlert(
    args: {
      symbol: string;
      alert_type: string;
      target_value: number;
      cooldown_minutes?: number;
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const alert = await this.priceAlerts.create(user.id, {
      symbol: args.symbol,
      alert_type: args.alert_type,
      target_value: args.target_value,
      cooldown_minutes: args.cooldown_minutes,
    });
    return toolJson(serializePriceAlert(alert));
  }

  @Tool({
    name: 'delete_price_alert',
    description: "Delete one of the authenticated user's price alerts by id.",
    parameters: z.object({
      id: z.string().trim().min(1).describe('The price alert id.'),
    }),
  })
  async deletePriceAlert(args: { id: string }, _ctx: unknown, req: any) {
    const user = requireUser(req);
    await this.priceAlerts.deleteAlert(args.id, user.id);
    return toolJson({ deleted: true, id: args.id });
  }
}
