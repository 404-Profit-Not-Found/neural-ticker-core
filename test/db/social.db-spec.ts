import { DataSource } from 'typeorm';
import { Comment } from '../../src/modules/social/entities/comment.entity';
import { CommentLike } from '../../src/modules/social/entities/comment-like.entity';
import { SocialService } from '../../src/modules/social/social.service';
import { TickerEntity } from '../../src/modules/tickers/entities/ticker.entity';
import { AllowedUser } from '../../src/modules/users/entities/allowed-user.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { SecretBox } from '../../src/modules/users/secret-box.service';
import { UsersService } from '../../src/modules/users/users.service';
import { WatchlistItem } from '../../src/modules/watchlist/entities/watchlist-item.entity';
import {
  describeDb,
  ensureMigrated,
  openDataSource,
  truncateAll,
} from './support/test-db';

/**
 * Comments on a real PostgreSQL: the like toggle under real concurrency (its
 * advisory lock and the unique index behind it), who sees a taken-down
 * comment, and mention tokens that are not user ids.
 */
describeDb(
  'social: likes, moderation visibility, mentions (real PostgreSQL)',
  () => {
    let ds: DataSource;
    let social: SocialService;
    const users: Record<string, string> = {};

    beforeAll(async () => {
      await ensureMigrated();
      ds = await openDataSource({ extra: { max: 40 } } as any);
      const usersService = new UsersService(
        { generate: () => 'Nick' } as any,
        ds.getRepository(User),
        ds.getRepository(AllowedUser),
        new SecretBox({ get: () => undefined } as any),
      );
      social = new SocialService(
        ds.getRepository(Comment),
        ds.getRepository(CommentLike),
        ds.getRepository(WatchlistItem),
        ds.getRepository(TickerEntity),
        { create: () => Promise.resolve() } as any,
        { sendToUser: () => Promise.resolve(), tickerIconUrl: () => '' } as any,
        usersService,
        { get: () => undefined } as any,
      );
    });
    afterAll(async () => {
      await ds?.destroy();
    });

    beforeEach(async () => {
      await truncateAll(ds);
      for (const [name, role] of [
        ['author', 'user'],
        ['other', 'user'],
        ['admin', 'admin'],
        ['reader', 'user'],
      ]) {
        const [{ id }] = await ds.query(
          `INSERT INTO users (email, nickname, role, preferences)
         VALUES ($1, $2, $3, '{"gemini_api_key":"PRIVATE-KEY"}') RETURNING id`,
          [`${name}@private.example`, name, role],
        );
        users[name] = id;
      }
    });

    const addComment = async (
      author: string,
      content: string,
      status = 'ok',
      over: {
        parent?: string;
        symbol?: string;
        ageMinutes?: number;
        reason?: string;
      } = {},
    ): Promise<string> =>
      (
        await ds.query(
          `INSERT INTO comments (ticker_symbol, content, user_id, parent_id, moderation_status, moderation_reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval) RETURNING id`,
          [
            over.symbol ?? 'NVDA',
            content,
            users[author],
            over.parent ?? null,
            status,
            over.reason ?? null,
            String(over.ageMinutes ?? 0),
          ],
        )
      )[0].id;
    const likeRows = async (commentId: string): Promise<number> =>
      (
        await ds.query(
          `SELECT count(*)::int AS n FROM comment_likes WHERE comment_id = $1`,
          [commentId],
        )
      )[0].n;

    describe('toggleLike', () => {
      it('the unique index exists — the database itself refuses a second like by the same user', async () => {
        const comment = await addComment('author', 'hello');
        const [index] = await ds.query(
          `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_comment_likes_unique'`,
        );
        expect(index.indexdef).toContain('UNIQUE INDEX');
        expect(index.indexdef).toContain('(comment_id, user_id)');

        await ds.query(
          `INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)`,
          [comment, users.reader],
        );
        await expect(
          ds.query(
            `INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)`,
            [comment, users.reader],
          ),
        ).rejects.toMatchObject({ code: '23505' });
      });

      it.each([
        [2, 0],
        [25, 1],
        [40, 0],
      ])(
        '%i simultaneous toggles by ONE user (double clicks): none fails, and the likes add up (%i left)',
        async (clicks, left) => {
          const comment = await addComment('author', 'hello');

          const results = await Promise.allSettled(
            Array.from({ length: clicks }, () =>
              social.toggleLike(users.reader, comment),
            ),
          );

          expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
          expect(await likeRows(comment)).toBe(left);
          // each call saw a consistent state: liked and un-liked alternate
          const liked = results.filter((r: any) => r.value.liked).length;
          expect(liked).toBe(Math.ceil(clicks / 2));
        },
      );

      it('simultaneous likes by DIFFERENT users all count', async () => {
        const comment = await addComment('author', 'hello');

        const results = await Promise.all(
          ['reader', 'other', 'admin', 'author'].map((u) =>
            social.toggleLike(users[u], comment),
          ),
        );

        expect(results.every((r) => r.liked)).toBe(true);
        expect(await likeRows(comment)).toBe(4);
        expect((await social.toggleLike(users.reader, comment)).likeCount).toBe(
          3,
        );
      });

      it('holds no advisory lock afterwards', async () => {
        const comment = await addComment('author', 'hello');
        await Promise.all(
          Array.from({ length: 10 }, () =>
            social.toggleLike(users.reader, comment),
          ),
        );
        const [{ held }] = await ds.query(
          `SELECT count(*)::int AS held FROM pg_locks WHERE locktype = 'advisory'`,
        );
        expect(held).toBe(0);
      });

      it('an id that is not a comment is a 404', async () => {
        await expect(social.toggleLike(users.reader, '999999')).rejects.toThrow(
          'Comment not found',
        );
      });
    });

    describe('who sees a taken-down comment', () => {
      const seed = async () => {
        const ids = {
          ok: await addComment('author', 'fine', 'ok', { ageMinutes: 50 }),
          pending: await addComment(
            'author',
            'awaiting moderation',
            'pending',
            { ageMinutes: 40 },
          ),
          flagged: await addComment('author', 'flagged text', 'flagged', {
            ageMinutes: 30,
            reason: 'spam',
          }),
          rejected: await addComment('author', 'rejected text', 'rejected', {
            ageMinutes: 20,
            reason: 'abuse',
          }),
          othersFlagged: await addComment('other', 'other flagged', 'flagged', {
            ageMinutes: 10,
            reason: 'spam',
          }),
        };
        // replies under the visible comment: one fine, one taken down
        const replies = {
          okReply: await addComment('other', 'reply fine', 'ok', {
            parent: ids.ok,
            ageMinutes: 5,
          }),
          flaggedReply: await addComment('author', 'reply flagged', 'flagged', {
            parent: ids.ok,
            ageMinutes: 4,
            reason: 'spam',
          }),
        };
        return { ...ids, ...replies };
      };
      const shape = (thread: any) =>
        thread.comments.map((c: any) => ({
          content: c.content,
          replies: c.replies.map((r: any) => r.content),
        }));

      it('anonymous: only comments that are not taken down (pending ones show, as before)', async () => {
        await seed();

        const thread = await social.getComments('NVDA', null);

        expect(shape(thread)).toEqual([
          { content: 'awaiting moderation', replies: [] },
          { content: 'fine', replies: ['reply fine'] },
        ]);
        expect(JSON.stringify(thread)).not.toContain('moderation_reason');
      });

      it('the author: also their OWN taken-down comments and replies — not other people’s, and never the reason', async () => {
        await seed();

        const thread = await social.getComments('NVDA', {
          id: users.author,
          role: 'user',
        });

        expect(shape(thread)).toEqual([
          { content: 'rejected text', replies: [] },
          { content: 'flagged text', replies: [] },
          { content: 'awaiting moderation', replies: [] },
          { content: 'fine', replies: ['reply fine', 'reply flagged'] },
        ]);
        expect(JSON.stringify(thread)).not.toContain('other flagged');
        expect(JSON.stringify(thread)).not.toContain('moderation_reason');
      });

      it('another signed-in user sees what an anonymous visitor sees', async () => {
        await seed();
        const thread = await social.getComments('NVDA', {
          id: users.reader,
          role: 'user',
        });
        expect(shape(thread)).toEqual([
          { content: 'awaiting moderation', replies: [] },
          { content: 'fine', replies: ['reply fine'] },
        ]);
      });

      it('an admin: everything, with the moderator’s reason', async () => {
        await seed();

        const thread = await social.getComments('NVDA', {
          id: users.admin,
          role: 'admin',
        });

        expect(shape(thread).map((c: any) => c.content)).toEqual([
          'other flagged',
          'rejected text',
          'flagged text',
          'awaiting moderation',
          'fine',
        ]);
        expect(
          thread.comments.find((c: any) => c.content === 'flagged text'),
        ).toMatchObject({
          moderation_status: 'flagged',
          moderation_reason: 'spam',
        });
      });

      it('taken-down comments do not use up the page: the newest VISIBLE ones are returned', async () => {
        for (let i = 0; i < 6; i++)
          await addComment('other', `hidden ${i}`, 'flagged', {
            ageMinutes: i,
          });
        for (let i = 0; i < 4; i++)
          await addComment('author', `visible ${i}`, 'ok', {
            ageMinutes: 10 + i,
          });

        const thread = await social.getComments('NVDA', null, 3);

        expect(thread.comments.map((c: any) => c.content)).toEqual([
          'visible 0',
          'visible 1',
          'visible 2',
        ]);
      });

      it('authors are public views: no email, no preferences, no API key in the feed', async () => {
        await seed();
        const thread = await social.getComments('NVDA', {
          id: users.admin,
          role: 'admin',
        });

        const json = JSON.stringify(thread);
        expect(json).not.toContain('private.example');
        expect(json).not.toContain('PRIVATE-KEY');
        expect(json).not.toContain('preferences');
        expect(Object.keys(thread.comments[0].user!).sort()).toEqual([
          'avatar_url',
          'id',
          'nickname',
          'tier',
        ]);
      });
    });

    describe('mention tokens', () => {
      it('resolves real user ids to public views', async () => {
        await addComment(
          'author',
          `hi <@${users.reader}> and <@${users.other}>`,
        );

        const thread = await social.getComments('NVDA', null);

        expect(Object.keys(thread.mentionedUsers).sort()).toEqual(
          [users.reader, users.other].sort(),
        );
        expect(thread.mentionedUsers[users.reader]).toEqual({
          id: users.reader,
          nickname: 'reader',
          avatar_url: null,
          tier: 'free',
        });
      });

      // The token pattern is "36 characters of a-f, 0-9 and -", which is not the
      // same thing as a UUID: Postgres rejected such an id (22P02) and the whole
      // feed answered 500 — for everyone, because of one comment.
      it.each([
        ['36 dashes', '-'.repeat(36)],
        ['36 hex digits without dashes', 'abcdef0123'.repeat(4).slice(0, 36)],
        ['dashes in the wrong places', 'aaaaaaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa'],
        ['a well-formed id nobody has', '11111111-2222-3333-4444-555555555555'],
      ])('%s in a comment does not break the feed', async (_label, token) => {
        await addComment('author', `look <@${token}> and <@${users.reader}>`);

        const thread = await social.getComments('NVDA', null);

        expect(thread.comments).toHaveLength(1);
        expect(Object.keys(thread.mentionedUsers)).toEqual([users.reader]);
      });
    });
  },
);
