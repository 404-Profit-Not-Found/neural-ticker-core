import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';
import { WebPushService } from './web-push.service';
import { WebPushController } from './web-push.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscriptionEntity])],
  controllers: [WebPushController],
  providers: [WebPushService],
  exports: [WebPushService],
})
export class WebPushModule {}
