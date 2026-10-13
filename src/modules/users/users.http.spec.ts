import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { UsersService } from './users.service';
import { CreditService } from './credit.service';
import { MAX_CREDIT_GIFT } from './dto/admin.dto';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WatchlistService } from '../watchlist/watchlist.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { ResearchService } from '../research/research.service';

/**
 * The users + admin controllers behind a real HTTP server with the SAME global
 * ValidationPipe as main.ts, so bodies go through the DTOs exactly as in
 * production. Services are mocked (no database); the guards let an admin in.
 */
describe('Users / Admin controllers (HTTP: body validation)', () => {
  let app: INestApplication;

  const usersService = {
    updateProfile: jest.fn(),
    updateRole: jest.fn(),
    updateTier: jest.fn(),
    allowEmail: jest.fn(),
  };
  const creditService = { addCredits: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController, AdminController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: CreditService, useValue: creditService },
        { provide: AuthService, useValue: {} },
        { provide: WatchlistService, useValue: {} },
        { provide: PortfolioService, useValue: {} },
        { provide: ResearchService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            id: 'admin-1',
            role: 'admin',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    // Mirrors src/main.ts.
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
    usersService.updateProfile.mockImplementation((id, body) => ({
      id,
      ...body,
    }));
    usersService.updateRole.mockResolvedValue({ id: 'u1' });
    usersService.updateTier.mockResolvedValue({ id: 'u1' });
    usersService.allowEmail.mockResolvedValue({ email: 'x' });
    creditService.addCredits.mockResolvedValue({ id: 'u1', preferences: {} });
  });

  const http = () => request(app.getHttpServer());

  describe('PATCH /v1/users/me', () => {
    it('accepts exactly what the profile page sends (nickname + avatar_url + theme)', async () => {
      await http()
        .patch('/v1/users/me')
        .send({ nickname: 'SuperTrader', avatar_url: '', theme: 'g100' })
        .expect(200);

      expect(usersService.updateProfile).toHaveBeenCalledWith(
        'admin-1',
        expect.objectContaining({ nickname: 'SuperTrader', theme: 'g100' }),
      );
    });

    it.each([
      ['the onboarding flag', { has_onboarded: true }],
      ['a theme alone', { theme: 'dark' }],
      ['a view mode', { view_mode: 'KISS' }],
      [
        'an empty nickname (account without one saving its theme)',
        { nickname: '', theme: 'light' },
      ],
      // Not judged here: UsersService applies the nickname rules on CHANGE.
      [
        'a legacy nickname resent unchanged',
        { nickname: 'Old School Name!! (2019)', theme: 'light' },
      ],
      ['null fields', { nickname: null, avatar_url: null }],
      ['an empty body', {}],
    ])('accepts %s', async (_l, body) => {
      await http().patch('/v1/users/me').send(body).expect(200);
      expect(usersService.updateProfile).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a role', { role: 'admin' }],
      ['a tier', { tier: 'whale' }],
      ['a credit balance', { credits_balance: 999999 }],
      ['an email', { email: 'attacker@example.com' }],
      ['preferences', { preferences: { gemini_api_key: 'x' } }],
      ['a non-string nickname', { nickname: { $ne: null } }],
      ['an array nickname', { nickname: ['a', 'b'] }],
      ['an absurdly long nickname', { nickname: 'x'.repeat(101) }],
      ['an unknown view mode', { view_mode: 'GOD' }],
      [
        'a theme that is not an identifier',
        { theme: '<script>alert(1)</script>' },
      ],
      ['a non-boolean onboarding flag', { has_onboarded: 'yes' }],
      [
        'an over-long avatar url',
        { avatar_url: 'https://x/' + 'a'.repeat(2048) },
      ],
    ])('rejects %s with 400 and updates nothing', async (_l, body) => {
      await http().patch('/v1/users/me').send(body).expect(400);
      expect(usersService.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('PUT /v1/users/:id/role', () => {
    it('answers an invalid role with 400, not 401', async () => {
      await http().put('/v1/users/u1/role').send({ role: 'god' }).expect(400);
      await http().put('/v1/users/u1/role').send({}).expect(400);
      expect(usersService.updateRole).not.toHaveBeenCalled();

      await http().put('/v1/users/u1/role').send({ role: 'user' }).expect(200);
    });
  });

  describe('PATCH /v1/admin/users/:id/tier', () => {
    it.each(['free', 'pro', 'whale'])('accepts %s', async (tier) => {
      await http().patch('/v1/admin/users/u1/tier').send({ tier }).expect(200);
      expect(usersService.updateTier).toHaveBeenCalledWith('u1', tier);
    });

    it.each([
      ['an unknown tier', { tier: 'gold' }],
      ['the legacy "admin" tier', { tier: 'admin' }],
      ['a missing tier', {}],
      ['a non-string tier', { tier: 1 }],
      ['an extra property', { tier: 'pro', role: 'admin' }],
    ])('rejects %s with 400', async (_l, body) => {
      await http().patch('/v1/admin/users/u1/tier').send(body).expect(400);
      expect(usersService.updateTier).not.toHaveBeenCalled();
    });
  });

  describe('POST /v1/admin/users/:id/credits', () => {
    it('accepts what the admin console sends and books it as an admin gift', async () => {
      await http()
        .post('/v1/admin/users/u1/credits')
        .send({ amount: 5, reason: 'Admin Gift' })
        .expect(201);

      expect(creditService.addCredits).toHaveBeenCalledWith(
        'u1',
        5,
        'admin_gift',
        { gifted_by: 'admin', note: 'Admin Gift' },
      );
    });

    it.each([
      ['zero', { amount: 0 }],
      ['a negative amount', { amount: -5 }],
      ['a fraction', { amount: 1.5 }],
      ['a numeric string', { amount: '5' }],
      ['an amount over the cap', { amount: MAX_CREDIT_GIFT + 1 }],
      ['Infinity (JSON null)', { amount: Infinity }],
      ['a missing amount', { reason: 'x' }],
      ['an over-long reason', { amount: 5, reason: 'x'.repeat(201) }],
      ['a non-string reason', { amount: 5, reason: { a: 1 } }],
      ['an extra property', { amount: 5, user_id: 'someone-else' }],
    ])('rejects %s with 400 and grants nothing', async (_l, body) => {
      await http().post('/v1/admin/users/u1/credits').send(body).expect(400);
      expect(creditService.addCredits).not.toHaveBeenCalled();
    });

    it('accepts the cap itself', async () => {
      await http()
        .post('/v1/admin/users/u1/credits')
        .send({ amount: MAX_CREDIT_GIFT })
        .expect(201);
    });
  });

  describe('POST /v1/admin/userlist', () => {
    it('accepts an email (as the admin console sends it)', async () => {
      await http()
        .post('/v1/admin/userlist')
        .send({ email: 'new.user@example.com' })
        .expect(201);
      expect(usersService.allowEmail).toHaveBeenCalledWith(
        'new.user@example.com',
        'admin',
      );
    });

    it.each([
      ['a missing email', {}],
      ['an empty email', { email: '' }],
      ['something that is not an email', { email: 'not-an-email' }],
      ['an object', { email: { $ne: '' } }],
    ])('answers %s with 400, not 401', async (_l, body) => {
      await http().post('/v1/admin/userlist').send(body).expect(400);
      expect(usersService.allowEmail).not.toHaveBeenCalled();
    });
  });
});
