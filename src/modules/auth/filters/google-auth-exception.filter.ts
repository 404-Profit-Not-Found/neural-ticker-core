import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleAuthExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.UNAUTHORIZED;

    this.logger.error(
      `Google Auth Failed: ${exception instanceof Error ? exception.message : String(exception)}`,
    );

    // If it's the specific "TokenError" from passport-oauth2
    if (
      exception instanceof Error &&
      (exception.message === 'TokenError' ||
        exception.message === 'Bad Request' ||
        (exception as any).code === 'invalid_grant')
    ) {
      return response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        timestamp: new Date().toISOString(),
        path: request.url,
        message:
          'Google Login Failed. Session may have expired. Please try again.',
        error: exception.message,
      });
    }

    // Fallback for other errors (re-throw if strictly needed, or handle generically)
    // For now, fail safely with 401 for any auth callback error to prevent 500 crashes
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Authentication Failed',
      error: exception instanceof Error ? exception.message : 'Unknown Error',
    });
  }
}
