import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceAlert } from './entities/price-alert.entity';
import { PriceAlertsService } from './price-alerts.service';
import { PriceAlertsController } from './price-alerts.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { TickersModule } from '../tickers/tickers.module';
import { WebPushModule } from '../web-push/web-push.module';
import { QuotaModule } from '../../common/quota/quota.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceAlert]),
    NotificationsModule,
    forwardRef(() => TickersModule),
    WebPushModule,
    QuotaModule,
  ],
  controllers: [PriceAlertsController],
  providers: [PriceAlertsService],
  exports: [PriceAlertsService],
})
export class PriceAlertsModule {}
