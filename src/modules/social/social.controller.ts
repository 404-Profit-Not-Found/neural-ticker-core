import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Social')
@ApiBearerAuth()
@Controller('v1/social')
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

  @ApiOperation({ summary: 'Post a Comment or Reply' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        parent_id: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Comment created' })
  @UseGuards(JwtAuthGuard)
  @Post('comments/:symbol')
  async postComment(
    @Request() req: any,
    @Param('symbol') symbol: string,
    @Body('content') content: any,
    @Body('parent_id') parentId?: string,
  ) {
    let normalizedContent: string;

    if (typeof content === 'string') {
      normalizedContent = content;
    } else if (Array.isArray(content)) {
      normalizedContent =
        content.length > 0 ? String(content[0]) : '';
    } else {
      normalizedContent = content != null ? String(content) : '';
    }

    return this.socialService.postComment(
      req.user.id,
      symbol,
      normalizedContent,
      parentId,
    );
  }

  @ApiOperation({ summary: 'Toggle like on a comment' })
  @ApiParam({ name: 'commentId', example: '1' })
  @ApiResponse({ status: 200, description: 'Like toggled' })
  @UseGuards(JwtAuthGuard)
  @Post('comments/:commentId/like')
  async toggleLike(@Request() req: any, @Param('commentId') commentId: string) {
    return this.socialService.toggleLike(req.user.id, commentId);
  }

  @ApiOperation({ summary: 'Get comment IDs liked by current user' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'List of liked comment IDs' })
  @UseGuards(JwtAuthGuard)
  @Get('comments/:symbol/my-likes')
  async getMyLikes(@Request() req: any, @Param('symbol') symbol: string) {
    const ids = await this.socialService.getUserLikedCommentIds(
      req.user.id,
      symbol,
    );
    return { liked_ids: ids };
  }

  @ApiOperation({ summary: 'Get Watcher Count' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({
    status: 200,
    description: 'Number of users watching this ticker',
  })
  @Public()
  @Get('stats/:symbol/watchers')
  async getWatcherCount(@Param('symbol') symbol: string) {
    const count = await this.socialService.getWatcherCount(symbol);
    return { symbol, watchers: count };
  }
}
