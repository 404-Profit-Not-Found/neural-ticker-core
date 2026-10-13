import { join } from 'path';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { RawSqlResultsToEntityTransformer } from 'typeorm/query-builder/transformer/RawSqlResultsToEntityTransformer';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { UsersService } from './users.service';
import { ResearchNote } from '../research/entities/research-note.entity';
import { ResearchService } from '../research/research.service';
import { Comment } from '../social/entities/comment.entity';
import { CommentLike } from '../social/entities/comment-like.entity';
import { SocialService } from '../social/social.service';
import { TickerRequestEntity } from '../ticker-requests/entities/ticker-request.entity';
import { TickerRequestsService } from '../ticker-requests/ticker-requests.service';

/**
 * The SQL the services REALLY send, without a database.
 *
 * The other specs mock the repositories, so they cannot see which columns a
 * query selects. Here the services run against real TypeORM repositories built
 * from the real entity metadata on a DataSource that is never connected; only
 * the final execution step is intercepted, and the generated SQL is inspected.
 * What this cannot show is how Postgres answers — only what it is asked.
 */
describe('SQL shape: client-facing reads never select private user columns', () => {
  const PRIVATE_USER_COLUMNS = [
    'google_id',
    'preferences',
    'credits_balance',
    'credits_reset_at',
    'last_login',
  ];
  // Also private, except in the admin-only requester summary.
  const CONTACT_COLUMNS = ['email', 'full_name'];

  let dataSource: DataSource;
  let executed: string[];

  const lastSql = () => executed[executed.length - 1];
  const expectNoColumns = (sql: string, columns: string[]) => {
    for (const column of columns) {
      expect(sql).not.toContain(`"${column}"`);
    }
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      entities: [join(__dirname, '..', '..', '**', '*.entity.ts')],
    });
    // Builds the entity metadata only — no connection is opened.
    await (dataSource as any).buildMetadatas();
  });

  beforeEach(() => {
    executed = [];
    const capture = <T>(result: T) =>
      function (this: SelectQueryBuilder<any>) {
        executed.push(this.getQuery());
        return Promise.resolve(result);
      };
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getMany')
      .mockImplementation(capture([]));
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getOne')
      .mockImplementation(capture(null));
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getManyAndCount')
      .mockImplementation(capture([[], 0] as [any[], number]));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('has the entity metadata loaded (sanity)', () => {
    expect(dataSource.getMetadata(User).tableName).toBe('users');
    // Without the fix the same harness sees the leak: selecting the relation
    // as a whole pulls every column of the author's row.
    const leaky = dataSource
      .getRepository(ResearchNote)
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.user', 'user')
      .getQuery();
    expect(leaky).toContain('"user"."email"');
    expect(leaky).toContain('"user"."preferences"');
    expect(leaky).toContain('"user"."google_id"');
  });

  it('no entity loads a User eagerly (an eager relation rides along on every find())', () => {
    const eagerToUser = dataSource.entityMetadatas.flatMap((metadata) =>
      metadata.eagerRelations
        .filter((relation) => relation.inverseEntityMetadata.target === User)
        .map((relation) => `${metadata.name}.${relation.propertyName}`),
    );

    expect(eagerToUser).toEqual([]);
  });

  describe('ResearchService', () => {
    let service: ResearchService;

    beforeEach(() => {
      const config = { get: jest.fn() };
      const usersService = { findById: jest.fn().mockResolvedValue(null) };
      service = new ResearchService(
        dataSource.getRepository(ResearchNote),
        {} as any, // llmService
        {} as any, // llmBudgetService
        usersService as any,
        config as any,
        {} as any, // notificationsService
        {} as any, // webPushService
        {} as any, // watchlistService
        {} as any, // portfolioService
        {} as any, // creditService
        {} as any, // qualityScoringService
        {} as any, // tickersService
        {} as any, // marketDataService
        {} as any, // riskRewardService
      );
    });

    const expectPublicAuthorOnly = (sql: string) => {
      expect(sql).toContain('LEFT JOIN "users" "user"');
      for (const column of ['id', 'nickname', 'avatar_url', 'tier']) {
        expect(sql).toContain(`"user"."${column}"`);
      }
      expectNoColumns(sql, [...PRIVATE_USER_COLUMNS, ...CONTACT_COLUMNS]);
      // The only "role"-like data a note may expose is its own columns.
      expect(sql).not.toContain('"user"."role"');
    };

    it('getResearchNote (GET /v1/research/:id — any authenticated user)', async () => {
      await service.getResearchNote('1');

      expectPublicAuthorOnly(lastSql());
      // The note itself is still loaded in full.
      expect(lastSql()).toContain('"note"."answer_markdown"');
    });

    it('getLatestNoteForTicker (GET /v1/tickers/:symbol/composite — PUBLIC) selects the note summary only', async () => {
      await service.getLatestNoteForTicker('AAPL');

      const sql = lastSql();
      expect(sql).not.toContain('"users"');
      // The complete SELECT list.
      const selected = [
        ...sql.slice(0, sql.indexOf(' FROM ')).matchAll(/"note"\."(\w+)" AS/g),
      ].map((match) => match[1]);
      expect(selected.sort()).toEqual([
        'created_at',
        'id',
        'models_used',
        'provider',
        'quality_score',
        'rarity',
        'status',
        'tickers',
        'title',
        'updated_at',
      ]);
      // Personal daily digests are excluded, NULL titles are not.
      expect(sql).toContain(
        '("note"."title" IS NULL OR "note"."title" NOT LIKE :excludeTitle)',
      );
    });

    it("findAll (GET /v1/research?ticker= — every user's notes for a ticker)", async () => {
      await service.findAll('viewer', 'all', 1, 10, 'AAPL');

      expectPublicAuthorOnly(lastSql());
      // Bug (a): a NULL title must survive the digest filter.
      expect(lastSql()).toContain(
        '("note"."title" IS NULL OR "note"."title" NOT LIKE :excludeTitle)',
      );
    });

    it('findAll without a ticker ("my research")', async () => {
      await service.findAll('viewer', 'all', 1, 10);

      expectPublicAuthorOnly(lastSql());
      expect(lastSql()).not.toContain('NOT LIKE');
    });

    it('TypeORM hydrates the joined author as a partial User entity holding the public columns only', () => {
      // The row → entity step, run on a row shaped like the SELECT above
      // returns it. This is the object `withPublicUser()` then projects, and
      // being a real `User` it is also covered by `User.toJSON()`.
      const qb = (service as any).notesWithAuthor();
      const transformer = new RawSqlResultsToEntityTransformer(
        qb.expressionMap,
        dataSource.driver,
        [],
        [],
      );

      const notes = transformer.transform(
        [
          {
            note_id: '7',
            note_title: 'Deep dive',
            note_user_id: 'u1',
            user_id: 'u1',
            user_nickname: 'FunnyPanda123',
            user_avatar_url: null,
            user_tier: 'pro',
          },
          { note_id: '8', note_title: 'System note', note_user_id: null },
        ],
        qb.expressionMap.mainAlias,
      );

      expect(notes).toHaveLength(2);
      expect(notes[0].user).toBeInstanceOf(User);
      expect({ ...notes[0].user }).toEqual({
        id: 'u1',
        nickname: 'FunnyPanda123',
        avatar_url: null,
        tier: 'pro',
      });
      expect(notes[0].user_id).toBe('u1');
      // A note without an author: no user object at all.
      expect(notes[1].user ?? null).toBeNull();
    });

    it('plain note lookups do not touch the users table at all (the relation is no longer eager)', async () => {
      // updateTitle / deleteResearchNote / processTicket / the digest lookup
      // all go through noteRepo.find*(…) without relations.
      await service.updateTitle('1', 'u', 't').catch(() => undefined);
      await service.deleteResearchNote('1', 'u').catch(() => undefined);
      await service.processTicket('1');
      await service.failStuckTickets(20);
      await service.deletePersonalizedDigest('u');

      expect(executed).toHaveLength(5);
      for (const sql of executed) {
        expect(sql).toContain('FROM "research_notes"');
        expect(sql).not.toContain('"users"');
      }
    });
  });

  describe('SocialService', () => {
    let service: SocialService;
    let usersService: UsersService;

    beforeEach(() => {
      usersService = new UsersService(
        {} as any,
        dataSource.getRepository(User),
        dataSource.getRepository(AllowedUser),
        {} as any,
      );
      service = new SocialService(
        dataSource.getRepository(Comment),
        dataSource.getRepository(CommentLike),
        {} as any, // watchlistItemRepo
        {} as any, // tickerRepo
        {} as any, // notificationsService
        {} as any, // webPushService
        usersService,
        {} as any, // configService
      );
    });

    it('getComments (GET /v1/social/comments/:symbol — PUBLIC) loads comments and replies, no users', async () => {
      await service.getComments('AAPL');

      expect(executed).toHaveLength(1);
      expect(lastSql()).toContain('FROM "comments"');
      expect(lastSql()).toContain('LEFT JOIN "comments"'); // replies
      expect(lastSql()).not.toContain('"users"');
    });

    const HIDDEN = 'NOT("Comment"."moderation_status" IN (';

    it('hides taken-down comments from an anonymous visitor IN the query', async () => {
      await service.getComments('AAPL');

      const where = lastSql().split(' WHERE ')[1];
      expect(where).toContain(HIDDEN);
      expect(where).not.toContain(' OR ');
      expect(where).toContain('"Comment"."parent_id" IS NULL');
    });

    it('adds "or it is mine" for a signed-in viewer, and no filter at all for an admin', async () => {
      await service.getComments('AAPL', {
        id: '3f9a1c2e-0000-4000-8000-000000000001',
        role: 'user',
      });
      const [visible, mine] = lastSql().split(' WHERE ')[1].split(' OR ');
      expect(visible).toContain(HIDDEN);
      expect(mine).toContain('"Comment"."user_id" = :');
      expect(mine).not.toContain('moderation_status');
      // Both alternatives stay scoped to the ticker's top-level comments.
      for (const alternative of [visible, mine]) {
        expect(alternative).toContain('"Comment"."ticker_symbol" = :');
        expect(alternative).toContain('"Comment"."parent_id" IS NULL');
      }

      await service.getComments('AAPL', { id: 'admin', role: 'admin' });
      const asAdmin = lastSql().split(' WHERE ')[1];
      expect(asAdmin).not.toContain('moderation_status');
      expect(asAdmin).toContain('"Comment"."parent_id" IS NULL');
    });

    it('toggleLike / the reply-parent lookup load a comment without its author', async () => {
      await service.toggleLike('u', '1').catch(() => undefined);

      expect(lastSql()).toContain('FROM "comments"');
      expect(lastSql()).not.toContain('"users"');
    });

    it('authors and mention targets are read through the public-columns-only lookup', async () => {
      await usersService.findPublicByIds([
        '3f9a1c2e-0000-4000-8000-000000000001',
        '3f9a1c2e-0000-4000-8000-000000000002',
      ]);

      const sql = lastSql();
      expect(sql).toContain('FROM "users" "user"');
      // The complete SELECT list — nothing but the four public columns.
      const selected = [
        ...sql.slice(0, sql.indexOf(' FROM ')).matchAll(/"user"\."(\w+)" AS/g),
      ].map((match) => match[1]);
      expect(selected.sort()).toEqual(['avatar_url', 'id', 'nickname', 'tier']);
    });
  });

  describe('UsersService', () => {
    let usersService: UsersService;

    beforeEach(() => {
      jest
        .spyOn(SelectQueryBuilder.prototype, 'getCount')
        .mockImplementation(function (this: SelectQueryBuilder<any>) {
          executed.push(this.getQuery());
          return Promise.resolve(0);
        });
      usersService = new UsersService(
        {} as any,
        dataSource.getRepository(User),
        dataSource.getRepository(AllowedUser),
        {} as any,
      );
    });

    it('searchUsers (GET /v1/users/search) filters on the nickname only — the email is not in the query at all', async () => {
      await usersService.searchUsers('alice.pri');

      const sql = lastSql();
      expect(sql).not.toContain('"email"');
      expect(sql).toContain('"user"."nickname" ILIKE :q');
      const selected = [
        ...sql.slice(0, sql.indexOf(' FROM ')).matchAll(/"user"\."(\w+)" AS/g),
      ].map((match) => match[1]);
      expect(selected.sort()).toEqual(['avatar_url', 'id', 'nickname', 'tier']);
    });

    it('the nickname-taken check compares case-insensitively and excludes the caller', async () => {
      jest
        .spyOn(usersService, 'findById')
        .mockResolvedValue(
          Object.assign(new User(), { id: 'u1', nickname: 'old' }),
        );
      jest
        .spyOn(dataSource.getRepository(User), 'save')
        .mockImplementation((u: any) => Promise.resolve(u));

      await usersService.updateProfile('u1', { nickname: 'FunnyPanda123' });

      const sql = lastSql();
      expect(sql).toContain('LOWER("user"."nickname") = LOWER(:nickname)');
      expect(sql).toContain('"user"."id" != :userId');
    });
  });

  describe('TickerRequestsService', () => {
    it('getRequests (GET /v1/ticker-requests — ADMIN) selects the requester summary only', async () => {
      const service = new TickerRequestsService(
        dataSource.getRepository(TickerRequestEntity),
        {} as any,
      );

      await service.getRequests();

      const sql = lastSql();
      expect(sql).toContain('LEFT JOIN "users" "user"');
      for (const column of [
        'id',
        'nickname',
        'avatar_url',
        'tier',
        'email',
        'full_name',
      ]) {
        expect(sql).toContain(`"user"."${column}"`);
      }
      expectNoColumns(sql, PRIVATE_USER_COLUMNS);
    });
  });
});
