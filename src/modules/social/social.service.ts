import { GEMINI_FLASH_LITE_MODEL } from '../../config/configuration';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In, FindOptionsWhere } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Comment } from './entities/comment.entity';
import { CommentLike } from './entities/comment-like.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { WebPushService } from '../web-push/web-push.service';
import { UsersService } from '../users/users.service';
import { PublicUser } from '../users/public-user';

/** Who is asking for a comment thread. `null` / undefined = anonymous. */
export interface CommentViewer {
  id: string;
  role?: string;
}

// Comments moderation has taken down. Only their author and admins see them.
const HIDDEN_MODERATION_STATUSES = ['flagged', 'rejected'];

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
    private readonly configService: ConfigService,
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
   * Public views of the given users, keyed by id. Comment authors and mention
   * targets are other users (and the comment feed is a public endpoint), so
   * this service never loads a `User` row or the `Comment.user` relation.
   */
  private async publicUsersById(
    ids: string[],
  ): Promise<Map<string, PublicUser>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const users = await this.usersService.findPublicByIds(unique);
    return new Map(users.map((u) => [u.id, u]));
  }

  /** A taken-down comment is visible to its author and to admins only. */
  private canSee(
    comment: Pick<Comment, 'moderation_status' | 'user_id'>,
    viewer?: CommentViewer | null,
  ): boolean {
    if (!HIDDEN_MODERATION_STATUSES.includes(comment.moderation_status)) {
      return true;
    }
    return (
      viewer?.role === 'admin' || (!!viewer && comment.user_id === viewer.id)
    );
  }

  /**
   * A comment as a client receives it: with its author's public view, and
   * without the moderator's reason unless the viewer is an admin.
   */
  private toClientComment<T extends Partial<Comment>>(
    comment: T,
    user: PublicUser | null,
    viewer?: CommentViewer | null,
  ): Omit<T, 'user' | 'moderation_reason'> & {
    user: PublicUser | null;
    moderation_reason?: string | null;
  } {
    const view = { ...comment, user };
    if (viewer?.role !== 'admin') {
      delete view.moderation_reason;
    }
    return view;
  }

  /**
   * Get top-level comments for a symbol with replies and like counts.
   *
   * The feed is public. `viewer` (when the caller is signed in) only widens
   * it: an author also gets their own taken-down comments, an admin gets
   * everything plus `moderation_reason`.
   */
  async getComments(
    symbol: string,
    viewer?: CommentViewer | null,
    limit: number = 50,
  ) {
    const topLevel: FindOptionsWhere<Comment> = {
      ticker_symbol: symbol,
      parent_id: IsNull(),
    };
    const visible: FindOptionsWhere<Comment> = {
      ...topLevel,
      moderation_status: Not(In(HIDDEN_MODERATION_STATUSES)),
    };
    // Filtered in the query so taken-down comments do not use up the page.
    const where: FindOptionsWhere<Comment> | FindOptionsWhere<Comment>[] =
      viewer?.role === 'admin'
        ? topLevel
        : viewer
          ? [visible, { ...topLevel, user_id: viewer.id }]
          : visible;

    // Fetch top-level comments only (parent_id IS NULL). Authors are attached
    // below as their public view — the `user` relation is NOT loaded.
    const comments = await this.commentRepo.find({
      where,
      order: { created_at: 'DESC' },
      take: limit,
      relations: ['replies'],
    });

    // Replies come with their parent: drop the taken-down ones here.
    for (const comment of comments) {
      comment.replies = (comment.replies || []).filter((reply) =>
        this.canSee(reply, viewer),
      );
    }

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

    // Resolve authors and <@userId> mention tokens to current public user data
    const thread = comments.flatMap((c) => [c, ...(c.replies || [])]);
    const mentionedIds = this.extractMentionedUserIds(
      thread.map((c) => c.content).join(' '),
    );
    const users = await this.publicUsersById([
      ...thread.map((c) => c.user_id),
      ...mentionedIds,
    ]);

    const mentionedUsers: Record<string, PublicUser> = {};
    for (const id of mentionedIds) {
      const user = users.get(id);
      if (user) mentionedUsers[id] = user;
    }

    const toClient = <T extends Partial<Comment>>(c: T) =>
      this.toClientComment(c, users.get(c.user_id as string) ?? null, viewer);

    return {
      comments: comments.map((c) => ({
        ...toClient(c),
        replies: (c.replies || []).map(toClient),
      })),
      mentionedUsers,
    };
  }

  /**
   * Post a comment or reply. If parentId is provided, it's a threaded reply.
   */
  async postComment(
    userId: string,
    symbol: string,
    content: any,
    parentId?: string,
  ) {
    // Normalize and validate content to prevent type confusion from HTTP body.
    if (Array.isArray(content)) {
      content = content.length > 0 ? String(content[0]) : '';
    }
    if (typeof content !== 'string') {
      throw new BadRequestException('Invalid content');
    }

    // A reply belongs to its parent's thread: the parent must exist and be a
    // comment on the same ticker (a foreign parent_id would otherwise attach
    // this text to another ticker's discussion, or fail the FK with a 500).
    let parent: Comment | null = null;
    if (parentId) {
      parent = await this.commentRepo.findOne({ where: { id: parentId } });
      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }
      if (parent.ticker_symbol.toUpperCase() !== symbol.toUpperCase()) {
        throw new BadRequestException(
          'A reply must be posted on the same ticker as its parent comment',
        );
      }
    }

    const comment = this.commentRepo.create({
      user_id: userId,
      ticker_symbol: parent ? parent.ticker_symbol : symbol,
      content,
      parent_id: parentId || null,
    });
    const saved = await this.commentRepo.save(comment);

    // The author's public view: for the response and the notification texts
    // other users receive (never the email).
    const author = (await this.publicUsersById([userId])).get(userId) ?? null;
    const authorName = author?.nickname || 'Someone';

    // If this is a reply, notify the parent comment author
    if (parentId) {
      if (parent && parent.user_id !== userId) {
        const replierName = authorName;

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
            icon: this.webPushService.tickerIconUrl(symbol),
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
      const commenterName = authorName;

      // Find parent author ID to avoid double-notifying them (already got reply notification)
      const parentAuthorId = parent ? parent.user_id : null;

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
            icon: this.webPushService.tickerIconUrl(symbol),
            data: { url: `/ticker/${symbol}`, symbol },
          })
          .catch((err) =>
            this.logger.warn(`Web push failed for mention: ${err.message}`),
          );
      }
    }

    return this.toClientComment(saved, author, { id: userId });
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
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Check-then-insert, serialized per (comment, user): two simultaneous
    // requests (a double click) would otherwise both see "no like yet" and both
    // insert — the second one hitting the unique index and failing with a 500.
    // The advisory lock is released when the transaction ends.
    const liked = await this.likeRepo.manager.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `comment-like:${commentId}:${userId}`,
      ]);
      const likes = tx.getRepository(CommentLike);
      const existing = await likes.findOne({
        where: { comment_id: commentId, user_id: userId },
      });
      if (existing) {
        // Unlike
        await likes.remove(existing);
        return false;
      }
      // Like
      await likes.save(
        likes.create({ comment_id: commentId, user_id: userId }),
      );
      return true;
    });

    if (liked) {
      // Notify comment owner (only on like, not unlike)
      if (comment.user_id !== userId) {
        // We need the liker's name — their public one, never the email
        const liker = (await this.publicUsersById([userId])).get(userId);
        const likerName = liker?.nickname || 'Someone';

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
            icon: this.webPushService.tickerIconUrl(comment.ticker_symbol),
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

  /**
   * Hard-delete a comment by ID (admin only).
   * TypeORM cascade removes child replies and likes automatically.
   */
  async deleteComment(commentId: string): Promise<void> {
    await this.commentRepo.delete({ id: commentId });
    this.logger.log(`Comment ${commentId} deleted by admin`);
  }

  /**
   * LLM moderation cron — scans all pending comments in batches of 30
   * and marks each as 'ok' or 'flagged' using Gemini Flash Lite.
   * Comments already reviewed (status != 'pending') are skipped.
   */
  async moderatePendingComments(): Promise<{
    scanned: number;
    flagged: number;
    ok: number;
  }> {
    const pending = await this.commentRepo.find({
      where: { moderation_status: 'pending' },
      take: 200,
      select: ['id', 'content'],
    });

    if (pending.length === 0) {
      return { scanned: 0, flagged: 0, ok: 0 };
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY is not configured — cannot run comment moderation',
      );
    }

    const genai = new GoogleGenAI({ apiKey });
    const moderationModel =
      this.configService.get<string>('gemini.models.scoring') ||
      GEMINI_FLASH_LITE_MODEL;

    const SYSTEM_PROMPT =
      'You are a content moderator for a financial investment discussion platform. ' +
      'Classify each comment as "ok" (stock analysis, opinions, questions, market commentary — even if strongly worded) ' +
      'or "flagged" (hate speech, slurs, threats, explicit sexual content, spam, or personal attacks unrelated to finance). ' +
      'Return a JSON array where each element has: id (integer), status ("ok" or "flagged"), reason (string or null). ' +
      'Only return the JSON array, no other text.';

    const BATCH_SIZE = 30;
    let totalFlagged = 0;
    let totalOk = 0;

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const batchInput = batch.map((c) => ({ id: c.id, content: c.content }));

      try {
        const response = await genai.models.generateContent({
          // The configured local-text tier (Flash Lite): no second literal.
          model: moderationModel,
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(batchInput) }],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'array' as any,
              items: {
                type: 'object' as any,
                properties: {
                  id: { type: 'integer' as any },
                  status: {
                    type: 'string' as any,
                    enum: ['ok', 'flagged'],
                  },
                  reason: { type: 'string' as any, nullable: true },
                },
                required: ['id', 'status'],
              },
            },
          },
        });

        const rawText = response.text ?? '[]';
        const results: Array<{
          id: string | number;
          status: 'ok' | 'flagged';
          reason?: string | null;
        }> = JSON.parse(rawText);

        // Build lookup map by id for O(1) updates
        const resultMap = new Map(results.map((r) => [String(r.id), r]));

        for (const comment of batch) {
          const result = resultMap.get(String(comment.id));
          if (!result) continue;

          await this.commentRepo.update(
            { id: comment.id },
            {
              moderation_status: result.status,
              moderation_reason: result.reason ?? null,
            },
          );

          if (result.status === 'flagged') {
            totalFlagged++;
          } else {
            totalOk++;
          }
        }
      } catch (err) {
        this.logger.error(
          `Moderation batch [${i}–${i + batch.length - 1}] failed: ${err.message}`,
        );
        // Continue with next batch even if one fails
      }
    }

    this.logger.log(
      `Moderation complete: scanned=${pending.length}, flagged=${totalFlagged}, ok=${totalOk}`,
    );
    return { scanned: pending.length, flagged: totalFlagged, ok: totalOk };
  }
}
