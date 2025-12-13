import { Test, TestingModule } from '@nestjs/testing';
import { MarketDataBulkController } from './market-data-bulk.controller';
import { MarketDataService } from './market-data.service';

describe('MarketDataBulkController', () => {
  let controller: MarketDataBulkController;
  let service: MarketDataService;
  let getSnapshotsMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketDataBulkController],
      providers: [
        {
          provide: MarketDataService,
          useValue: {
            getSnapshots: jest
              .fn()
              .mockResolvedValue([{ symbol: 'AAPL', price: 150 }]),
          },
        },
      ],
    }).compile();

    controller = module.get<MarketDataBulkController>(MarketDataBulkController);
    service = module.get<MarketDataService>(MarketDataService);
    getSnapshotsMock = service.getSnapshots as jest.Mock;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call service.getSnapshots with symbols', async () => {
    const symbols = ['AAPL', 'MSFT'];
    const result = await controller.getSnapshots({ symbols });
    expect(getSnapshotsMock).toHaveBeenCalledWith(symbols);
    expect(result).toHaveLength(1);
  });

  it('should handle empty symbols', async () => {
    await controller.getSnapshots({ symbols: [] });
    expect(getSnapshotsMock).toHaveBeenCalledWith([]);
  });
});
