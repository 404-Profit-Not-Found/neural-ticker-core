import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';
import { UsersService } from '../users/users.service';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly isConfigured: boolean;

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly subRepo: Repository<PushSubscriptionEntity>,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    const vapidPublic = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivate = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidEmail = this.configService.get<string>(
      'VAPID_EMAIL',
      'mailto:admin@neuralticker.com',
    );

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
      this.isConfigured = true;
      this.logger.log('Web Push configured with VAPID keys');
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'VAPID keys not configured. Web push notifications will be disabled.',
      );
    }
  }

  /**
   * Register or update a push subscription for a user.
   */
  async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<PushSubscriptionEntity> {
    // Upsert by endpoint to prevent duplicates
    const existing = await this.subRepo.findOne({
      where: { endpoint: subscription.endpoint },
    });

    if (existing) {
      existing.user_id = userId;
      existing.p256dh = subscription.keys.p256dh;
      existing.auth = subscription.keys.auth;
      existing.user_agent = userAgent || existing.user_agent;
      return this.subRepo.save(existing);
    }

    return this.subRepo.save(
      this.subRepo.create({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
      }),
    );
  }

  /**
   * Remove a push subscription.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subRepo.delete({ user_id: userId, endpoint });
  }

  /**
   * Send a push notification to all subscriptions for a user.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.isConfigured) return;

    // Check user's notification preferences
    const prefs = await this.usersService.getNotificationPreferences(userId);
    if (!prefs.push_enabled) {
      this.logger.debug(`Push disabled for user ${userId}, skipping`);
      return;
    }

    const subscriptions = await this.subRepo.find({
      where: { user_id: userId },
    });

    if (subscriptions.length === 0) return;

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err: any) {
          // 404/410 = subscription expired or unsubscribed — clean up
          if (err.statusCode === 404 || err.statusCode === 410) {
            await this.subRepo.delete({ id: sub.id });
            this.logger.log(
              `Removed expired push subscription ${sub.id} for user ${userId}`,
            );
          }
          throw err;
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (sent > 0 || failed > 0) {
      this.logger.debug(
        `Push to user ${userId}: ${sent} sent, ${failed} failed`,
      );
    }
  }

  /**
   * Get the VAPID public key for frontend subscription.
   */
  getPublicKey(): string {
    return this.configService.get<string>('VAPID_PUBLIC_KEY', '');
  }
}
