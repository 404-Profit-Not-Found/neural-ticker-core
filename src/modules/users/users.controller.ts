import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
  Request,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthLogFilterDto } from '../auth/dto/auth-log-filter.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Roles('admin')
  @ApiOperation({ summary: 'List all users (Admin only)' })
  @Get()
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @Roles('admin')
  @ApiOperation({ summary: 'View Auth Audit Logs (Admin only)' })
  @Get('logins')
  async getAuthLogs(@Query() filter: AuthLogFilterDto) {
    return this.authService.getAuthLogs(filter);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Update User Role (Admin only)' })
  @ApiBody({ schema: { example: { role: 'admin' } } })
  @Put(':id/role')
  async updateUserRole(@Param('id') id: string, @Body('role') role: string) {
    if (!['user', 'admin'].includes(role)) {
      throw new UnauthorizedException('Invalid role. Must be user or admin.');
    }
    return this.usersService.updateRole(id, role);
  }

  @ApiOperation({ summary: 'Update User Preferences (API Keys)' })
  @ApiBody({ schema: { example: { gemini_api_key: '...' } } })
  @Post('me/preferences')
  async updatePreferences(@Request() req: any, @Body() body: Record<string, any>) {
    // req.user is populated by JwtAuthGuard
    return this.usersService.updatePreferences(req.user.id, body);
  }
}
