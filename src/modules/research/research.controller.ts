import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
  Request,
  Query,
} from '@nestjs/common';
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
    description: 'Array of stock tickers (symbols) to focus the research on.',
  })
  @IsArray()
  @IsString({ each: true })
  tickers: string[];

  @ApiProperty({
    example: 'What are the main risks for Apple in 2024 considering AI competition?',
    description: 'The specific question or topic you want the AI to research.',
  })
  @IsString()
  question: string;

  @ApiProperty({
    enum: ['openai', 'gemini', 'ensemble'],
    required: false,
    default: 'ensemble',
    description: 'Select the LLM Provider. "ensemble" combines models for best results (if implemented), otherwise defaults to system preference.',
  })
  @IsEnum(['openai', 'gemini', 'ensemble'])
  @IsOptional()
  provider?: 'openai' | 'gemini' | 'ensemble';

  @ApiProperty({
    enum: ['low', 'medium', 'high', 'deep'],
    required: false,
    default: 'medium',
    description: `
**Quality Tiers**:
- **low**: Fast, shallow scan (GPT-4o-mini). Good for quick sentiment.
- **medium**: Standard analysis (GPT-4o). Balanced.
- **high**: Detailed reasoning (Opus/Sonnet level).
- **deep**: **Gemini Thinking Model**. Extremely detailed chain-of-thought analysis. Takes longer, uses "Search" tools. triggers Post-Research Verification.
    `,
  })
  @IsEnum(['low', 'medium', 'high', 'deep'])
  @IsOptional()
  quality?: string;

  @ApiProperty({ required: false, description: 'Optional: Tone/Style of the report (e.g. "Skeptical", "Optimistic", "Technical").' })
  @IsString()
  @IsOptional()
  style?: string;

  @ApiProperty({ required: false, description: 'Max output tokens. Leave empty for model default.' })
  @IsNumber()
  @IsOptional()
  maxTokens?: number;

  @ApiProperty({
    description: 'Optional: Provide your own Gemini API Key for this single request (overrides user/system defaults).',
    required: false,
  })
  @IsString()
  @IsOptional()
  apiKey?: string;
}

@ApiTags('Research')
@ApiBearerAuth()
@Controller('api/v1/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @ApiOperation({
    summary: 'Submit a research question (Async)',
    description:
      'Creates a new Research Ticket and returns an ID (Async). Client should poll GET /api/v1/research/{id} to check status. Context includes live market data and the latest Risk/Reward Analysis.',
  })
  @ApiResponse({
    status: 201,
    description: 'Ticket successfully created. Processing started in background.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000', description: 'Unique Ticket ID used for polling.' },
        status: { type: 'string', example: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. missing question or empty tickers).' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Bearer token missing or invalid.' })
  @Post('ask')
  async ask(@Request() req: any, @Body() dto: AskResearchDto) {
    const userId = req.user.id;
    // Handle dynamic API key from body if present

    const ticket = await this.researchService.createResearchTicket(
      userId,
      dto.tickers,
      dto.question,
      dto.provider,
      dto.quality as QualityTier,
    );

    // Fire and forget background processing
    this.researchService
      .processTicket(ticket.id)
      .catch((err) => console.error('Background processing failed', err));

    return { id: ticket.id, status: ticket.status };
  }

  @ApiOperation({
    summary: 'List my research tickets',
    description: 'Returns a paginated list of research requests filtered by status.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['all', 'pending', 'processing', 'completed', 'failed'], description: 'Filter by status (default: all)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({
    status: 200,
    description: 'List of tickets.',
    schema: {
      example: {
        data: [{ id: '1', tickers: ['AAPL'], status: 'completed' }],
        total: 10,
        page: 1,
        limit: 10
      }
    }
  })
  @Get()
  async list(
    @Request() req: any,
    @Query('status') status: string = 'all',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const userId = req.user.id;
    return this.researchService.findAll(userId, status, Number(page), Number(limit));
  }

  @ApiOperation({
    summary: 'Retrieve a research ticket/note by ID',
    description:
      'Fetches status and result of a research request. Status Flow: pending -> processing -> completed. Result includes answer_markdown, numeric_context, and models_used.',
  })
  @ApiParam({ name: 'id', example: '550e8400-e29b-41d4-a716-446655440000', description: 'The Ticket ID returned by /ask' })
  @ApiResponse({
    status: 202,
    description: 'Processing. The research is still in progress.',
    schema: {
      example: {
         id: '123',
         status: 'processing',
         created_at: '2023-01-01T12:00:00Z'
      }
    }
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
        numeric_context: { AAPL: { price: 150, risk_reward: { overall_score: 8.5 } } },
        created_at: '2023-01-01T12:00:00Z'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Ticket not found. Invalid ID.' })
  @Get(':id')
  async getResearch(@Param('id') id: string) {
    const note = await this.researchService.getResearchNote(id);
    if (!note) {
      throw new NotFoundException(`Research note ${id} not found`);
    }
    return note;
  }
}
