import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { Comment } from './entities/comment.entity';
import { CommentLike } from './entities/comment-like.entity';
import { WatchlistItem } from '../watchlist/entities/watchlist-item.entity';
import { TickerEntity } from '../tickers/entities/ticker.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebPushModule } from '../web-push/web-push.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comment,
      CommentLike,
      WatchlistItem,
      TickerEntity,
    ]),
    NotificationsModule,
    WebPushModule,
    UsersModule,
  ],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
