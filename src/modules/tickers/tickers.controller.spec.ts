import { Test, TestingModule } from '@nestjs/testing';
import { TickersController } from './tickers.controller';
import { TickersService } from './tickers.service';

describe('TickersController', () => {
  let controller: TickersController;

  const mockTickersService = {
    searchTickers: jest.fn(),
    ensureTicker: jest.fn(),
    getLogo: jest.fn(),
    getTicker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TickersController],
      providers: [
        {
          provide: TickersService,
          useValue: mockTickersService,
        },
      ],
    }).compile();

    controller = module.get<TickersController>(TickersController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAll', () => {
    it('should return all tickers when no search', async () => {
      const tickers = [{ symbol: 'AAPL' }, { symbol: 'GOOGL' }];
      mockTickersService.searchTickers.mockResolvedValue(tickers);

      const result = await controller.getAll();

      expect(result).toEqual(tickers);
      expect(mockTickersService.searchTickers).toHaveBeenCalledWith(undefined);
    });

    it('should search tickers with query', async () => {
      const tickers = [{ symbol: 'AAPL' }];
      mockTickersService.searchTickers.mockResolvedValue(tickers);

      const result = await controller.getAll('AAP');

      expect(result).toEqual(tickers);
      expect(mockTickersService.searchTickers).toHaveBeenCalledWith('AAP');
    });
  });

  describe('ensure', () => {
    it('should ensure ticker exists', async () => {
      const ticker = { symbol: 'AAPL', name: 'Apple Inc' };
      mockTickersService.ensureTicker.mockResolvedValue(ticker);

      const result = await controller.ensure('AAPL');

      expect(result).toEqual(ticker);
      expect(mockTickersService.ensureTicker).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('getLogo', () => {
    it('should return logo when found', async () => {
      const logo = { mime_type: 'image/png', image_data: Buffer.from('data') };
      mockTickersService.getLogo.mockResolvedValue(logo);

      const res = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await controller.getLogo('AAPL', res as any);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.set).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=604800',
      );
      expect(res.send).toHaveBeenCalledWith(logo.image_data);
    });

    it('should return 404 when logo not found', async () => {
      mockTickersService.getLogo.mockResolvedValue(null);

      const res = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await controller.getLogo('UNKNOWN', res as any);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Logo not found');
    });
  });

  describe('get', () => {
    it('should return ticker profile', async () => {
      const ticker = { symbol: 'AAPL', name: 'Apple Inc' };
      mockTickersService.getTicker.mockResolvedValue(ticker);

      const result = await controller.get('AAPL');

      expect(result).toEqual(ticker);
      expect(mockTickersService.getTicker).toHaveBeenCalledWith('AAPL');
    });
  });
});
