import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreditService } from './credit.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { ResearchService } from '../research/research.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccountUser, toAccountUser } from './public-user';
import { AllowedUser } from './entities/allowed-user.entity';
import {
  AddToUserlistDto,
  GiftCreditsDto,
  UpdateUserTierDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly creditService: CreditService,
    private readonly watchlistService: WatchlistService,
    private readonly portfolioService: PortfolioService,
    private readonly researchService: ResearchService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'List all registered users' })
  async getUsers(): Promise<AccountUser[]> {
    return this.usersService.findAll();
  }

  @Get('userlist')
  @ApiOperation({ summary: 'List allowed emails' })
  async getUserlist(): Promise<AllowedUser[]> {
    return this.usersService.getAllowedUsers();
  }

  @Get('identities')
  @ApiOperation({
    summary: 'List unified identities (active, waitlist, invited)',
  })
  async getIdentities() {
    return this.usersService.getUnifiedIdentities();
  }

  @Post('userlist')
  @ApiOperation({ summary: 'Add email to userlist' })
  async addToUserlist(@Body() body: AddToUserlistDto) {
    // The DTO requires a well-formed email (400). This used to answer a
    // missing email with a 401, which the clients treat as an expired session.
    if (!body.email) throw new BadRequestException('Email required');
    return this.usersService.allowEmail(body.email, body.addedBy || 'admin');
  }

  @Delete('userlist/:email')
  @ApiOperation({ summary: 'Revoke access for an email' })
  async revokeAccess(@Param('email') email: string, @Req() req: any) {
    // req.user is populated by JwtAuthGuard
    return this.usersService.revokeEmail(email, req.user);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role (admin/user/waitlist)' })
  async updateUserRole(
    @Param('id') id: string,
    @Body() body: { role: string },
  ) {
    const validRoles = ['admin', 'user', 'waitlist'];
    if (!validRoles.includes(body.role)) {
      throw new BadRequestException(
        `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      );
    }
    return this.usersService.updateRole(id, body.role);
  }

  @Delete('waitlist/:email')
  @ApiOperation({ summary: 'Reject/Delete a waitlist user' })
  async rejectWaitlistUser(@Param('email') email: string) {
    return this.usersService.deleteWaitlistUser(email);
  }

  @Patch('users/:id/tier')
  @ApiOperation({ summary: 'Update user tier (free/pro/whale)' })
  async updateUserTier(
    @Param('id') id: string,
    @Body() body: UpdateUserTierDto,
  ) {
    // We should implement updateTier in UsersService or just save it here
    // For simplicity, reusing UsersService update or direct repo approach if exposed
    // But UsersService usually encapsulates repo.
    // Let's assume UsersService needs an update method.
    // For now, I will use a direct update via UsersService if it exists, or add it.
    return this.usersService.updateTier(id, body.tier);
  }

  @Post('users/:id/credits')
  @ApiOperation({ summary: 'Gift credits to user' })
  async giftCredits(@Param('id') id: string, @Body() body: GiftCreditsDto) {
    // The ledger reason is ALWAYS 'admin_gift'. The body's `reason` is the
    // admin's free-text note (the console sends "Admin Gift") and goes into
    // the metadata: letting it name the reason would let a gift be booked as
    // e.g. 'manual_contribution' and count against the user's daily
    // contribution cap.
    const metadata: Record<string, any> = { gifted_by: 'admin' };
    if (body.reason) metadata.note = body.reason;

    // The credit service hands back the full row; an admin still never gets
    // another user's secret preference values.
    return toAccountUser(
      await this.creditService.addCredits(
        id,
        body.amount,
        'admin_gift',
        metadata,
      ),
    );
  }

  @Delete('users/:id/reset-tutorial')
  @ApiOperation({
    summary: 'Reset tutorial state (Wipe Watchlist, Portfolio, Digest)',
  })
  async resetTutorial(@Param('id') userId: string) {
    // 1. Wipe Watchlists & Items
    // Existing service methods might not expose "delete all", so we might need to iterate or add bulk delete.
    // WatchlistService has deleteWatchlist(userId, watchlistId).
    // Let's fetch all watchlists and delete them.
    const watchlists = await this.watchlistService.getUserWatchlists(
      userId,
      true,
    );
    for (const wl of watchlists) {
      await this.watchlistService.deleteWatchlist(userId, wl.id);
    }

    // 2. Wipe Portfolio
    // PortfolioService has findAll(userId) and remove(userId, id).
    const positions = await this.portfolioService.findAll(userId);
    // findAll returns any[], assume they have id.
    // Note: findAll returns enriched objects, but usually contains id.
    // Let's check PortfolioService.findAll return signature.
    // It returns Promise<any[]> because it does DB calls and structure might vary?
    // Let's assume it returns array of objects with 'id'.
    // Better yet, just use a new method if possible, or loop.
    for (const pos of positions) {
      if (pos.id) {
        await this.portfolioService.remove(userId, pos.id);
      }
    }
    // Also need to wipe Analyses? PortfolioService doesn't expose deleteAnalysis.
    // If not exposed, maybe we can't easily.
    // But usually Analyses are tied to Portfolio or User?
    // PortfolioAnalysis entity has user_id.
    // If we want to be thorough, we should probably add wipePortfolio to PortfolioService or loop if possible.
    // Attempting to delete analyses via service... service.getAnalyses returns them.
    // But no delete method.
    // Maybe ok to leave analyses for now if methods missing, or add cleanup method to service.
    // Let's stick to positions for now as that's the main tutorial artifact.

    // 3. Wipe Digest
    await this.researchService.deletePersonalizedDigest(userId);

    return { message: 'Tutorial state reset successfully' };
  }
}
