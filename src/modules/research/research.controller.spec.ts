import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { MarketDataService } from '../market-data/market-data.service';
import { CreditService } from '../users/credit.service';
import { CreditGuard } from './guards/credit.guard';

describe('ResearchController', () => {
  let controller: ResearchController;

  const mockResearchService = {
    createManualNote: jest.fn(),
    createResearchTicket: jest.fn(),
    processTicket: jest.fn(),
    findAll: jest.fn(),
    getResearchNote: jest.fn(),
    deleteResearchNote: jest.fn(),
    updateTitle: jest.fn(),
    streamResearch: jest.fn(),
    reprocessFinancials: jest.fn(),
    contribute: jest.fn(),
  };
  const mockMarketDataService = {
    dedupeAnalystRatings: jest.fn(),
    syncCompanyNews: jest.fn(),
  };
  const mockCreditService = {
    getModelCost: jest.fn(),
    deductCredits: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResearchController],
      providers: [
        {
          provide: ResearchService,
          useValue: mockResearchService,
        },
        {
          provide: MarketDataService,
          useValue: mockMarketDataService,
        },
        {
          provide: CreditService,
          useValue: mockCreditService,
        },
      ],
    })
      .overrideGuard(CreditGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ResearchController>(ResearchController);
    jest.clearAllMocks();
  });

  describe('syncResearch', () => {
    it('should reprocess, dedupe and sync news', async () => {
      mockResearchService.reprocessFinancials.mockResolvedValue(undefined);
      mockMarketDataService.dedupeAnalystRatings.mockResolvedValue({
        removed: 2,
      });
      mockMarketDataService.syncCompanyNews.mockResolvedValue(undefined);

      const result = await controller.syncResearch('AAPL');

      expect(mockResearchService.reprocessFinancials).toHaveBeenCalledWith(
        'AAPL',
      );
      expect(mockMarketDataService.dedupeAnalystRatings).toHaveBeenCalledWith(
        'AAPL',
      );
      expect(mockMarketDataService.syncCompanyNews).toHaveBeenCalledWith(
        'AAPL',
      );
      expect(result).toEqual({ message: 'Sync completed', deduped: 2 });
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('upload', () => {
    it('should create manual note', async () => {
      const note = { id: '1', tickers: ['AAPL'], title: 'Test' };
      mockResearchService.createManualNote.mockResolvedValue(note);
      const req = { user: { id: 'user1' } };

      const result = await controller.upload(req, {
        tickers: ['AAPL'],
        title: 'Test',
        content: '# Content',
      });

      expect(result).toEqual(note);
      expect(mockResearchService.createManualNote).toHaveBeenCalledWith(
        'user1',
        ['AAPL'],
        'Test',
        '# Content',
        undefined,
      );
    });
  });

  describe('contribute', () => {
    it('should contribute research', async () => {
      const note = { id: '1', tickers: ['AAPL'], title: '# Content' };
      mockResearchService.contribute.mockResolvedValue(note);
      const req = { user: { id: 'user1' } };

      const result = await controller.contribute(req, {
        tickers: ['AAPL'],
        content: '# Content',
      });

      expect(result).toEqual(note);
      expect(mockResearchService.contribute).toHaveBeenCalledWith(
        'user1',
        ['AAPL'],
        '# Content',
      );
    });
  });

  describe('ask', () => {
    it('should create research ticket and return id', async () => {
      const ticket = { id: 'ticket-1', status: 'pending' };
      mockResearchService.createResearchTicket.mockResolvedValue(ticket);
      mockResearchService.processTicket.mockResolvedValue(undefined);
      mockCreditService.getModelCost.mockReturnValue(5);
      mockCreditService.deductCredits.mockResolvedValue(undefined); // Success

      const req = { user: { id: 'user1', role: 'user' } };

      const result = await controller.ask(req, {
        tickers: ['AAPL'],
        question: 'Should I buy?',
        provider: 'gemini',
        quality: 'medium',
      });

      expect(result).toEqual({ id: 'ticket-1', status: 'pending' });
      expect(mockResearchService.createResearchTicket).toHaveBeenCalledWith(
        'user1',
        ['AAPL'],
        'Should I buy?',
        'gemini',
        'medium',
      );
      expect(mockCreditService.deductCredits).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should return paginated list', async () => {
      const list = { data: [{ id: '1' }], total: 1, page: 1, limit: 10 };
      mockResearchService.findAll.mockResolvedValue(list);
      const req = { user: { id: 'user1' } };

      const result = await controller.list(req, 'all', 1, 10);

      expect(result).toEqual(list);
      expect(mockResearchService.findAll).toHaveBeenCalledWith(
        'user1',
        'all',
        1,
        10,
        undefined,
        undefined,
      );
    });
  });

  describe('getResearch', () => {
    it('should return research note', async () => {
      const note = { id: '1', tickers: ['AAPL'], status: 'completed' };
      mockResearchService.getResearchNote.mockResolvedValue(note);

      const result = await controller.getResearch('1');

      expect(result).toEqual(note);
    });

    it('should throw NotFoundException if not found', async () => {
      mockResearchService.getResearchNote.mockResolvedValue(null);

      await expect(controller.getResearch('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete research note', async () => {
      const note = { id: '1' };
      mockResearchService.getResearchNote.mockResolvedValue(note);
      mockResearchService.deleteResearchNote.mockResolvedValue(undefined);
      const req = { user: { id: 'user1' } };

      const result = await controller.delete(req, '1');

      expect(result).toEqual({ message: 'Deleted successfully' });
      expect(mockResearchService.deleteResearchNote).toHaveBeenCalledWith(
        '1',
        'user1',
      );
    });

    it('should throw NotFoundException if not found', async () => {
      const req = { user: { id: 'user1' } };
      mockResearchService.deleteResearchNote.mockRejectedValue(
        new NotFoundException('Research note not found'),
      );

      await expect(controller.delete(req, '999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateTitle', () => {
    it('should update title', async () => {
      const note = { id: '1', title: 'New Title' };
      mockResearchService.updateTitle.mockResolvedValue(note);
      const req = { user: { id: 'user1' } };

      const result = await controller.updateTitle(req, '1', 'New Title');

      expect(result).toEqual(note);
      expect(mockResearchService.updateTitle).toHaveBeenCalledWith(
        '1',
        'user1',
        'New Title',
      );
    });

    it('should throw NotFoundException if not found', async () => {
      mockResearchService.updateTitle.mockRejectedValue(
        new Error('Research note not found'),
      );
      const req = { user: { id: 'user1' } };

      await expect(controller.updateTitle(req, '999', 'Title')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for unauthorized access', async () => {
      mockResearchService.updateTitle.mockRejectedValue(
        new Error('Unauthorized access'),
      );
      const req = { user: { id: 'user1' } };

      await expect(controller.updateTitle(req, '1', 'Title')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
