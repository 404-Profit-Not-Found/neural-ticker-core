import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CommentLike } from './entities/comment-like.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { WebPushService } from '../web-push/web-push.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(CommentLike)
    private readonly likeRepo: Repository<CommentLike>,
    @InjectRepository(WatchlistItem)
    private readonly watchlistItemRepo: Repository<WatchlistItem>,
    @InjectRepository(TickerEntity)
    private readonly tickerRepo: Repository<TickerEntity>,
    private readonly notificationsService: NotificationsService,
    private readonly webPushService: WebPushService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Extract mentioned user IDs from comment content.
   * Mentions are stored as <@userId> tokens (UUIDs).
   */
  private extractMentionedUserIds(content: string): string[] {
    const regex = /<@([a-f0-9-]{36})>/g;
    const ids: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      ids.push(m[1]);
    }
    return [...new Set(ids)];
  }

  /**
   * Get top-level comments for a symbol with replies and like counts.
   */
  async getComments(symbol: string, limit: number = 50) {
    // Fetch top-level comments only (parent_id IS NULL)
    const comments = await this.commentRepo.find({
      where: { ticker_symbol: symbol, parent_id: IsNull() },
      order: { created_at: 'DESC' },
      take: limit,
      relations: ['user', 'replies', 'replies.user'],
    });

    // Attach like counts via a single query
    if (comments.length > 0) {
      const allIds = comments.flatMap((c) => [
        c.id,
        ...(c.replies || []).map((r) => r.id),
      ]);

      const likeCounts = await this.likeRepo
        .createQueryBuilder('like')
        .select('like.comment_id', 'comment_id')
        .addSelect('COUNT(like.id)', 'count')
        .where('like.comment_id IN (:...ids)', { ids: allIds })
        .groupBy('like.comment_id')
        .getRawMany();

      const countMap = new Map<string, number>();
      for (const row of likeCounts) {
        countMap.set(row.comment_id, parseInt(row.count, 10));
      }

      for (const comment of comments) {
        comment.like_count = countMap.get(comment.id) || 0;
        if (comment.replies) {
          // Sort replies oldest first
          comment.replies.sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
          for (const reply of comment.replies) {
            reply.like_count = countMap.get(reply.id) || 0;
          }
        }
      }
    }

    // Resolve <@userId> mention tokens to current user data
    const allContent = comments
      .flatMap((c) => [c.content, ...(c.replies || []).map((r) => r.content)])
      .join(' ');
    const mentionedIds = this.extractMentionedUserIds(allContent);
    const mentionedUsers: Record<
      string,
      { id: string; nickname: string; avatar_url: string | null; tier: string }
    > = {};
    if (mentionedIds.length > 0) {
      const users = await this.usersService.findByIds(mentionedIds);
      for (const u of users) {
        mentionedUsers[u.id] = {
          id: u.id,
          nickname: u.nickname || u.email?.split('@')[0] || 'Unknown',
          avatar_url: u.avatar_url,
          tier: u.tier,
        };
      }
    }

    return { comments, mentionedUsers };
  }

  /**
   * Post a comment or reply. If parentId is provided, it's a threaded reply.
   */
  async postComment(
    userId: string,
    symbol: string,
    content: string,
    parentId?: string,
  ) {
    const comment = this.commentRepo.create({
      user_id: userId,
      ticker_symbol: symbol,
      content,
      parent_id: parentId || null,
    });
    const saved = await this.commentRepo.save(comment);

    // Load user relation for response
    const full = await this.commentRepo.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });

    // If this is a reply, notify the parent comment author
    if (parentId) {
      const parent = await this.commentRepo.findOne({
        where: { id: parentId },
        relations: ['user'],
      });

      if (parent && parent.user_id !== userId) {
        const replierName =
          full?.user?.nickname || full?.user?.email?.split('@')[0] || 'Someone';

        // In-app notification
        this.notificationsService
          .create(
            parent.user_id,
            'comment_reply',
            `${replierName} replied to your comment`,
            `"${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`,
            {
              symbol,
              commentId: saved.id,
              parentCommentId: parentId,
            },
          )
          .catch((err) =>
            this.logger.error(`Failed to send reply notification`, err),
          );

        // Web push
        this.webPushService
          .sendToUser(parent.user_id, {
            title: `${replierName} replied to your comment`,
            body: `on ${symbol}: "${content.slice(0, 80)}"`,
            icon: '/favicon-robot.png',
            data: { url: `/ticker/${symbol}`, symbol },
          })
          .catch((err) =>
            this.logger.warn(`Web push failed for reply: ${err.message}`),
          );
      }
    }

    // --- Mention notifications ---
    const mentionedUserIds = this.extractMentionedUserIds(content);
    if (mentionedUserIds.length > 0) {
      const commenterName =
        full?.user?.nickname || full?.user?.email?.split('@')[0] || 'Someone';

      // Find parent author ID to avoid double-notifying them (already got reply notification)
      const parentAuthorId = parentId
        ? (await this.commentRepo.findOne({ where: { id: parentId } }))?.user_id
        : null;

      for (const mentionedId of mentionedUserIds) {
        // Skip self-mentions
        if (mentionedId === userId) continue;
        // Skip if already notified as reply parent author
        if (mentionedId === parentAuthorId) continue;

        // In-app notification
        this.notificationsService
          .create(
            mentionedId,
            'comment_mention',
            `${commenterName} mentioned you on ${symbol}`,
            `"${content.replace(/<@[a-f0-9-]{36}>/g, '@user').slice(0, 100)}"`,
            { symbol, commentId: saved.id, mentionedBy: userId },
          )
          .catch((err) =>
            this.logger.error(`Failed to send mention notification`, err),
          );

        // Web push
        this.webPushService
          .sendToUser(mentionedId, {
            title: `${commenterName} mentioned you`,
            body: `on ${symbol}`,
            icon: '/favicon-robot.png',
            data: { url: `/ticker/${symbol}`, symbol },
          })
          .catch((err) =>
            this.logger.warn(`Web push failed for mention: ${err.message}`),
          );
      }
    }

    return full || saved;
  }

  /**
   * Toggle like on a comment. Returns the new like state and count.
   */
  async toggleLike(
    userId: string,
    commentId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const existing = await this.likeRepo.findOne({
      where: { comment_id: commentId, user_id: userId },
    });

    let liked: boolean;
    if (existing) {
      // Unlike
      await this.likeRepo.remove(existing);
      liked = false;
    } else {
      // Like
      const like = this.likeRepo.create({
        comment_id: commentId,
        user_id: userId,
      });
      await this.likeRepo.save(like);
      liked = true;

      // Notify comment owner (only on like, not unlike)
      if (comment.user_id !== userId) {
        // We need the liker's name — query separately since we don't have it
        const likerComment = await this.commentRepo.query(
          `SELECT nickname, email FROM users WHERE id = $1`,
          [userId],
        );
        const likerName =
          likerComment?.[0]?.nickname ||
          likerComment?.[0]?.email?.split('@')[0] ||
          'Someone';

        this.notificationsService
          .create(
            comment.user_id,
            'comment_like',
            `${likerName} liked your comment`,
            `"${comment.content.slice(0, 100)}${comment.content.length > 100 ? '...' : ''}"`,
            {
              symbol: comment.ticker_symbol,
              commentId: comment.id,
            },
          )
          .catch((err) =>
            this.logger.error(`Failed to send like notification`, err),
          );

        this.webPushService
          .sendToUser(comment.user_id, {
            title: `${likerName} liked your comment`,
            body: `on ${comment.ticker_symbol}`,
            icon: '/favicon-robot.png',
            data: {
              url: `/ticker/${comment.ticker_symbol}`,
              symbol: comment.ticker_symbol,
            },
          })
          .catch((err) =>
            this.logger.warn(`Web push failed for like: ${err.message}`),
          );
      }
    }

    const likeCount = await this.likeRepo.count({
      where: { comment_id: commentId },
    });

    return { liked, likeCount };
  }

  /**
   * Get IDs of comments the user has liked for a given symbol.
   */
  async getUserLikedCommentIds(
    userId: string,
    symbol: string,
  ): Promise<string[]> {
    const likes = await this.likeRepo
      .createQueryBuilder('like')
      .innerJoin('like.comment', 'comment')
      .select('like.comment_id', 'comment_id')
      .where('like.user_id = :userId', { userId })
      .andWhere('comment.ticker_symbol = :symbol', { symbol })
      .getRawMany();

    return likes.map((l) => l.comment_id);
  }

  async getWatcherCount(symbol: string): Promise<number> {
    // Find ticker id first
    const ticker = await this.tickerRepo.findOne({ where: { symbol } });
    if (!ticker) return 0;

    return this.watchlistItemRepo.count({
      where: { ticker_id: ticker.id },
    });
  }
}
