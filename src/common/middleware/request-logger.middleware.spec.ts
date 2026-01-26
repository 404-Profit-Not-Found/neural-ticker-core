import { RequestLoggerMiddleware } from './request-logger.middleware';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';

describe('RequestLoggerMiddleware', () => {
  let middleware: RequestLoggerMiddleware;
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new RequestLoggerMiddleware();
    // Spy on the Logger instance prototype since the middleware creates a new Logger('HTTP')
    // Alternatively, we could spy on the private logger property if we cast to any, 
    // but spying on Logger.prototype.log is safer for this pattern.
    // However, since the middleware instantiates a logger as a property: `private readonly logger = new Logger('HTTP');`
    // We should mock Logger.prototype.log to capture the call.
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should log request details on response finish', () => {
    const req = {
      ip: '127.0.0.1',
      method: 'GET',
      originalUrl: '/api/test',
      get: jest.fn().mockImplementation((header: string) => {
        if (header === 'user-agent') return 'TestAgent';
        return '';
      }),
    } as unknown as Request;

    const res = {
      statusCode: 200,
      get: jest.fn().mockReturnValue('100'),
      on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'finish') {
          cb();
        }
      }),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      'GET /api/test 200 100 - TestAgent 127.0.0.1',
    );
  });
});
