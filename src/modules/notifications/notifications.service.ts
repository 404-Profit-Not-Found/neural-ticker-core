import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

@Injectable()
export class NotificationsService {
  private readonly events$ = new Subject<Notification>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /**
   * Stream notifications for a specific user.
   */
  getEventStream(userId: string): Observable<Notification> {
    return this.events$.asObservable().pipe(
      filter((n) => n.user_id === userId), // Only stream to the correct user
    );
  }

  async create(
    userId: string,
    type: string,
    title: string,
    message: string,
    data?: any,
  ) {
    const notification = this.notificationRepo.create({
      user_id: userId,
      type,
      title,
      message,
      data,
    });
    const saved = await this.notificationRepo.save(notification);

    // Emit event for real-time listeners
    this.events$.next(saved);

    return saved;
  }

  async findAllForUser(userId: string) {
    return this.notificationRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 20,
    });
  }

  async getUnreadCount(userId: string) {
    return this.notificationRepo.count({
      where: { user_id: userId, read: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    await this.notificationRepo.update({ id, user_id: userId }, { read: true });
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepo.update(
      { user_id: userId, read: false },
      { read: true },
    );
  }
}
