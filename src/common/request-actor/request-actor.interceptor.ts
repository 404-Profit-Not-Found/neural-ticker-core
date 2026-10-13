import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestActor, runWithActor } from './request-actor';

/**
 * Makes the authenticated user of a request available to everything the
 * handler calls — see request-actor.ts. Registered globally (APP_INTERCEPTOR
 * in TickersModule). Interceptors run after the guards, so `req.user` is
 * whatever JwtAuthGuard / OptionalJwtAuthGuard / McpSoftAuthGuard resolved;
 * a request without a user runs with a null actor.
 *
 * It only identifies: it never rejects a request and changes no response.
 */
@Injectable()
export class RequestActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const user = context.switchToHttp().getRequest()?.user;
    const actor: RequestActor | null = user?.id
      ? { userId: String(user.id), role: String(user.role ?? '') }
      : null;

    // next.handle() must be CALLED inside the store: Nest binds the handler to
    // the async context that is current at that moment.
    return new Observable((subscriber) =>
      runWithActor(actor, () => next.handle().subscribe(subscriber)),
    );
  }
}
