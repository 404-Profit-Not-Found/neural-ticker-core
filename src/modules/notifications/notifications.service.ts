import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async create(userId: string, type: string, title: string, message: string, data?: any) {
    const notification = this.notificationRepo.create({
      user_id: userId,
      type,
      title,
      message,
      data,
    });
    return this.notificationRepo.save(notification);
  }

  async findAllForUser(userId: string) {
    return this.notificationRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 20
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
    await this.notificationRepo.update({ user_id: userId, read: false }, { read: true });
  }
}
