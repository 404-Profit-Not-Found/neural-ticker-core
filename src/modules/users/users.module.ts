import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { NicknameGeneratorService } from './nickname-generator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AllowedUser]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController, AdminController],
  providers: [UsersService, NicknameGeneratorService],
  exports: [UsersService],
})
export class UsersModule {}
