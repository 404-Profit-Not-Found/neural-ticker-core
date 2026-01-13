import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { NicknameGeneratorService } from './nickname-generator.service';
import { CreditService } from './credit.service';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AllowedUser, CreditTransaction]),
    forwardRef(() => AuthModule),
    forwardRef(() => WatchlistModule),
    forwardRef(() => PortfolioModule),
    forwardRef(() => ResearchModule),
  ],
  controllers: [UsersController, AdminController],
  providers: [UsersService, NicknameGeneratorService, CreditService],
  exports: [UsersService, CreditService],
})
export class UsersModule {}
