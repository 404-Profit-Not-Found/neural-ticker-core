import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class CronSecretGuard implements CanActivate {
  private readonly logger = new Logger(CronSecretGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['x-cron-secret'];
    const provided = Array.isArray(header) ? header[0] : header;
    const expected = process.env.CRON_SECRET;

    if (!expected || !provided || !this.safeEqual(provided, expected)) {
      this.logger.warn(
        `Unauthorized cron attempt to ${req.method} ${req.originalUrl ?? req.url}`,
      );
      throw new UnauthorizedException('Invalid Cron Secret');
    }

    return true;
  }

  /** Length-checked constant-time comparison to avoid a timing side-channel. */
  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}
