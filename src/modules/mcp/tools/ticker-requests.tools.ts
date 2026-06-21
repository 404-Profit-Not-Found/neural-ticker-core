import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { TickerRequestsService } from '../../ticker-requests/ticker-requests.service';
import { requireAdmin, requireUser } from '../auth/mcp-user.util';
import { serializeTickerRequest, toolJson } from '../dto/serializers';

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .describe('Ticker symbol, e.g. "AAPL" or "ELXA.F".')
  .transform((s) => s.toUpperCase());

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestId = z
  .string()
  .trim()
  .regex(UUID_RE, 'Must be a ticker-request id (uuid).')
  .describe(
    'The ticker-request id (uuid), as returned by list_ticker_requests.',
  );

/**
 * Ticker-request workflow tools — discovery → request → approval, mirroring
 * the web app's "Request Add" search and the admin "Ticker Requests" panel.
 *
 *  - Any authenticated user can `request_ticker` a symbol that isn't tracked
 *    yet (find the exact symbol first with `search_tickers` includeExternal=true
 *    — results with `is_locally_tracked: false` are addable). This creates a
 *    PENDING request that an admin must confirm.
 *  - Admins can `list_ticker_requests`, `approve_ticker_request` (which fetches
 *    the company profile from Finnhub/Yahoo and adds it) and
 *    `reject_ticker_request`.
 *  - `add_ticker` is the admin shortcut: request + approve in one step.
 *
 * Per-tool auth is enforced in each handler via `requireUser` / `requireAdmin`.
 */
@Injectable()
export class TickerRequestsTools {
  constructor(private readonly requests: TickerRequestsService) {}

  @Tool({
    name: 'request_ticker',
    description:
      'Request that a new stock/ticker be added to the platform. Use this when ' +
      'a symbol is not tracked yet — find it first with search_tickers ' +
      '(includeExternal=true); items with is_locally_tracked=false are ' +
      'addable. Creates a PENDING request that an admin must approve; on ' +
      'approval the symbol is fetched from Finnhub (Yahoo fallback). Requires ' +
      'a valid user token and is subject to a per-user daily request limit.',
    parameters: z.object({ symbol }),
  })
  async requestTicker(args: { symbol: string }, _ctx: unknown, req: any) {
    const user = requireUser(req);
    const request = await this.requests.createRequest(user.id, args.symbol);
    return toolJson(serializeTickerRequest(request));
  }

  @Tool({
    name: 'add_ticker',
    description:
      'Admin only. Add a new stock/ticker in one step: the same as ' +
      'request_ticker but immediately approved, so the company profile is ' +
      'fetched from Finnhub (Yahoo fallback) and saved right away. Idempotent ' +
      '(re-adding an existing ticker is a no-op). Returns the APPROVED request; ' +
      'if the data provider is rate-limited the add is queued for a background ' +
      'retry and a { status: "QUEUED" } result is returned instead.',
    parameters: z.object({ symbol }),
  })
  async addTicker(args: { symbol: string }, _ctx: unknown, req: any) {
    const user = requireAdmin(req);
    try {
      const request = await this.requests.adminAddTicker(user.id, args.symbol);
      return toolJson(serializeTickerRequest(request));
    } catch (e) {
      // ensureTicker throws HttpException 202 (ACCEPTED) when the provider is
      // rate-limited and the add was queued — surface that as a normal queued
      // result rather than a tool error.
      if (
        e instanceof HttpException &&
        e.getStatus() === (HttpStatus.ACCEPTED as number)
      ) {
        return toolJson({ symbol: args.symbol, status: 'QUEUED' });
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  @Tool({
    name: 'list_ticker_requests',
    description:
      'Admin only. List ticker-add requests (newest first), optionally ' +
      'filtered by status. Mirrors the admin "Ticker Requests" panel; use the ' +
      'returned id with approve_ticker_request / reject_ticker_request.',
    parameters: z.object({
      status: z
        .enum(['PENDING', 'APPROVED', 'REJECTED'])
        .optional()
        .describe('Optional status filter. Omit to list all.'),
    }),
  })
  async listTickerRequests(
    args: { status?: 'PENDING' | 'APPROVED' | 'REJECTED' },
    _ctx: unknown,
    req: any,
  ) {
    requireAdmin(req);
    const all = await this.requests.getRequests();
    const filtered = args.status
      ? all.filter((r) => r.status === args.status)
      : all;
    return toolJson(filtered.map(serializeTickerRequest));
  }

  @Tool({
    name: 'approve_ticker_request',
    description:
      'Admin only. Approve a pending ticker-add request by id. Fetches the ' +
      'company profile from Finnhub (Yahoo fallback), adds the ticker to the ' +
      'platform and marks the request APPROVED.',
    parameters: z.object({ request_id: requestId }),
  })
  async approveTickerRequest(
    args: { request_id: string },
    _ctx: unknown,
    req: any,
  ) {
    requireAdmin(req);
    const request = await this.requests.approveRequest(args.request_id);
    return toolJson(serializeTickerRequest(request));
  }

  @Tool({
    name: 'reject_ticker_request',
    description:
      'Admin only. Reject a pending ticker-add request by id. The request is ' +
      'marked REJECTED and no ticker is added.',
    parameters: z.object({ request_id: requestId }),
  })
  async rejectTickerRequest(
    args: { request_id: string },
    _ctx: unknown,
    req: any,
  ) {
    requireAdmin(req);
    const request = await this.requests.rejectRequest(args.request_id);
    return toolJson(serializeTickerRequest(request));
  }
}
