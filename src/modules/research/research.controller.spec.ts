import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ResearchController,
  AskResearchDto,
  StreamResearchDto,
} from './research.controller';
import { ResearchService } from './research.service';
import { MarketDataService } from '../market-data/market-data.service';
import { CreditService } from '../users/credit.service';
import { TickersService } from '../tickers/tickers.service';
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
    refreshMarketData: jest.fn(),
  };
  const mockCreditService = {
    getModelCost: jest.fn(),
    getResearchCost: jest.fn(),
    deductCredits: jest.fn(),
  };
  const mockTickersService = {
    findOneBySymbol: jest.fn(),
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
        {
          provide: TickersService,
          useValue: mockTickersService,
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
      mockCreditService.getResearchCost.mockReturnValue(5);
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
      // Cost derives from provider + quality (not a non-existent `model` field).
      expect(mockCreditService.getResearchCost).toHaveBeenCalledWith(
        'gemini',
        'medium',
      );
      expect(mockCreditService.deductCredits).toHaveBeenCalled();
      expect(mockResearchService.processTicket).toHaveBeenCalledWith(
        'ticket-1',
      );
    });

    it('fails closed: rolls back the ticket and does not process when deduction fails', async () => {
      const ticket = { id: 'ticket-1', status: 'pending' };
      mockResearchService.createResearchTicket.mockResolvedValue(ticket);
      mockResearchService.deleteResearchNote.mockResolvedValue(undefined);
      mockCreditService.getResearchCost.mockReturnValue(5);
      mockCreditService.deductCredits.mockRejectedValue(
        new Error('Insufficient credits'),
      );

      const req = { user: { id: 'user1', role: 'user' } };

      await expect(
        controller.ask(req, {
          tickers: ['AAPL'],
          question: 'Should I buy?',
          provider: 'ensemble',
          quality: 'deep',
        }),
      ).rejects.toThrow('Insufficient credits');

      // Ticket rolled back, expensive LLM work never dispatched.
      expect(mockResearchService.deleteResearchNote).toHaveBeenCalledWith(
        'ticket-1',
        'user1',
      );
      expect(mockResearchService.processTicket).not.toHaveBeenCalled();
    });

    it('skips deduction for admins but still processes', async () => {
      const ticket = { id: 'ticket-2', status: 'pending' };
      mockResearchService.createResearchTicket.mockResolvedValue(ticket);
      mockResearchService.processTicket.mockResolvedValue(undefined);
      mockCreditService.getResearchCost.mockReturnValue(5);

      const req = { user: { id: 'admin1', role: 'admin' } };

      const result = await controller.ask(req, {
        tickers: ['AAPL'],
        question: 'Should I buy?',
        provider: 'ensemble',
        quality: 'deep',
      });

      expect(result).toEqual({ id: 'ticket-2', status: 'pending' });
      expect(mockCreditService.deductCredits).not.toHaveBeenCalled();
      expect(mockResearchService.processTicket).toHaveBeenCalledWith(
        'ticket-2',
      );
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
    it('should return research note for owner', async () => {
      const note = { id: '1', user_id: 'user1', status: 'completed' };
      mockResearchService.getResearchNote.mockResolvedValue(note);
      const req = { user: { id: 'user1', role: 'user' } };

      const result = await controller.getResearch(req, '1');

      expect(result).toEqual(note);
    });

    it('should return research note for admin', async () => {
      const note = { id: '1', user_id: 'user1', status: 'completed' };
      mockResearchService.getResearchNote.mockResolvedValue(note);
      const req = { user: { id: 'admin1', role: 'admin' } };

      const result = await controller.getResearch(req, '1');

      expect(result).toEqual(note);
    });

    it('should return research note for any authenticated user (shared access)', async () => {
      const note = { id: '1', user_id: 'user1', status: 'completed' };
      mockResearchService.getResearchNote.mockResolvedValue(note);
      // User 2 (not owner) requesting
      const req = { user: { id: 'user2', role: 'user' } };

      const result = await controller.getResearch(req, '1');

      expect(result).toEqual(note);
    });

    it('should throw NotFoundException if not found', async () => {
      mockResearchService.getResearchNote.mockResolvedValue(null);
      const req = { user: { id: 'user1' } };

      await expect(controller.getResearch(req, '999')).rejects.toThrow(
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

  describe('startResearch (stream)', () => {
    it('404s for a ticker not in the universe and never streams', async () => {
      mockTickersService.findOneBySymbol.mockResolvedValue(null);
      const req = { user: { id: 'user1', role: 'user' } };

      await expect(
        controller.startResearch(req, { ticker: 'BOGUS' } as StreamResearchDto),
      ).rejects.toThrow(NotFoundException);

      expect(mockResearchService.streamResearch).not.toHaveBeenCalled();
      expect(mockCreditService.deductCredits).not.toHaveBeenCalled();
    });

    it('uppercases the symbol, charges a non-admin, then streams', async () => {
      mockTickersService.findOneBySymbol.mockResolvedValue({ symbol: 'AAPL' });
      mockCreditService.getResearchCost.mockReturnValue(5);
      mockCreditService.deductCredits.mockResolvedValue(undefined);
      mockResearchService.streamResearch.mockReturnValue(
        of({ type: 'status', data: 'x' }),
      );
      const req = { user: { id: 'user1', role: 'user' } };

      const obs = await controller.startResearch(req, {
        ticker: 'aapl',
        questions: 'moat?',
      } as StreamResearchDto);

      expect(mockTickersService.findOneBySymbol).toHaveBeenCalledWith('AAPL');
      expect(mockCreditService.deductCredits).toHaveBeenCalledWith(
        'user1',
        5,
        'research_spend',
        expect.objectContaining({ ticker: 'AAPL', pipeline: 'stream' }),
      );
      expect(mockResearchService.streamResearch).toHaveBeenCalledWith(
        'AAPL',
        'moat?',
      );
      // The SSE mapper wraps each event as { data, type }.
      const event = await new Promise((resolve) => obs.subscribe(resolve));
      expect(event).toEqual({
        data: { type: 'status', data: 'x' },
        type: 'status',
      });
    });

    it('exempts admins from the credit charge but still streams', async () => {
      mockTickersService.findOneBySymbol.mockResolvedValue({ symbol: 'AAPL' });
      mockResearchService.streamResearch.mockReturnValue(
        of({ type: 'status', data: 'x' }),
      );
      const req = { user: { id: 'admin1', role: 'admin' } };

      await controller.startResearch(req, {
        ticker: 'AAPL',
      } as StreamResearchDto);

      expect(mockCreditService.deductCredits).not.toHaveBeenCalled();
      expect(mockResearchService.streamResearch).toHaveBeenCalledWith(
        'AAPL',
        undefined,
      );
    });

    it('fails closed: a deduction failure aborts before streaming', async () => {
      mockTickersService.findOneBySymbol.mockResolvedValue({ symbol: 'AAPL' });
      mockCreditService.getResearchCost.mockReturnValue(5);
      mockCreditService.deductCredits.mockRejectedValue(
        new Error('Insufficient credits'),
      );
      const req = { user: { id: 'user1', role: 'user' } };

      await expect(
        controller.startResearch(req, { ticker: 'AAPL' } as StreamResearchDto),
      ).rejects.toThrow('Insufficient credits');

      expect(mockResearchService.streamResearch).not.toHaveBeenCalled();
    });
  });

  // class-validator does not run inside Test.createTestingModule (the global
  // ValidationPipe is not wired), so exercise the DTO decorators directly.
  describe('AskResearchDto validation', () => {
    const make = (overrides: Record<string, unknown>) =>
      plainToInstance(AskResearchDto, {
        tickers: ['AAPL'],
        question: 'Analyze',
        ...overrides,
      });

    it('accepts a valid payload', async () => {
      const errors = await validate(make({ tickers: ['AAPL', 'BRK.B'] }));
      expect(errors.length).toBe(0);
    });

    it('rejects an empty tickers array', async () => {
      const errors = await validate(make({ tickers: [] }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects more than 10 tickers', async () => {
      const errors = await validate(make({ tickers: Array(11).fill('AAPL') }));
      expect(errors.some((e) => e.property === 'tickers')).toBe(true);
    });

    it('rejects a non-symbol ticker', async () => {
      const errors = await validate(make({ tickers: ['NOT A TICKER!'] }));
      expect(errors.some((e) => e.property === 'tickers')).toBe(true);
    });

    it('rejects a question longer than 2000 chars', async () => {
      const errors = await validate(make({ question: 'x'.repeat(2001) }));
      expect(errors.some((e) => e.property === 'question')).toBe(true);
    });
  });

  describe('StreamResearchDto validation', () => {
    it('accepts a valid payload (optional questions omitted)', async () => {
      const errors = await validate(
        plainToInstance(StreamResearchDto, { ticker: 'AAPL' }),
      );
      expect(errors.length).toBe(0);
    });

    it('rejects a non-symbol ticker', async () => {
      const errors = await validate(
        plainToInstance(StreamResearchDto, { ticker: 'bad symbol!!' }),
      );
      expect(errors.some((e) => e.property === 'ticker')).toBe(true);
    });

    it('rejects questions longer than 2000 chars', async () => {
      const errors = await validate(
        plainToInstance(StreamResearchDto, {
          ticker: 'AAPL',
          questions: 'x'.repeat(2001),
        }),
      );
      expect(errors.some((e) => e.property === 'questions')).toBe(true);
    });
  });
});
