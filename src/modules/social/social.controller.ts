import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SocialService } from './social.service';
import { Public } from '../auth/public.decorator';

@ApiTags('Social')
@ApiBearerAuth()
@Controller('api/v1/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @ApiOperation({ summary: 'Get Comments for a Ticker' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'List of comments' })
  @Public()
  @Get('comments/:symbol')
  async getComments(@Param('symbol') symbol: string) {
    return this.socialService.getComments(symbol);
  }

  @ApiOperation({ summary: 'Post a Comment' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiBody({ schema: { type: 'object', properties: { content: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Comment created' })
  @Post('comments/:symbol')
  async postComment(
    @Request() req: any,
    @Param('symbol') symbol: string,
    @Body('content') content: string,
  ) {
    return this.socialService.postComment(req.user.id, symbol, content);
  }

  @ApiOperation({ summary: 'Get Watcher Count' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'Number of users watching this ticker' })
  @Public()
  @Get('stats/:symbol/watchers')
  async getWatcherCount(@Param('symbol') symbol: string) {
      const count = await this.socialService.getWatcherCount(symbol);
      return { symbol, watchers: count };
  }
}
