import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ProxyController } from './proxy.controller';

describe('ProxyController', () => {
  let controller: ProxyController;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    controller = module.get<ProxyController>(ProxyController);
    httpService = module.get<HttpService>(HttpService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('proxyImage', () => {
    it('should throw BadRequestException if URL is missing', async () => {
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await expect(controller.proxyImage('', res as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return 404 for non-finnhub domain', async () => {
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.proxyImage('https://evil.com/image.png', res as any);

      // BadRequestException is caught by try-catch and returns 404
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Image not found or inaccessible');
    });

    it('should proxy image from finnhub.io', async () => {
      const mockStream = { pipe: jest.fn() };
      const mockResponse = {
        headers: { 'content-type': 'image/png' },
        data: mockStream,
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));

      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.proxyImage(
        'https://static.finnhub.io/logo/aapl.png',
        res as any,
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://static.finnhub.io/logo/aapl.png',
        expect.objectContaining({ responseType: 'stream' }),
      );
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.set).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=86400',
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('should handle upstream errors', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network Error')),
      );

      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.proxyImage(
        'https://static.finnhub.io/logo/aapl.png',
        res as any,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Image not found or inaccessible');
    });
  });
});
