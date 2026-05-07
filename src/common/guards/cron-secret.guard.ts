import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class CronSecretGuard implements CanActivate {
  private readonly logger = new Logger(CronSecretGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const secret = req.headers['x-cron-secret'];

    if (!secret || secret !== process.env.CRON_SECRET) {
      this.logger.warn(
        `Unauthorized cron attempt to ${req.method} ${req.originalUrl ?? req.url}`,
      );
      throw new UnauthorizedException('Invalid Cron Secret');
    }

    return true;
  }
}
