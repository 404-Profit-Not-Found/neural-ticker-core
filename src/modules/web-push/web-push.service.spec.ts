import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { WebPushService } from './web-push.service';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';
import { UsersService } from '../users/users.service';

// Mock web-push module
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

import * as webpush from 'web-push';

describe('WebPushService', () => {
  let service: WebPushService;

  // subscribe() is an atomic upsert built via the query builder:
  //   createQueryBuilder().insert().into().values().orUpdate().execute()
  const mockInsertQb = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };

  const mockSubRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => mockInsertQb),
  };

  const mockUsersService = {
    getNotificationPreferences: jest.fn().mockResolvedValue({
      push_enabled: true,
      email_enabled: false,
    }),
  };

  const buildModule = async (config: Record<string, string>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebPushService,
        {
          provide: getRepositoryToken(PushSubscriptionEntity),
          useValue: mockSubRepo,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, defaultValue?: string) =>
                config[key] ?? defaultValue,
            ),
          },
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();
    return module.get<WebPushService>(WebPushService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should configure VAPID when keys are present', async () => {
      service = await buildModule({
        VAPID_PUBLIC_KEY: 'pub-key',
        VAPID_PRIVATE_KEY: 'priv-key',
        VAPID_EMAIL: 'mailto:test@test.com',
      });
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@test.com',
        'pub-key',
        'priv-key',
      );
    });

    it('should not configure VAPID when keys are missing', async () => {
      service = await buildModule({});
      expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should use default VAPID email when not provided', async () => {
      service = await buildModule({
        VAPID_PUBLIC_KEY: 'pub-key',
        VAPID_PRIVATE_KEY: 'priv-key',
      });
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@neuralticker.com',
        'pub-key',
        'priv-key',
      );
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      service = await buildModule({
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
      });
    });

    it('upserts and returns the stored subscription when none exists', async () => {
      const saved = {
        id: '1',
        user_id: 'user1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      };
      mockSubRepo.findOne.mockResolvedValue(saved);

      const result = await service.subscribe(
        'user1',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          keys: { p256dh: 'p256', auth: 'auth' },
        },
        'Mozilla/5.0',
      );

      expect(mockInsertQb.values).toHaveBeenCalledWith({
        user_id: 'user1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        p256dh: 'p256',
        auth: 'auth',
        user_agent: 'Mozilla/5.0',
      });
      expect(mockInsertQb.orUpdate).toHaveBeenCalled();
      expect(mockInsertQb.execute).toHaveBeenCalled();
      expect(mockSubRepo.findOne).toHaveBeenCalledWith({
        where: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' },
      });
      expect(result).toEqual(saved);
    });

    it('rejects a subscription with a non-push-service endpoint (SSRF guard)', async () => {
      await expect(
        service.subscribe(
          'user1',
          {
            endpoint: 'https://attacker.example.com/internal',
            keys: { p256dh: 'p256', auth: 'auth' },
          },
          'Mozilla/5.0',
        ),
      ).rejects.toThrow('Unrecognized push service host');
      expect(mockSubRepo.create).not.toHaveBeenCalled();
    });

    it('upserts an existing endpoint to the new user and keys', async () => {
      const upserted = {
        id: '1',
        user_id: 'user1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        p256dh: 'new-p256',
        auth: 'new-auth',
        user_agent: 'NewBrowser',
      };
      mockSubRepo.findOne.mockResolvedValue(upserted);

      const result = await service.subscribe(
        'user1',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          keys: { p256dh: 'new-p256', auth: 'new-auth' },
        },
        'NewBrowser',
      );

      expect(mockSubRepo.create).not.toHaveBeenCalled();
      expect(mockInsertQb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user1',
          p256dh: 'new-p256',
          auth: 'new-auth',
          user_agent: 'NewBrowser',
        }),
      );
      // Conflict on the unique endpoint re-binds user/keys/user_agent.
      expect(mockInsertQb.orUpdate).toHaveBeenCalledWith(
        ['user_id', 'p256dh', 'auth', 'user_agent'],
        ['endpoint'],
      );
      expect(result.user_id).toBe('user1');
    });

    it('passes undefined user_agent when none is provided', async () => {
      mockSubRepo.findOne.mockResolvedValue({
        id: '1',
        user_id: 'user1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      });

      await service.subscribe('user1', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: { p256dh: 'p256', auth: 'auth' },
      });

      const valuesArg = mockInsertQb.values.mock.calls[0][0];
      expect(valuesArg.user_agent).toBeUndefined();
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      service = await buildModule({
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
      });
    });

    it('should delete the subscription', async () => {
      mockSubRepo.delete.mockResolvedValue({ affected: 1 });

      await service.unsubscribe(
        'user1',
        'https://fcm.googleapis.com/fcm/send/abc123',
      );

      expect(mockSubRepo.delete).toHaveBeenCalledWith({
        user_id: 'user1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      });
    });
  });

  describe('sendToUser', () => {
    beforeEach(async () => {
      service = await buildModule({
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
      });
    });

    it('should skip sending when no subscriptions found', async () => {
      mockSubRepo.find.mockResolvedValue([]);

      await service.sendToUser('user1', { title: 'Test', body: 'Message' });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send push notification to all user subscriptions', async () => {
      const subs = [
        {
          id: '1',
          user_id: 'user1',
          endpoint: 'https://push1.example.com',
          p256dh: 'p1',
          auth: 'a1',
        },
        {
          id: '2',
          user_id: 'user1',
          endpoint: 'https://push2.example.com',
          p256dh: 'p2',
          auth: 'a2',
        },
      ];
      mockSubRepo.find.mockResolvedValue(subs);
      (webpush.sendNotification as jest.Mock).mockResolvedValue({});

      await service.sendToUser('user1', { title: 'Test', body: 'Message' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push1.example.com',
          keys: { p256dh: 'p1', auth: 'a1' },
        },
        JSON.stringify({ title: 'Test', body: 'Message' }),
      );
    });

    it('should remove expired subscriptions on 410 error', async () => {
      const subs = [
        {
          id: '1',
          user_id: 'user1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p1',
          auth: 'a1',
        },
      ];
      mockSubRepo.find.mockResolvedValue(subs);
      const err = Object.assign(new Error('Gone'), { statusCode: 410 });
      (webpush.sendNotification as jest.Mock).mockRejectedValue(err);
      mockSubRepo.delete.mockResolvedValue({ affected: 1 });

      await service.sendToUser('user1', { title: 'Test', body: 'Expired' });

      expect(mockSubRepo.delete).toHaveBeenCalledWith({ id: '1' });
    });

    it('should remove expired subscriptions on 404 error', async () => {
      const subs = [
        {
          id: '2',
          user_id: 'user1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p1',
          auth: 'a1',
        },
      ];
      mockSubRepo.find.mockResolvedValue(subs);
      const err = Object.assign(new Error('Not Found'), { statusCode: 404 });
      (webpush.sendNotification as jest.Mock).mockRejectedValue(err);
      mockSubRepo.delete.mockResolvedValue({ affected: 1 });

      await service.sendToUser('user1', { title: 'Test', body: 'Missing' });

      expect(mockSubRepo.delete).toHaveBeenCalledWith({ id: '2' });
    });

    it('should not send when push_enabled is false in user preferences', async () => {
      mockUsersService.getNotificationPreferences.mockResolvedValueOnce({
        push_enabled: false,
        email_enabled: false,
      });
      mockSubRepo.find.mockResolvedValue([
        {
          id: '1',
          user_id: 'user1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p1',
          auth: 'a1',
        },
      ]);

      await service.sendToUser('user1', { title: 'Test', body: 'Disabled' });

      expect(mockSubRepo.find).not.toHaveBeenCalled();
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should not send when VAPID is not configured', async () => {
      const unconfigured = await buildModule({});
      mockSubRepo.find.mockResolvedValue([
        {
          id: '1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p',
          auth: 'a',
        },
      ]);

      await unconfigured.sendToUser('user1', {
        title: 'Test',
        body: 'Message',
      });

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('getPublicKey', () => {
    it('should return the VAPID public key', async () => {
      service = await buildModule({ VAPID_PUBLIC_KEY: 'my-pub-key' });

      const key = service.getPublicKey();

      expect(key).toBe('my-pub-key');
    });

    it('should return empty string when not configured', async () => {
      service = await buildModule({});

      const key = service.getPublicKey();

      expect(key).toBe('');
    });
  });
});
