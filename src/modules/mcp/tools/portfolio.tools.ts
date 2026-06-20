import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PortfolioService } from '../../portfolio/portfolio.service';
import { WatchlistService } from '../../watchlist/watchlist.service';
import { PriceAlertsService } from '../../price-alerts/price-alerts.service';
import { requireUser } from '../auth/mcp-user.util';
import {
  serializePortfolioPosition,
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
