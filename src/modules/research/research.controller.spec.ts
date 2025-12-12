import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResearchController],
      providers: [
        {
          provide: ResearchService,
          useValue: mockResearchService,
        },
      ],
    }).compile();

    controller = module.get<ResearchController>(ResearchController);
    jest.clearAllMocks();
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
      );
    });
  });

  describe('ask', () => {
    it('should create research ticket and return id', async () => {
      const ticket = { id: 'ticket-1', status: 'pending' };
      mockResearchService.createResearchTicket.mockResolvedValue(ticket);
      mockResearchService.processTicket.mockResolvedValue(undefined);
      const req = { user: { id: 'user1' } };

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

      const result = await controller.delete('1');

      expect(result).toEqual({ message: 'Deleted successfully' });
      expect(mockResearchService.deleteResearchNote).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException if not found', async () => {
      mockResearchService.getResearchNote.mockResolvedValue(null);

      await expect(controller.delete('999')).rejects.toThrow(NotFoundException);
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
