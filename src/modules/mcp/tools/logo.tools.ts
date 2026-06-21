import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { TickersService } from '../../tickers/tickers.service';
import { requireAdmin } from '../auth/mcp-user.util';
import { serializeAdminTickerLogo, toolJson } from '../dto/serializers';

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(15)
  .describe('Ticker symbol, e.g. "AAPL" or "ASSA-B.ST".')
  .transform((s) => s.toUpperCase());

// Real validation (https + no private/internal hosts) is done in the handler
// via TickersService.isSafeRemoteImageUrl so the SSRF guard stays the single
// source of truth; the schema only bounds the raw string.
const logoUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .describe(
    'Public HTTPS URL of the company logo image (PNG/SVG/JPG). Must be reachable ' +
      'over https and must not point at a private/internal host — the image is ' +
      'fetched and cached server-side.',
  );

/**
 * Admin-only "Logo Manager" tools — the MCP equivalent of the web admin Logo
 * Manager panel ("Manually assign logo URLs to tickers, e.g. for those missing
 * from Finnhub"). Every handler enforces `requireAdmin`.
 *
 *  - `list_ticker_logos` mirrors the panel's search + "Show Missing Logos Only"
 *    filter (`TickersService.searchTickersAdmin`).
 *  - `set_ticker_logo` mirrors the per-row "New Logo URL" + Save, i.e. the
 *    admin `PATCH /api/tickers/:symbol` route (`TickersService.updateLogo`):
 *    it stores `logo_url` and downloads + caches the image in the background,
 *    which is then served at `GET /api/tickers/:symbol/logo`.
 */
@Injectable()
export class LogoTools {
  constructor(private readonly tickers: TickersService) {}

  @Tool({
    name: 'list_ticker_logos',
    description:
      'Admin only. List tracked tickers with their current logo URL, to find ' +
      'which ones still need a logo. Mirrors the admin "Logo Manager" panel. ' +
      'Set missing_only=true to return only tickers with a missing/empty logo ' +
      '(the "Show Missing Logos Only" filter). Optional search matches the ' +
      'symbol or name by prefix. Returns at most 50 rows (symbol order); narrow ' +
      'with search to reach more. Each row includes has_logo and the logo_url.',
    parameters: z.object({
      search: z
        .string()
        .trim()
        .max(64)
        .optional()
        .describe('Optional symbol/name prefix filter, e.g. "AAL" or "Anglo".'),
      missing_only: z
        .boolean()
        .optional()
        .describe(
          'When true, return only tickers whose logo URL is missing or empty.',
        ),
    }),
  })
  async listTickerLogos(
    args: { search?: string; missing_only?: boolean },
    _ctx: unknown,
    req: any,
  ) {
    requireAdmin(req);
    const rows = await this.tickers.searchTickersAdmin(
      args.search,
      args.missing_only ?? false,
    );
    return toolJson(rows.map(serializeAdminTickerLogo));
  }

  @Tool({
    name: 'set_ticker_logo',
    description:
      'Admin only. Set (or replace) the logo for a tracked ticker by symbol. ' +
      'Provide a public HTTPS image URL; the server saves it as the ticker ' +
      'logo_url and downloads + caches the image (served at ' +
      'GET /api/tickers/{symbol}/logo). Use this for tickers missing a logo ' +
      'from Finnhub — find them with list_ticker_logos (missing_only=true). ' +
      'The symbol must already be tracked (add it first with add_ticker). ' +
      'Rejects non-HTTPS URLs and private/internal/metadata hosts (SSRF guard).',
    parameters: z.object({ symbol, logo_url: logoUrl }),
  })
  async setTickerLogo(
    args: { symbol: string; logo_url: string },
    _ctx: unknown,
    req: any,
  ) {
    requireAdmin(req);
    // Reuse the exact SSRF guard the background downloader uses, so an unsafe
    // URL is rejected up-front (with a clear message) instead of being silently
    // stored as a logo_url whose image can never be fetched/cached.
    if (!TickersService.isSafeRemoteImageUrl(args.logo_url)) {
      throw new Error(
        'logo_url must be a public https:// image URL. Non-https URLs and ' +
          'localhost / private / internal / cloud-metadata hosts are rejected ' +
          'so the logo can be safely fetched and cached.',
      );
    }
    const ticker = await this.tickers.updateLogo(args.symbol, args.logo_url);
    return toolJson(serializeAdminTickerLogo(ticker));
  }
}
