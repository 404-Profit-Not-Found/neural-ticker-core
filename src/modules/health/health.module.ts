import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// HealthController injects the default TypeORM DataSource, which the root
// TypeOrmModule.forRootAsync in AppModule provides globally (TypeORM's core
// module is @Global). No DB module of its own — that previously opened a second,
// duplicate default connection. The shared connection is the single source of truth.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
