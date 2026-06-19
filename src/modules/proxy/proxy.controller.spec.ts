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

    it('should reject a non-finnhub domain with BadRequestException', async () => {
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      // Disallowed-host errors are now preserved as 400 (re-thrown) rather than
      // masked as a 404 image-not-found response.
      await expect(
        controller.proxyImage('https://evil.com/image.png', res as any),
      ).rejects.toThrow(BadRequestException);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block malicious domains ending with finnhub.io', async () => {
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await expect(
        controller.proxyImage('https://evilfinnhub.io/image.png', res as any),
      ).rejects.toThrow(BadRequestException);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should proxy image from finnhub.io', async () => {
      const mockStream = { pipe: jest.fn(), on: jest.fn() };
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

      // Upstream/transport failures now surface as 502 (bad gateway).
      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.send).toHaveBeenCalledWith('Image not found or inaccessible');
    });
  });
});
