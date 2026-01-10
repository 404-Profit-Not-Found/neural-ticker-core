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
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
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
  @ApiResponse({ status: 302, description: 'Redirects to Google Auth' })
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Passport redirects automatically
  }

  @ApiOperation({
    summary: 'Google Callback',
    description: 'Handles Google Redirect, creates user, returns JWT.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Frontend with Token' })
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleAuthExceptionFilter)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    // req.user contains the user from GoogleStrategy.validate()
    const user = req.user as any;

    const frontendUrl = this.configService.get<string>('frontendUrl') || '';

    // Handle "Just Joined" Waitlist
    if (user.isNewWaitlist) {
      return res.redirect(`${frontendUrl}/access-denied?error=waitlist_joined`);
    }

    // Handle "Already Pending" Waitlist
    if (user.role === 'waitlist') {
      return res.redirect(
        `${frontendUrl}/access-denied?error=waitlist_pending`,
      );
    }

    const result = await this.authService.login(user);

    // Set HttpOnly cookie for session persistence
    res.cookie('authentication', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true in prod
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    // Redirect to frontend (cookie handles auth)
    return res.redirect(`${frontendUrl}/oauth-callback`);
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile object' })
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
  @ApiResponse({ status: 200, description: 'App JWT token and user info' })
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
  @ApiResponse({ status: 200, description: 'App JWT token and user info' })
  @Post('dev/token')
  async devLogin(
    @Body() body: { email: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.email) throw new UnauthorizedException('Email required');
    const result = await this.authService.localDevLogin(body.email);

    // Set HttpOnly cookie for session persistence (matching googleAuthRedirect)
    res.cookie('authentication', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    return result;
  }
  @ApiOperation({
    summary: 'Logout',
    description: 'Clears authentication cookie.',
  })
  @ApiResponse({ status: 200, description: 'Cookie cleared' })
  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('authentication', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res.status(200).send({ success: true });
  }
}
