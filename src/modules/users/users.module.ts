import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { CreditTransaction } from './entities/credit-transaction.entity'; // Added
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { NicknameGeneratorService } from './nickname-generator.service';
import { CreditService } from './credit.service'; // Added

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AllowedUser, CreditTransaction]), // Update
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController, AdminController],
  providers: [UsersService, NicknameGeneratorService, CreditService], // Update
  exports: [UsersService, CreditService], // Update
})
export class UsersModule {}
