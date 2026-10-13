import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';
import { currentActor, runWithActor } from './request-actor';
import { RequestActorInterceptor } from './request-actor.interceptor';

describe('request actor (who a call chain acts for)', () => {
  it('is null outside any request', () => {
    expect(currentActor()).toBeNull();
  });

  it('is visible to everything the function awaits, and gone afterwards', async () => {
    const actor = { userId: 'user-1', role: 'user' };
    const deep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return currentActor();
    };

    await expect(runWithActor(actor, () => deep())).resolves.toEqual(actor);
    expect(currentActor()).toBeNull();
  });

  it('concurrent chains never see each other’s actor', async () => {
    const seen = await Promise.all(
      ['a', 'b', 'c'].map((id, i) =>
        runWithActor({ userId: id, role: 'user' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 6 - i * 2));
          return currentActor()?.userId;
        }),
      ),
    );
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('an explicit null actor hides an outer one (system work inside a request)', () => {
    runWithActor({ userId: 'user-1', role: 'user' }, () => {
      expect(runWithActor(null, () => currentActor())).toBeNull();
      expect(currentActor()?.userId).toBe('user-1');
    });
  });
});

describe('RequestActorInterceptor', () => {
  const interceptor = new RequestActorInterceptor();
  const httpContext = (user?: unknown): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  /** A handler that reports who it runs for. */
  const handler = (): CallHandler => ({
    handle: () => {
      // Nest binds the handler when handle() is called — read at that moment
      // and again inside the stream.
      const atCall = currentActor();
      return of({ atCall, inStream: currentActor() });
    },
  });

  it('runs the handler on behalf of the authenticated user', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(
        httpContext({ id: 'user-1', role: 'admin', email: 'x@example.test' }),
        handler(),
      ),
    );
    // Only the id and the role travel — not the user row.
    expect(result).toEqual({
      atCall: { userId: 'user-1', role: 'admin' },
      inStream: { userId: 'user-1', role: 'admin' },
    });
    expect(currentActor()).toBeNull();
  });

  it.each([
    ['no user on the request (a public route, a cron endpoint)', undefined],
    ['a user object without an id', { role: 'user' }],
  ])('%s → no actor', async (_label, user) => {
    const result: any = await firstValueFrom(
      interceptor.intercept(httpContext(user), handler()),
    );
    expect(result.atCall).toBeNull();
  });

  it('passes the response and errors through untouched', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(httpContext({ id: 'u', role: 'user' }), {
          handle: () => of(1, 2, 3),
        }),
      ),
    ).resolves.toBe(3);

    const failure = new Error('handler failed');
    await expect(
      firstValueFrom(
        interceptor.intercept(httpContext({ id: 'u', role: 'user' }), {
          handle: () => throwError(() => failure),
        }),
      ),
    ).rejects.toBe(failure);
  });

  it('leaves non-HTTP contexts alone', async () => {
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of('x') })),
    ).resolves.toBe('x');
  });
});
