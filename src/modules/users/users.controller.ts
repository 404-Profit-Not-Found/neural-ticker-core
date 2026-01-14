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
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthLogFilterDto } from '../auth/dto/auth-log-filter.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Roles('admin')
  @ApiOperation({ summary: 'List all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @Get()
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @Roles('admin')
  @ApiOperation({ summary: 'View Auth Audit Logs (Admin only)' })
  @ApiResponse({ status: 200, description: 'Auth logs' })
  @Get('logins')
  async getAuthLogs(@Query() filter: AuthLogFilterDto) {
    return this.authService.getAuthLogs(filter);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Update User Role (Admin only)' })
  @ApiBody({ schema: { example: { role: 'admin' } } })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @Put(':id/role')
  async updateUserRole(@Param('id') id: string, @Body('role') role: string) {
    if (!['user', 'admin'].includes(role)) {
      throw new UnauthorizedException('Invalid role. Must be user or admin.');
    }
    return this.usersService.updateRole(id, role);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Approve User (Waitlist -> Active)' })
  @ApiResponse({ status: 200, description: 'User approved' })
  @Post(':id/approve')
  async approveUser(@Param('id') id: string) {
    return this.usersService.approveUser(id);
  }

  @ApiOperation({
    summary: 'Update User Preferences (API Keys)',
    description: `
**User Preferences**:
- Store your personal API keys here to use them during Research and Scoring.
- **Security Check**: Keys are stored in the database. Ensure this endpoint is called over HTTPS.
- **Keys Supported**:
    - \`gemini_api_key\`: Your Google Gemini API Key. Used for 'Deep' research if provided.
      `,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        gemini_api_key: {
          type: 'string',
          description: 'Your Google Gemini API Key',
          example: 'AIzaSy...',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  @Post('me/preferences')
  async updatePreferences(
    @Request() req: any,
    @Body() body: Record<string, any>,
  ) {
    // req.user is populated by JwtAuthGuard
    return this.usersService.updatePreferences(req.user.id, body);
  }
  @ApiOperation({ summary: 'Get User Profile (including credits)' })
  @ApiResponse({ status: 200, description: 'User profile with credit balance' })
  @Get('me')
  async getProfile(@Request() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @ApiOperation({ summary: 'Update Profile (Nickname, Theme, View Mode)' })
  @ApiBody({
    schema: {
      example: {
        nickname: 'SuperTrader',
        view_mode: 'KISS',
        theme: 'g10',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @Patch('me')
  async updateProfile(
    @Request() req: any,
    @Body() body: { nickname?: string; view_mode?: string; theme?: string },
  ) {
    return this.usersService.updateProfile(req.user.id, body);
  }
}
