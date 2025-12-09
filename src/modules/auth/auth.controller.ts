import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';

import { Public } from './public.decorator';
import { GoogleAuthExceptionFilter } from './filters/google-auth-exception.filter';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@Public()
@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Login with Google',
    description: 'Redirects to Google OAuth2 consent screen.',
  })
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Passport redirects automatically
  }

  @ApiOperation({
    summary: 'Google Callback',
    description: 'Handles Google Redirect, creates user, returns JWT.',
  })
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleAuthExceptionFilter)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    // req.user contains the user from GoogleStrategy.validate()
    const result = await this.authService.login(req.user as any);

    // Set HttpOnly cookie for session persistence
    res.cookie('authentication', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true in prod
      sameSite: 'lax', // basic CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    const frontendUrl = this.configService.get<string>('frontendUrl');
    // Redirect to frontend with the token
    return res.redirect(
      `${frontendUrl}/oauth-callback?token=${result.access_token}`,
    );
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: Request) {
    return req.user;
  }

  @ApiOperation({
    summary: 'Login with Firebase',
    description: 'Exchange Firebase ID Token for App JWT.',
  })
  @ApiBody({ schema: { example: { token: 'firebase_id_token' } } })
  @Post('firebase')
  async firebaseLogin(@Body() body: { token: string }) {
    if (!body.token) throw new UnauthorizedException('Token required');
    const user = await this.authService.loginWithFirebase(body.token);
    return this.authService.login(user);
  }

  @ApiOperation({
    summary: 'Dev Login (Test Token)',
    description: 'Get a JWT token for a dev user without OAuth flow.',
  })
  @ApiBody({ schema: { example: { email: 'dev@test.com' } } })
  @Post('dev/token')
  async devLogin(@Body() body: { email: string }) {
    if (!body.email) throw new UnauthorizedException('Email required');
    return this.authService.localDevLogin(body.email);
  }
}
