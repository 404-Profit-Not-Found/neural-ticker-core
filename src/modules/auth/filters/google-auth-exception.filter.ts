import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Catch()
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleAuthExceptionFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Log the error
    const errorMessage =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`Google Auth Failed: ${errorMessage}`);

    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:5173';

    // Check for "Invite Only" specific error
    if (errorMessage.includes('not on the invite list')) {
      return response.redirect(
        `${frontendUrl}/access-denied?error=invite_only`,
      );
    }

    // Generic fallback for other auth errors
    return response.redirect(`${frontendUrl}/access-denied?error=auth_failed`);
  }
}
