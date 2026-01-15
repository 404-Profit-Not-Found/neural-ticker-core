import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PublicThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    // Track by IP address
    return req.ips.length ? req.ips[0] : req.ip;
  }

  protected errorMessage = 'Rate limit exceeded for public view';
}
