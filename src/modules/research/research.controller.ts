import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiParam,
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
}

import { Public } from '../auth/public.decorator';

@ApiTags('Research')
@Controller('api/v1/research')
@Public()
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @ApiOperation({
    summary: 'Ask a research question to LLMs',
    description:
      'Submits a research question about specific tickers to the configured LLM provider. Returns a generic ID to poll for results or the immediate result if synchronous.',
  })
  @ApiResponse({
    status: 201,
    description: 'Question submitted.',
    schema: { example: { id: '123', status: 'pending', question: '...' } },
  })
  @Post('ask')
  ask(@Body() dto: AskResearchDto) {
    return this.researchService.createResearchQuestion(
      dto.tickers,
      dto.question,
      dto.provider,
      dto.quality as QualityTier,
    );
  }

  @ApiOperation({
    summary: 'Retrieve a research note by ID',
    description: 'Fetches a previously asked research note.',
  })
  @ApiParam({ name: 'id', example: '123' })
  @ApiResponse({ status: 200, description: 'Research note found.' })
  @ApiResponse({ status: 404, description: 'Research note not found.' })
  @Get(':id')
  async getResearch(@Param('id') id: string) {
    const note = await this.researchService.getResearchNote(id);
    if (!note) {
      throw new NotFoundException(`Research note ${id} not found`);
    }
    return note;
  }
}
