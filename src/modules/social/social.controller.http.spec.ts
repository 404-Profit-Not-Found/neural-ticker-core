import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { MAX_COMMENT_LENGTH } from './dto/post-comment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { UsersService } from '../users/users.service';

/**
 * The social routes behind a real HTTP server, with the REAL auth stack: the
 * global JwtAuthGuard (as in app.module), the real JwtStrategy, and the
 * OptionalJwtAuthGuard on the public comment feed — plus the same global
 * ValidationPipe as main.ts. Only SocialService and the user lookup are mocked.
 */
describe('SocialController (HTTP: optional auth + validation)', () => {
  const SECRET = 'test-only-secret';
  let app: INestApplication;

  const social = {
    getComments: jest.fn(),
    postComment: jest.fn(),
    toggleLike: jest.fn(),
    deleteComment: jest.fn(),
  };
  const users = { findById: jest.fn() };

  const tokenFor = (userId: string, secret = SECRET) =>
    new JwtService({ secret }).sign({ sub: userId });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [SocialController],
      providers: [
        { provide: SocialService, useValue: social },
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined),
          },
        },
        { provide: UsersService, useValue: users },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    // Bind once, on loopback. Left unbound, supertest does a wildcard
    // listen(0) per request, and macOS hands out ephemeral ports that another
    // local app already holds on 127.0.0.1 — the request then reaches that app
    // instead of this server (hang / "Parse Error: Expected HTTP/").
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    social.getComments.mockResolvedValue({ comments: [], mentionedUsers: {} });
    social.postComment.mockResolvedValue({ id: '1' });
    social.toggleLike.mockResolvedValue({ liked: true, likeCount: 1 });
    users.findById.mockImplementation((id: string) =>
      Promise.resolve(
        {
          'user-1': { id: 'user-1', role: 'user', email: 'u@example.com' },
          'admin-1': { id: 'admin-1', role: 'admin', email: 'a@example.com' },
          'banned-1': { id: 'banned-1', role: 'revoked' },
        }[id] ?? null,
      ),
    );
  });

  const http = () => request(app.getHttpServer());

  describe('GET /v1/social/comments/:symbol — public, viewer identified when signed in', () => {
    it('serves an anonymous visitor (no credentials) as an anonymous viewer', async () => {
      await http().get('/v1/social/comments/AAPL').expect(200);

      expect(social.getComments).toHaveBeenCalledWith('AAPL', null);
    });

    it('identifies a signed-in caller from a bearer token', async () => {
      await http()
        .get('/v1/social/comments/AAPL')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`)
        .expect(200);

      expect(social.getComments).toHaveBeenCalledWith('AAPL', {
        id: 'user-1',
        role: 'user',
      });
    });

    it('identifies a signed-in caller from the session cookie (how the web clients authenticate)', async () => {
      await http()
        .get('/v1/social/comments/AAPL')
        .set('Cookie', `authentication=${tokenFor('admin-1')}`)
        .expect(200);

      expect(social.getComments).toHaveBeenCalledWith('AAPL', {
        id: 'admin-1',
        role: 'admin',
      });
    });

    it.each([
      ['a garbage token', 'not-a-jwt'],
      ['a token signed with another secret', tokenFor('admin-1', 'other')],
      ['a token for a deleted user', tokenFor('ghost')],
      ['a token for a banned user', tokenFor('banned-1')],
    ])('still answers 200 — as anonymous — for %s', async (_l, token) => {
      await http()
        .get('/v1/social/comments/AAPL')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(social.getComments).toHaveBeenCalledWith('AAPL', null);
    });
  });

  describe('POST /v1/social/comments/:symbol', () => {
    const post = (body: unknown, token = tokenFor('user-1')) =>
      http()
        .post('/v1/social/comments/AAPL')
        .set('Authorization', `Bearer ${token}`)
        .send(body as any);

    it('still requires a session', async () => {
      await http()
        .post('/v1/social/comments/AAPL')
        .send({ content: 'hi' })
        .expect(401);
      expect(social.postComment).not.toHaveBeenCalled();
    });

    it('posts a comment and a reply', async () => {
      await post({ content: 'Great stock!' }).expect(201);
      expect(social.postComment).toHaveBeenLastCalledWith(
        'user-1',
        'AAPL',
        'Great stock!',
        undefined,
      );

      await post({ content: 'I agree!', parent_id: '42' }).expect(201);
      expect(social.postComment).toHaveBeenLastCalledWith(
        'user-1',
        'AAPL',
        'I agree!',
        '42',
      );

      // A JSON number id and an explicit null are tolerated.
      await post({ content: 'I agree!', parent_id: 42 }).expect(201);
      expect(social.postComment).toHaveBeenLastCalledWith(
        'user-1',
        'AAPL',
        'I agree!',
        '42',
      );
      await post({ content: 'Top level', parent_id: null }).expect(201);
      expect(social.postComment).toHaveBeenLastCalledWith(
        'user-1',
        'AAPL',
        'Top level',
        undefined,
      );
    });

    it(`accepts ${MAX_COMMENT_LENGTH} characters and rejects one more`, async () => {
      await post({ content: 'x'.repeat(MAX_COMMENT_LENGTH) }).expect(201);
      await post({ content: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }).expect(400);
      expect(social.postComment).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['missing content', {}],
      ['empty content', { content: '' }],
      ['whitespace-only content', { content: '  \n ' }],
      ['content that is an array', { content: ['a', 'b'] }],
      ['content that is an object', { content: { text: 'hi' } }],
      ['content that is a number', { content: 42 }],
      ['a non-numeric parent_id', { content: 'hi', parent_id: 'abc' }],
      [
        'a parent_id that is a UUID',
        { content: 'hi', parent_id: '3f9a1c2e-0000-4000-8000-000000000001' },
      ],
      ['an unknown property', { content: 'hi', moderation_status: 'ok' }],
      ['an attempt to set the author', { content: 'hi', user_id: 'admin-1' }],
    ])('rejects %s with 400', async (_l, body) => {
      await post(body).expect(400);
      expect(social.postComment).not.toHaveBeenCalled();
    });
  });

  describe('ids in the path', () => {
    it('POST /v1/social/comments/:commentId/like answers a non-numeric id with 400', async () => {
      await http()
        .post('/v1/social/comments/abc/like')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`)
        .expect(400);
      expect(social.toggleLike).not.toHaveBeenCalled();

      await http()
        .post('/v1/social/comments/7/like')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`)
        .expect(201);
      expect(social.toggleLike).toHaveBeenCalledWith('user-1', '7');
    });

    it('DELETE /v1/social/comments/:id stays admin-only and validates the id', async () => {
      await http()
        .delete('/v1/social/comments/7')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`)
        .expect(403);

      await http()
        .delete('/v1/social/comments/abc')
        .set('Authorization', `Bearer ${tokenFor('admin-1')}`)
        .expect(400);
      expect(social.deleteComment).not.toHaveBeenCalled();

      await http()
        .delete('/v1/social/comments/7')
        .set('Authorization', `Bearer ${tokenFor('admin-1')}`)
        .expect(200);
      expect(social.deleteComment).toHaveBeenCalledWith('7');
    });
  });
});
