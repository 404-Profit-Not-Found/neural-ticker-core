import { Test, TestingModule } from '@nestjs/testing';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';

describe('WatchlistController', () => {
  let controller: WatchlistController;
  let service: WatchlistService;

  const mockService = {
    getUserWatchlists: jest.fn(),
    createWatchlist: jest.fn(),
    addTickerToWatchlist: jest.fn(),
    removeItemFromWatchlist: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchlistController],
      providers: [{ provide: WatchlistService, useValue: mockService }],
    }).compile();

    controller = module.get<WatchlistController>(WatchlistController);
    service = module.get<WatchlistService>(WatchlistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyWatchlists', () => {
    it('should call service with user id', async () => {
      const req = { user: { id: 'user-1', uid: 'user-1' } };
      await controller.getMyWatchlists(req);
      expect(service.getUserWatchlists).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createWatchlist', () => {
    it('should call service', async () => {
      const req = { user: { id: 'user-1', uid: 'user-1' } };
      await controller.createWatchlist(req, 'My List');
      expect(service.createWatchlist).toHaveBeenCalledWith('user-1', 'My List');
    });
  });

  describe('addItem', () => {
    it('should call service', async () => {
      const req = { user: { id: 'user-1', uid: 'user-1' } };
      await controller.addItem(req, 'list-1', 'AAPL');
      expect(service.addTickerToWatchlist).toHaveBeenCalledWith(
        'user-1',
        'list-1',
        'AAPL',
      );
    });
  });

  describe('removeItem', () => {
    it('should call service', async () => {
      const req = { user: { id: 'user-1', uid: 'user-1' } };
      await controller.removeItem(req, 'list-1', 'ticker-1');
      expect(service.removeItemFromWatchlist).toHaveBeenCalledWith(
        'user-1',
        'list-1',
        'ticker-1',
      );
    });
  });
});
