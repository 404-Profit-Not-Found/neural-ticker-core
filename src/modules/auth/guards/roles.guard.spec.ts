import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as ExecutionContext;

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true if no roles required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockContext({ id: '1', role: 'user' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true if user has required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = createMockContext({ id: '1', role: 'admin' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true if user has one of multiple required roles', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['admin', 'moderator']);
      const context = createMockContext({ id: '1', role: 'moderator' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return false if user does not have required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = createMockContext({ id: '1', role: 'user' });

      expect(guard.canActivate(context)).toBe(false);
    });

    it('should return false if no user in request', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = createMockContext(undefined);

      expect(guard.canActivate(context)).toBe(false);
    });

    it('should return false if user has no role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = createMockContext({ id: '1' });

      expect(guard.canActivate(context)).toBe(false);
    });
  });
});
