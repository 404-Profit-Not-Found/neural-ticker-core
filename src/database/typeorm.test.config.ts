import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const testTypeOrmConfig: TypeOrmModuleOptions = {
  type: 'sqlite',
  database: ':memory:',
  autoLoadEntities: true,
  synchronize: true,
};
