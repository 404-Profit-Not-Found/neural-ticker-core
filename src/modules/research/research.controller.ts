import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
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
    example: ['AAPL'],
    description: 'List of tickers to research',
  })
  @IsArray()
  @IsString({ each: true })
  tickers: string[];

  @ApiProperty({
    example: 'Is this a good long-term hold?',
    description: 'Research question',
  })
  @IsString()
  question: string;

  @ApiProperty({ enum: ['openai', 'gemini', 'ensemble'], required: false })
  @IsEnum(['openai', 'gemini', 'ensemble'])
  @IsOptional()
  provider?: 'openai' | 'gemini' | 'ensemble';

  @ApiProperty({ enum: ['low', 'medium', 'high', 'deep'], required: false })
  @IsEnum(['low', 'medium', 'high', 'deep'])
  @IsOptional()
  quality?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  style?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  maxTokens?: number;

  @ApiProperty({
    description: 'Optional: Provide your own Gemini API Key',
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
      'Creates a research ticket. Returns a Ticket ID immediately. Poll GET /:id for status.',
  })
  @ApiResponse({
    status: 201,
    description: 'Ticket created.',
    schema: { example: { id: '123', status: 'pending' } },
  })
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
    summary: 'Retrieve a research ticket/note by ID',
    description: 'Fetches status and result of a research request.',
  })
  @ApiParam({ name: 'id', example: '123' })
  @ApiResponse({ status: 200, description: 'Found.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  @Get(':id')
  async getResearch(@Param('id') id: string) {
    const note = await this.researchService.getResearchNote(id);
    if (!note) {
      throw new NotFoundException(`Research note ${id} not found`);
    }
    return note;
  }
}
