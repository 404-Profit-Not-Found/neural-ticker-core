import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
  ForbiddenException,
  Request,
  Query,
  Delete,
  Sse,
  MessageEvent,
  UseGuards, // Added
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Throttle } from '@nestjs/throttler';
import { CreditGuard } from './guards/credit.guard'; // Added
import { CreditService } from '../users/credit.service'; // Added
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ResearchService } from './research.service';
import { MarketDataService } from '../market-data/market-data.service';
import { QualityTier } from '../llm/llm.types';
import {
  IsArray,
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
} from 'class-validator';

// ... DTO stays same ...
class AskResearchDto {
  @ApiProperty({
    example: ['AAPL', 'MSFT'],
    description:
      'List of ticker symbols to research. Currently supports US Equities.',
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  tickers: string[];

  @ApiProperty({
    example:
      'Analyze the impact of the latest earnings report on the stock price.',
    description:
      'The specific research question or hypothesis you want the AI to investigate.',
  })
  @IsString()
  question: string;

  @ApiProperty({
    enum: ['openai', 'gemini', 'ensemble'],
    required: false,
    default: 'gemini',
    description:
      'The LLM provider to use. "gemini" is recommended for best reasoning.',
  })
  @IsEnum(['openai', 'gemini', 'ensemble'])
  @IsOptional()
  provider?: 'openai' | 'gemini' | 'ensemble';

  @ApiProperty({
    enum: ['low', 'medium', 'high', 'deep'],
    required: false,
    default: 'medium',
    description:
      'Depth of analysis. "deep" triggers the slow-thinking Gemini model with web search capabilities.',
  })
  @IsEnum(['low', 'medium', 'high', 'deep'])
  @IsOptional()
  quality?: string;

  @ApiProperty({
    required: false,
    example: 'Professional',
    description:
      'The tone of the generated report (e.g., "Professional", "Skeptical", "ELI5").',
  })
  @IsString()
  @IsOptional()
  style?: string;

  @ApiProperty({
    required: false,
    example: 4000,
    description: 'Maximum number of tokens for the output response.',
  })
  @IsNumber()
  @IsOptional()
  maxTokens?: number;

  @ApiProperty({
    required: false,
    description: 'Optional API key override for this specific request.',
  })
  @IsString()
  @IsOptional()
  apiKey?: string;
}

class UploadResearchDto {
  @ApiProperty({
    example: ['AAPL'],
    description: 'Tickers related to this note',
  })
  @IsArray()
  @IsString({ each: true })
  tickers: string[];

  @ApiProperty({ example: 'My Thesis', description: 'Title of the research' })
  @IsString()
  title: string;

  @ApiProperty({
    example: '# Bullish case...',
    description: 'Markdown content',
  })
  @IsString()
  content: string;

  @ApiProperty({ required: false, default: 'completed' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({
    required: false,
    example: 'o1-preview',
    description: 'Model used for generation',
  })
  @IsString()
  @IsOptional()
  model?: string;
}

class ContributeDto {
  @ApiProperty({
    example: ['AAPL'],
    description: 'Tickers related to this note',
  })
  @IsArray()
  @IsString({ each: true })
  tickers: string[];

  @ApiProperty({
    example: '# Bullish case for AAPL...',
    description: 'Markdown content of the research',
  })
  @IsString()
  content: string;
}

@ApiTags('Research')
@ApiBearerAuth()
@Controller('v1/research')
@UseGuards(JwtAuthGuard)
export class ResearchController {
  constructor(
    private readonly researchService: ResearchService,
    private readonly marketDataService: MarketDataService,
    private readonly creditService: CreditService,
  ) {}

  @ApiOperation({ summary: 'Upload manual research note (Legacy)' })
  @ApiResponse({ status: 201, description: 'Note created.' })
  // Mints credits via an LLM judge — cap per-IP to stop scripted credit farming.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('upload')
  async upload(@Request() req: any, @Body() dto: UploadResearchDto) {
    const userId = req.user.id;
    return this.researchService.createManualNote(
      userId,
      dto.tickers,
      dto.title,
      dto.content,
      dto.model,
    );
  }

  @ApiOperation({ summary: 'Contribute research to earn credits' })
  @ApiResponse({
    status: 201,
    description: 'Contribution accepted and scored.',
  })
  // Mints credits via an LLM judge — cap per-IP to stop scripted credit farming.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('contribute')
  async contribute(@Request() req: any, @Body() dto: ContributeDto) {
    const userId = req.user.id;
    // content should be "Research Prompt" compatible or full note?
    // The UI says "Research Prompt" section with "Copy".
    // But the textarea is for "content".
    // I assume user pastes the LLM OUTPUT into the textarea.
    return this.researchService.contribute(userId, dto.tickers, dto.content);
  }

  @ApiOperation({
    summary: 'Submit a research question (Async)',
    description:
      'Creates a new Research Ticket and returns an ID (Async). Client should poll GET /api/v1/research/{id} to check status. Context includes live market data and the latest Risk/Reward Analysis.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Ticket successfully created. Processing started in background.',
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          example: '550e8400-e29b-41d4-a716-446655440000',
          description: 'Unique Ticket ID used for polling.',
        },
        status: {
          type: 'string',
          example: 'pending',
          enum: ['pending', 'processing', 'completed', 'failed'],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input (e.g. missing question or empty tickers).',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Bearer token missing or invalid.',
  })
  @UseGuards(CreditGuard)
  @Post('ask')
  async ask(@Request() req: any, @Body() dto: AskResearchDto) {
    const userId = req.user.id;
    // Handle dynamic API key from body if present

    // Cost is derived from the SAME params the pipeline uses (provider +
    // quality) and matches CreditGuard's computation.
    const cost = this.creditService.getResearchCost(dto.provider, dto.quality);

    const ticket = await this.researchService.createResearchTicket(
      userId,
      dto.tickers,
      dto.question,
      dto.provider,
      dto.quality as QualityTier,
    );

    // Deduct atomically BEFORE dispatching the expensive LLM work. The ticket
    // row is cheap; deductCredits locks the user row and throws on insufficient
    // balance. If it fails, roll back the ticket and abort — fail closed so a
    // deduction failure can never yield free LLM usage.
    if (req.user.role !== 'admin') {
      try {
        await this.creditService.deductCredits(userId, cost, 'research_spend', {
          research_id: ticket.id,
          model: dto.provider,
          quality: dto.quality,
          ticker: dto.tickers[0],
        });
      } catch (e) {
        await this.researchService
          .deleteResearchNote(ticket.id, userId)
          .catch(() => undefined);
        throw e;
      }
    }

    // Fire and forget background processing (only reached once paid).
    this.researchService
      .processTicket(ticket.id)
      .catch((err) => console.error('Background processing failed', err));

    return { id: ticket.id, status: ticket.status };
  }

  @ApiOperation({
    summary: 'List my research tickets',
    description:
      'Returns a paginated list of research requests filtered by status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'pending', 'processing', 'completed', 'failed'],
    description: 'Filter by status (default: all)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of tickets.',
    schema: {
      example: {
        data: [{ id: '1', tickers: ['AAPL'], status: 'completed' }],
        total: 10,
        page: 1,
        limit: 10,
      },
    },
  })
  @ApiQuery({
    name: 'ticker',
    required: false,
    type: String,
    description: 'Filter by ticker symbol',
  })
  @Get()
  async list(
    @Request() req: any,
    @Query('status') status: string = 'all',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('ticker') ticker?: string,
    @Query('since') since?: number,
  ) {
    const userId = req.user.id;
    return this.researchService.findAll(
      userId,
      status,
      Number(page),
      Number(limit),
      ticker,
      since ? Number(since) : undefined,
    );
  }

  @ApiOperation({
    summary: 'Retrieve a research ticket/note by ID',
    description:
      'Fetches status and result of a research request. Status Flow: pending -> processing -> completed. Result includes answer_markdown, numeric_context, and models_used.',
  })
  @ApiParam({
    name: 'id',
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The Ticket ID returned by /ask',
  })
  @ApiResponse({
    status: 202,
    description: 'Processing. The research is still in progress.',
    schema: {
      example: {
        id: '123',
        status: 'processing',
        created_at: '2023-01-01T12:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Completed. Returns the full Research Note.',
    schema: {
      example: {
        id: '123',
        status: 'completed',
        tickers: ['AAPL'],
        question: 'Should I buy?',
        answer_markdown: '# Analysis\n\nApple is a strong buy...',
        numeric_context: {
          AAPL: { price: 150, risk_reward: { overall_score: 8.5 } },
        },
        created_at: '2023-01-01T12:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Ticket not found. Invalid ID.' })
  @Get(':id')
  async getResearch(@Request() req: any, @Param('id') id: string) {
    const note = await this.researchService.getResearchNote(id);
    if (!note) {
      throw new NotFoundException(`Research note ${id} not found`);
    }

    // Ownership check removed per user requirement:
    // "Allow anyone who has access to the app and is authenticated to access the research"

    return note;
  }

  @ApiOperation({
    summary: 'Delete a research ticket',
    description: 'Permanently removes a research ticket and its data.',
  })
  @ApiResponse({ status: 200, description: 'Ticket deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Ticket not found.' })
  @Delete(':id')
  async delete(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    // Optional: Check if exists first or just delete
    // Service now handles permission checking
    await this.researchService.deleteResearchNote(id, userId);
    return { message: 'Deleted successfully' };
  }

  @ApiOperation({ summary: 'Update research title' })
  @ApiResponse({ status: 200, description: 'Title updated successfully' })
  @ApiResponse({ status: 404, description: 'Research note not found' })
  @Post(':id/title') // Using POST or PATCH
  async updateTitle(
    @Request() req: any,
    @Param('id') id: string,
    @Body('title') title: string,
  ) {
    const userId = req.user.id;
    try {
      return await this.researchService.updateTitle(id, userId, title);
    } catch (e) {
      if (e.message === 'Research note not found')
        throw new NotFoundException(e.message);
      if (e.message.includes('Unauthorized'))
        throw new NotFoundException(e.message); // Should be Forbidden but NotFound hides existence
      throw e;
    }
  }

  @ApiOperation({ summary: 'Stream deep research (SSE)' })
  @ApiResponse({
    status: 200,
    description:
      'SSE stream of research events (status, thought, source, content)',
  })
  // Expensive deep-research pipeline with no credit deduction — cap per-IP to
  // prevent a logged-in user from running it in a loop for free.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('stream')
  @Sse() // Content-Type: text/event-stream
  startResearch(
    @Body() body: { ticker: string; questions?: string },
  ): Observable<MessageEvent> {
    return this.researchService
      .streamResearch(body.ticker, body.questions)
      .pipe(
        map((event: any) => ({
          data: event, // Automatically JSON serialized
          type: event.type, // Allows frontend to verify event listeners
        })),
      );
  }
  @ApiOperation({
    summary: 'Manually trigger financial extraction from latest research',
  })
  @ApiResponse({ status: 200, description: 'Extraction started.' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('extract-financials/:ticker')
  async extractFinancials(@Param('ticker') ticker: string) {
    await this.researchService.reprocessFinancials(ticker);
    return { message: 'Extraction started' };
  }

  @ApiOperation({
    summary: 'Reprocess research and dedupe analyst ratings for a ticker',
  })
  @ApiResponse({ status: 200, description: 'Sync completed.' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('sync/:ticker')
  async syncResearch(@Param('ticker') ticker: string) {
    await this.researchService.reprocessFinancials(ticker);
    await this.marketDataService.syncCompanyNews(ticker);
    await this.marketDataService.refreshMarketData(ticker); // Force refresh price/fundamentals
    const dedupe = await this.marketDataService.dedupeAnalystRatings(ticker);
    return { message: 'Sync completed', deduped: dedupe.removed };
  }

  @ApiOperation({
    summary: 'Get free Gemma-powered news summary for a ticker',
    description:
      'Two-step pipeline: Gemini Flash searches latest news, Gemma 26B summarizes',
  })
  @ApiResponse({ status: 200, description: '4-bullet summary with sources' })
  // Two-step Gemini+Gemma pipeline with no credit deduction — cap per-IP.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('news-summary/:symbol')
  async getNewsSummary(@Param('symbol') symbol: string) {
    return this.researchService.getNewsSummary(symbol.toUpperCase());
  }

  @ApiOperation({ summary: 'Generate secure shareable public link' })
  @ApiResponse({
    status: 200,
    description: 'Returns the signed URL',
  })
  @Get(':id/share-link')
  async getShareLink(@Request() req: any, @Param('id') id: string) {
    const note = await this.researchService.getResearchNote(id);
    if (!note) throw new NotFoundException('Research note not found');

    // A share link exposes the note to the UNAUTHENTICATED public, so it must
    // be restricted to the owner (or an admin) even though authenticated read
    // of `GET :id` is intentionally open to all logged-in users. Without this,
    // any user could mint a public link for someone else's private research.
    if (note.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenException(
        'You can only generate a share link for your own research.',
      );
    }

    const signature = this.researchService.generatePublicSignature(id);
    // Use env var for base URL or construct from request?
    // Ideally frontend constructs full URL, backend just gives signature.
    // Or backend returns full "share_url".
    // Let's return both.

    return {
      signature,
      path: `/report/${id}/${signature}`,
    };
  }
}
