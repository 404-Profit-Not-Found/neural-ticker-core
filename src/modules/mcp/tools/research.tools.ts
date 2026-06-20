import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { ResearchService } from '../../research/research.service';
import { CreditService } from '../../users/credit.service';
import { requireUser, isAdmin } from '../auth/mcp-user.util';
import {
  serializeResearchNote,
  serializeResearchSummary,
  toolJson,
} from '../dto/serializers';

const symbol = z
  .string()
  .trim()
  .min(1)
  .transform((s) => s.toUpperCase());

/**
 * AI research tools. All require authentication (an `Authorization: Bearer`
 * app JWT). `create_research` charges credits in-code and fails closed.
 */
@Injectable()
export class ResearchTools {
  constructor(
    private readonly research: ResearchService,
    private readonly credit: CreditService,
  ) {}

  @Tool({
    name: 'create_research',
    description:
      'Start an AI research ticket for one or more tickers and a question. ' +
      'Costs credits (admins exempt) and runs asynchronously — returns a ' +
      'ticket_id immediately; poll get_research for the completed answer.',
    parameters: z.object({
      tickers: z
        .array(symbol)
        .min(1)
        .max(10)
        .describe('Tickers to research (1-10).'),
      question: z
        .string()
        .trim()
        .min(1)
        .describe('The research question to answer.'),
      provider: z
        .enum(['gemini', 'openai', 'ensemble'])
        .default('gemini')
        .describe('LLM provider. "ensemble" costs more. Defaults to gemini.'),
      quality: z
        .enum(['low', 'medium', 'high', 'deep'])
        .default('deep')
        .describe('Research depth. "deep" costs more. Defaults to deep.'),
    }),
  })
  async createResearch(
    args: {
      tickers: string[];
      question: string;
      provider: 'gemini' | 'openai' | 'ensemble';
      quality: 'low' | 'medium' | 'high' | 'deep';
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const cost = this.credit.getResearchCost(args.provider, args.quality);

    const ticket = await this.research.createResearchTicket(
      user.id,
      args.tickers,
      args.question,
      args.provider,
      args.quality,
    );

    // Charge credits (admins exempt). Fail closed: if the deduction fails,
    // delete the just-created ticket so the user is not left with an
    // un-paid-for, orphaned ticket.
    if (user.role !== 'admin') {
      try {
        await this.credit.deductCredits(user.id, cost, 'research_spend', {
          research_id: ticket.id,
          model: args.provider,
          quality: args.quality,
          ticker: args.tickers[0],
        });
      } catch (e) {
        await this.research
          .deleteResearchNote(ticket.id, user.id)
          .catch(() => undefined);
        throw e instanceof Error ? e : new Error(String(e));
      }
    }

    // Process in the background — do NOT await (Cloud Run request timeout).
    void this.research
      .processTicket(ticket.id)
      .catch((err) =>
        console.error('MCP create_research background processing failed', err),
      );

    return toolJson({ ticket_id: String(ticket.id), status: ticket.status });
  }

  @Tool({
    name: 'get_research',
    description:
      'Fetch a research ticket by id. Returns status and, when completed, the ' +
      'answer markdown. Only the owner (or an admin) may read a ticket.',
    parameters: z.object({
      ticket_id: z.string().trim().min(1).describe('The research ticket id.'),
    }),
  })
  async getResearch(args: { ticket_id: string }, _ctx: unknown, req: any) {
    const user = requireUser(req);
    const note = await this.research.getResearchNote(args.ticket_id);
    if (!note) {
      throw new Error(`Research ticket ${args.ticket_id} not found.`);
    }
    if (note.user_id !== user.id && !isAdmin(user)) {
      throw new Error('You do not have access to this research ticket.');
    }
    return toolJson(serializeResearchNote(note));
  }

  @Tool({
    name: 'list_research',
    description:
      'List your research tickets, newest first. Filter by status or ticker. ' +
      'When a ticker is given, returns the community feed for that ticker.',
    parameters: z.object({
      status: z
        .enum(['all', 'pending', 'processing', 'completed', 'failed'])
        .default('all')
        .describe('Status filter. Defaults to all.'),
      page: z.number().int().min(1).default(1).describe('Page number.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe('Page size (max 50).'),
      ticker: symbol
        .optional()
        .describe('Optional ticker for the community feed.'),
    }),
  })
  async listResearch(
    args: {
      status: string;
      page: number;
      limit: number;
      ticker?: string;
    },
    _ctx: unknown,
    req: any,
  ) {
    const user = requireUser(req);
    const result = await this.research.findAll(
      user.id,
      args.status,
      args.page,
      args.limit,
      args.ticker,
    );
    return toolJson({
      data: result.data.map(serializeResearchSummary),
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  }

  @Tool({
    name: 'get_news_summary',
    description:
      'Get an AI-generated summary of recent news for a symbol. Requires ' +
      'authentication (uses an LLM under the hood).',
    parameters: z.object({ symbol }),
  })
  async getNewsSummary(args: { symbol: string }, _ctx: unknown, req: any) {
    requireUser(req);
    return toolJson(await this.research.getNewsSummary(args.symbol));
  }
}
