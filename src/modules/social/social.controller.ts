import {
  Controller,
  Get,
  Post,
  Delete,
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
  ApiHeader,
} from '@nestjs/swagger';
import { SocialService } from './social.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CronSecretGuard } from '../../common/guards/cron-secret.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { NumericIdPipe } from '../../common/pipes/numeric-id.pipe';
import { PostCommentDto } from './dto/post-comment.dto';

@ApiTags('Social')
@ApiBearerAuth()
@Controller('v1/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @ApiOperation({ summary: 'Get Comments for a Ticker' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiResponse({ status: 200, description: 'List of comments' })
  // Public, but a signed-in caller is identified (never required): authors
  // also get their own taken-down comments, admins get all of them.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('comments/:symbol')
  async getComments(@Param('symbol') symbol: string, @Request() req?: any) {
    const viewer = req?.user ? { id: req.user.id, role: req.user.role } : null;
    return this.socialService.getComments(symbol, viewer);
  }

  @ApiOperation({ summary: 'Post a Comment or Reply' })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiBody({ type: PostCommentDto })
  @ApiResponse({ status: 201, description: 'Comment created' })
  @ApiResponse({ status: 400, description: 'Empty / too long / wrong ticker' })
  @ApiResponse({ status: 404, description: 'Parent comment not found' })
  @UseGuards(JwtAuthGuard)
  @Post('comments/:symbol')
  async postComment(
    @Request() req: any,
    @Param('symbol') symbol: string,
    @Body() dto: PostCommentDto,
  ) {
    return this.socialService.postComment(
      req.user.id,
      symbol,
      dto.content,
      dto.parent_id || undefined,
    );
  }

  @ApiOperation({ summary: 'Toggle like on a comment' })
  @ApiParam({ name: 'commentId', example: '1' })
  @ApiResponse({ status: 200, description: 'Like toggled' })
  @UseGuards(JwtAuthGuard)
  @Post('comments/:commentId/like')
  async toggleLike(
    @Request() req: any,
    @Param('commentId', NumericIdPipe) commentId: string,
  ) {
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

  // ── Admin: hard-delete a comment ─────────────────────────────────────────

  @ApiOperation({ summary: 'Admin: delete a comment by ID' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({ status: 200, description: 'Comment deleted' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('comments/:id')
  async deleteComment(@Param('id', NumericIdPipe) id: string) {
    await this.socialService.deleteComment(id);
    return { success: true };
  }

  // ── Cron: LLM moderation scan ────────────────────────────────────────────

  @ApiOperation({ summary: 'Cron: scan pending comments with LLM moderation' })
  @ApiHeader({ name: 'X-Cron-Secret', required: true })
  @ApiResponse({ status: 200, description: 'Moderation results' })
  @Public()
  @UseGuards(CronSecretGuard)
  @Post('moderation/scan')
  async runModerationScan() {
    return this.socialService.moderatePendingComments();
  }
}
