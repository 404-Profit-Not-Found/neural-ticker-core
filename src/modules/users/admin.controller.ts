import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UnauthorizedException,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreditService } from './credit.service'; // Added
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { User } from './entities/user.entity';
import { AllowedUser } from './entities/allowed-user.entity';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly creditService: CreditService, // Added
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'List all registered users' })
  async getUsers(): Promise<User[]> {
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
  async addToUserlist(@Body() body: { email: string; addedBy?: string }) {
    if (!body.email) throw new UnauthorizedException('Email required');
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
    return this.usersService.updateRole(id, body.role);
  }

  @Delete('waitlist/:email')
  @ApiOperation({ summary: 'Reject/Delete a waitlist user' })
  async rejectWaitlistUser(@Param('email') email: string) {
    return this.usersService.deleteWaitlistUser(email);
  }

  @Patch('users/:id/tier')
  @ApiOperation({ summary: 'Update user tier (free/pro)' })
  async updateUserTier(
    @Param('id') id: string,
    @Body() body: { tier: 'free' | 'pro' },
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
  async giftCredits(
    @Param('id') id: string,
    @Body() body: { amount: number; reason?: string },
  ) {
    return this.creditService.addCredits(
      id,
      body.amount,
      (body.reason as any) || 'admin_gift',
      { gifted_by: 'admin' },
    );
  }
}
