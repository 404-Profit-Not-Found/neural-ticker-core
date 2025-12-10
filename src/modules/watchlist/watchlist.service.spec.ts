import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { Watchlist } from './entities/watchlist.entity';
import { WatchlistItem } from './entities/watchlist-item.entity';
import { TickersService } from '../tickers/tickers.service';

describe('WatchlistService', () => {
  let service: WatchlistService;

  const mockWatchlistRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softRemove: jest.fn(),
  };

  const mockItemRepo = {
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockTickersService = {
    awaitEnsureTicker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
        { provide: getRepositoryToken(WatchlistItem), useValue: mockItemRepo },
        { provide: TickersService, useValue: mockTickersService },
      ],
    }).compile();

    service = module.get<WatchlistService>(WatchlistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWatchlist', () => {
    it('should create and return a watchlist', async () => {
      const userId = 'user-1';
      const name = 'My List';
      const mockList = { id: '1', user_id: userId, name };

      mockWatchlistRepo.create.mockReturnValue(mockList);
      mockWatchlistRepo.save.mockResolvedValue(mockList);

      const result = await service.createWatchlist(userId, name);

      expect(mockWatchlistRepo.create).toHaveBeenCalledWith({
        user_id: userId,
        name,
      });
      expect(result).toEqual(mockList);
    });
  });

  describe('getUserWatchlists', () => {
    it('should return user watchlists', async () => {
      const userId = 'user-1';
      const mockLists = [{ id: '1', name: 'List A' }];

      mockWatchlistRepo.find.mockResolvedValue(mockLists);

      const result = await service.getUserWatchlists(userId);

      expect(mockWatchlistRepo.find).toHaveBeenCalledWith({
        where: { user_id: userId },
        relations: ['items', 'items.ticker'],
        order: { created_at: 'ASC' },
      });
      expect(result).toEqual(mockLists);
    });
  });

  describe('addTickerToWatchlist', () => {
    it('should add ticker to watchlist', async () => {
      const userId = 'user-1';
      const listId = '1';
      const symbol = 'AAPL';
      const mockList = { id: listId, user_id: userId };
      const mockTicker = { id: '100', symbol };
      const mockItem = { id: '10', watchlist_id: listId, ticker_id: '100' };

      mockWatchlistRepo.findOne.mockResolvedValue(mockList);
      mockTickersService.awaitEnsureTicker.mockResolvedValue(mockTicker);
      mockItemRepo.create.mockReturnValue(mockItem);
      mockItemRepo.save.mockResolvedValue(mockItem);

      const result = await service.addTickerToWatchlist(userId, listId, symbol);

      expect(mockWatchlistRepo.findOne).toHaveBeenCalled();
      expect(mockTickersService.awaitEnsureTicker).toHaveBeenCalledWith(symbol);
      expect(mockItemRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockItem);
    });

    it('should throw if watchlist not found', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);
      await expect(
        service.addTickerToWatchlist('user-1', '999', 'AAPL'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItemFromWatchlist', () => {
    it('should remove items', async () => {
      const userId = 'user-1';
      const listId = '1';
      const tickerId = '100';
      const mockList = { id: listId, user_id: userId };

      mockWatchlistRepo.findOne.mockResolvedValue(mockList);
      mockItemRepo.delete.mockResolvedValue({ affected: 1 });

      await service.removeItemFromWatchlist(userId, listId, tickerId);

      expect(mockItemRepo.delete).toHaveBeenCalledWith({
        watchlist_id: listId,
        ticker_id: tickerId,
      });
    });
  });

  describe('removeHighLevelItem', () => {
    it('should verify ownership and remove', async () => {
      const userId = 'user-1';
      const itemId = '10';
      const mockItem = { id: itemId, watchlist: { user_id: userId } };

      mockItemRepo.findOne.mockResolvedValue(mockItem);
      mockItemRepo.remove.mockResolvedValue(mockItem);

      await service.removeHighLevelItem(userId, itemId);

      expect(mockItemRepo.remove).toHaveBeenCalledWith(mockItem);
    });

    it('should throw if item not found or not owned', async () => {
      mockItemRepo.findOne.mockResolvedValue(null);
      await expect(service.removeHighLevelItem('u', 'i')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteWatchlist', () => {
    it('should delete watchlist and its items', async () => {
      const userId = 'user-1';
      const watchlistId = 'list-1';
      const mockList = { id: watchlistId, user_id: userId };

      mockWatchlistRepo.findOne.mockResolvedValue(mockList);
      mockItemRepo.delete.mockResolvedValue({ affected: 1 });
      mockWatchlistRepo.softRemove.mockResolvedValue(mockList);

      await service.deleteWatchlist(userId, watchlistId);

      expect(mockItemRepo.delete).toHaveBeenCalledWith({
        watchlist_id: watchlistId,
      });
      expect(mockWatchlistRepo.softRemove).toHaveBeenCalledWith(mockList);
    });

    it('should throw if watchlist not found', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteWatchlist('user-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
