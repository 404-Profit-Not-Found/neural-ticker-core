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
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';

import { Public } from './public.decorator';
import { GoogleAuthExceptionFilter } from './filters/google-auth-exception.filter';

@Public()
@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Login with Google',
    description: 'Redirects to Google OAuth2 consent screen.',
  })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport redirects automatically
  }

  @ApiOperation({
    summary: 'Google Callback',
    description: 'Handles Google Redirect, creates user, returns JWT.',
  })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @UseFilters(GoogleAuthExceptionFilter)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    // req.user contains the user from GoogleStrategy.validate()
    const result = await this.authService.login(req.user as any); // Cast to expected user type if needed

    // In a real app, you might redirect to frontend with token in query params,
    // or return JSON if this was a popup flow.
    // For now, let's return JSON to the browser/client.
    // Ideally: res.redirect(`http://localhost:3000?token=${result.access_token}`);

    return res.json({
      message: 'Login successful',
      ...result,
    });
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
}
