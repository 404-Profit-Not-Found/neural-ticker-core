import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
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
  constructor(private readonly usersService: UsersService) {}

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

  @Post('userlist')
  @ApiOperation({ summary: 'Add email to userlist' })
  async addToUserlist(@Body() body: { email: string; addedBy?: string }) {
    if (!body.email) throw new UnauthorizedException('Email required');
    return this.usersService.allowEmail(body.email, body.addedBy || 'admin');
  }

  @Delete('userlist/:email')
  @ApiOperation({ summary: 'Revoke access for an email' })
  async revokeAccess(@Param('email') email: string) {
    if (email === 'branislavlang@gmail.com') {
      throw new UnauthorizedException('Cannot revoke super admin access');
    }
    return this.usersService.revokeEmail(email);
  }
}
