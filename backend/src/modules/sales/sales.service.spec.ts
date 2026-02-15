import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesService } from './sales.service';
import { SalesOrder, PaymentMethod, PaymentStatus } from './entities/sales-order.entity';
import { ImportFile } from './entities/import-file.entity';
import { Machine } from '../machines/entities/machine.entity';
import { Collection } from '../collections/entities/collection.entity';
import { TelegramService } from '../../telegram/telegram.service';

describe('SalesService', () => {
  let service: SalesService;
  let salesOrderRepo: jest.Mocked<Repository<SalesOrder>>;
  let machineRepo: jest.Mocked<Repository<Machine>>;
  let collectionRepo: jest.Mocked<Repository<Collection>>;

  const createMockQueryBuilder = (result: any = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result),
    getManyAndCount: jest.fn().mockResolvedValue([result, result.length]),
    getRawMany: jest.fn().mockResolvedValue(result),
    getCount: jest.fn().mockResolvedValue(result.length),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ identifiers: [] }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
            manager: {
              query: jest.fn().mockResolvedValue([]),
            },
          },
        },
        {
          provide: getRepositoryToken(Machine),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Collection),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
          },
        },
        {
          provide: getRepositoryToken(ImportFile),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            getArchiveChannelId: jest.fn().mockReturnValue(''),
            sendDocument: jest.fn().mockResolvedValue(null),
            getFileUrl: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    salesOrderRepo = module.get(getRepositoryToken(SalesOrder));
    machineRepo = module.get(getRepositoryToken(Machine));
    collectionRepo = module.get(getRepositoryToken(Collection));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrders', () => {
    it('should return paginated orders with total count', async () => {
      const mockOrders: Partial<SalesOrder>[] = [
        {
          id: '1',
          orderNumber: 'ORD-001',
          productName: 'Coffee',
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.PAID,
          machineCode: 'M001',
          price: 5000,
          orderDate: new Date('2025-01-15'),
        },
      ];

      const qb = createMockQueryBuilder(mockOrders);
      qb.getManyAndCount.mockResolvedValue([mockOrders, 1]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getOrders({ page: 1, limit: 50 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });

    it('should apply machineCode filter', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.getOrders({ machineCode: 'M001', page: 1, limit: 50 });

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should apply date range filters', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.getOrders({
        from: '2025-01-01',
        to: '2025-01-31',
        page: 1,
        limit: 50,
      });

      // Should be called for from AND to date filters
      expect(qb.andWhere).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSummary', () => {
    it('should return summary with machine breakdowns and totals', async () => {
      const mockRaw = [
        {
          machineCode: 'M001',
          machineName: 'Machine 1',
          cashTotal: '50000',
          cashCount: '10',
          cardTotal: '30000',
          cardCount: '5',
          refundTotal: '1000',
          refundCount: '1',
        },
      ];

      const qb = createMockQueryBuilder();
      qb.getRawMany.mockResolvedValue(mockRaw);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getSummary({});

      expect(result).toHaveProperty('machines');
      expect(result).toHaveProperty('totals');
      expect(result.machines).toHaveLength(1);
      expect(result.totals.cashTotal).toBe(50000);
    });
  });

  describe('getReconciliation', () => {
    it('should return reconciliation items with summary', async () => {
      const mockRows = [
        {
          collectionId: 'c1',
          machineCode: 'M001',
          machineName: 'Machine 1',
          collectedAmount: '100000',
          collectedAt: new Date('2025-01-15T10:00:00Z'),
          prevCollectedAt: new Date('2025-01-14T10:00:00Z'),
          periodStart: new Date('2025-01-14T10:00:00Z'),
          periodEnd: new Date('2025-01-15T10:00:00Z'),
          cashSalesTotal: '95000',
          cashOrdersCount: '20',
        },
      ];

      salesOrderRepo.manager.query = jest.fn().mockResolvedValue(mockRows);

      const result = await service.getReconciliation({});

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('summary');
      expect(result.items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMachineCodes', () => {
    it('should return unique machine codes', async () => {
      const qb = createMockQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        { machineCode: 'M001' },
        { machineCode: 'M002' },
      ]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getMachineCodes();

      expect(result).toEqual(['M001', 'M002']);
    });
  });

  describe('getImportBatches', () => {
    it('should return import batches with counts', async () => {
      const qb = createMockQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        {
          batchId: 'batch-1',
          importedAt: '2025-01-15T10:00:00Z',
          ordersCount: '100',
        },
      ]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getImportBatches();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('batchId');
      expect(result[0]).toHaveProperty('ordersCount');
    });
  });

  describe('deleteBatch', () => {
    it('should delete orders by batch ID', async () => {
      salesOrderRepo.delete.mockResolvedValue({ affected: 50 } as any);

      const result = await service.deleteBatch('batch-123');

      expect(salesOrderRepo.delete).toHaveBeenCalledWith({ importBatchId: 'batch-123' });
      expect(result).toEqual({ deleted: 50 });
    });
  });

  describe('getDailyStats', () => {
    it('should return daily aggregated stats', async () => {
      const qb = createMockQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        {
          date: '2025-01-15',
          cashTotal: '50000',
          cashCount: '10',
          cardTotal: '30000',
          cardCount: '5',
        },
      ]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getDailyStats({});

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('cashTotal');
      expect(result[0]).toHaveProperty('cardTotal');
    });
  });

  describe('getTopMachines', () => {
    it('should return top machines by total sales', async () => {
      const qb = createMockQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        {
          machineCode: 'M001',
          machineName: 'Machine 1',
          total: '500000',
          count: '100',
        },
      ]);
      salesOrderRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getTopMachines({ limit: 10 });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('machineCode');
      expect(result[0]).toHaveProperty('total');
    });
  });
});
