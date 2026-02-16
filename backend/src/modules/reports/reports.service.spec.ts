import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ReportsService, SummaryReport, MachineReport, DateReport, OperatorReport } from './reports.service';
import { Collection, CollectionStatus } from '../collections/entities/collection.entity';
import { ReportQueryDto } from './dto/report-query.dto';

describe('ReportsService', () => {
  let service: ReportsService;
  let collectionRepository: jest.Mocked<Repository<Collection>>;
  let cacheManager: jest.Mocked<Cache>;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Collection),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    collectionRepository = module.get(getRepositoryToken(Collection));
    cacheManager = module.get(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSummary', () => {
    const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };

    const rawResult = {
      totalCollections: '10',
      totalAmount: '5000.50',
      pendingCount: '3',
      receivedCount: '5',
      cancelledCount: '2',
    };

    it('should return cached result if available', async () => {
      const cachedReport: SummaryReport = {
        period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
        totalCollections: 10,
        totalAmount: 5000.5,
        pendingCount: 3,
        receivedCount: 5,
        cancelledCount: 2,
        averageAmount: 1000.1,
      };

      cacheManager.get.mockResolvedValue(cachedReport);

      const result = await service.getSummary(query);

      expect(result).toEqual(cachedReport);
      expect(cacheManager.get).toHaveBeenCalledWith('report:summary:2024-01-01:2024-01-31');
      expect(collectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query the database and return a summary report', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue(rawResult);

      const result = await service.getSummary(query);

      expect(result.totalCollections).toBe(10);
      expect(result.totalAmount).toBe(5000.5);
      expect(result.pendingCount).toBe(3);
      expect(result.receivedCount).toBe(5);
      expect(result.cancelledCount).toBe(2);
      expect(result.averageAmount).toBe(5000.5 / 5);
      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();
      expect(collectionRepository.createQueryBuilder).toHaveBeenCalledWith('collection');
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('collection.machine', 'machine');
      expect(cacheManager.set).toHaveBeenCalledWith(
        'report:summary:2024-01-01:2024-01-31',
        result,
        60000,
      );
    });

    it('should calculate averageAmount as 0 when receivedCount is 0', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '5',
        totalAmount: '0',
        pendingCount: '3',
        receivedCount: '0',
        cancelledCount: '2',
      });

      const result = await service.getSummary(query);

      expect(result.averageAmount).toBe(0);
      expect(result.receivedCount).toBe(0);
    });

    it('should use default date range when from/to are not provided', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue(rawResult);

      const result = await service.getSummary({});

      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();
      expect(cacheManager.get).toHaveBeenCalledWith('report:summary:default:default');
    });

    it('should handle NaN values gracefully', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: null,
        totalAmount: null,
        pendingCount: null,
        receivedCount: null,
        cancelledCount: null,
      });

      const result = await service.getSummary(query);

      expect(result.totalCollections).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.pendingCount).toBe(0);
      expect(result.receivedCount).toBe(0);
      expect(result.cancelledCount).toBe(0);
      expect(result.averageAmount).toBe(0);
    });
  });

  describe('getByMachine', () => {
    const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };

    const rawResults = [
      {
        machineId: 'machine-1',
        machineCode: 'A01',
        machineName: 'Machine One',
        collectionsCount: '5',
        totalAmount: '2500.00',
      },
      {
        machineId: 'machine-2',
        machineCode: 'B02',
        machineName: 'Machine Two',
        collectionsCount: '3',
        totalAmount: '1500.00',
      },
    ];

    it('should return cached result if available', async () => {
      const cachedReport = {
        period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
        data: [],
        totals: { collectionsCount: 0, totalAmount: 0 },
      };

      cacheManager.get.mockResolvedValue(cachedReport);

      const result = await service.getByMachine(query);

      expect(result).toEqual(cachedReport);
      expect(cacheManager.get).toHaveBeenCalledWith('report:by-machine:2024-01-01:2024-01-31');
      expect(collectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query the database and return machine report', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue(rawResults);

      const result = await service.getByMachine(query);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].machine).toEqual({
        id: 'machine-1',
        code: 'A01',
        name: 'Machine One',
      });
      expect(result.data[0].collectionsCount).toBe(5);
      expect(result.data[0].totalAmount).toBe(2500);
      expect(result.data[0].averageAmount).toBe(500);

      expect(result.data[1].machine).toEqual({
        id: 'machine-2',
        code: 'B02',
        name: 'Machine Two',
      });
      expect(result.data[1].collectionsCount).toBe(3);
      expect(result.data[1].totalAmount).toBe(1500);
      expect(result.data[1].averageAmount).toBe(500);

      expect(result.totals.collectionsCount).toBe(8);
      expect(result.totals.totalAmount).toBe(4000);

      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();

      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('machine.id');
      expect(mockQueryBuilder.addGroupBy).toHaveBeenCalledWith('machine.code');
      expect(mockQueryBuilder.addGroupBy).toHaveBeenCalledWith('machine.name');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('"totalAmount"', 'DESC');

      expect(cacheManager.set).toHaveBeenCalledWith(
        'report:by-machine:2024-01-01:2024-01-31',
        result,
        60000,
      );
    });

    it('should return empty data when no results', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getByMachine(query);

      expect(result.data).toHaveLength(0);
      expect(result.totals.collectionsCount).toBe(0);
      expect(result.totals.totalAmount).toBe(0);
    });

    it('should handle zero collectionsCount for averageAmount calculation', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          machineId: 'machine-1',
          machineCode: 'A01',
          machineName: 'Machine One',
          collectionsCount: '0',
          totalAmount: '0',
        },
      ]);

      const result = await service.getByMachine(query);

      expect(result.data[0].averageAmount).toBe(0);
    });
  });

  describe('getByDate', () => {
    const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };

    const rawResults = [
      { date: '2024-01-15', collectionsCount: '4', totalAmount: '2000.00' },
      { date: '2024-01-14', collectionsCount: '2', totalAmount: '800.50' },
    ];

    it('should return cached result if available', async () => {
      const cachedReport = {
        period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
        data: [],
        totals: { collectionsCount: 0, totalAmount: 0 },
      };

      cacheManager.get.mockResolvedValue(cachedReport);

      const result = await service.getByDate(query);

      expect(result).toEqual(cachedReport);
      expect(cacheManager.get).toHaveBeenCalledWith('report:by-date:2024-01-01:2024-01-31');
      expect(collectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query the database and return date report', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue(rawResults);

      const result = await service.getByDate(query);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        date: '2024-01-15',
        collectionsCount: 4,
        totalAmount: 2000,
      });
      expect(result.data[1]).toEqual({
        date: '2024-01-14',
        collectionsCount: 2,
        totalAmount: 800.5,
      });

      expect(result.totals.collectionsCount).toBe(6);
      expect(result.totals.totalAmount).toBe(2800.5);

      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();

      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith(`DATE(collection.collectedAt AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent')`);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('date', 'DESC');

      expect(cacheManager.set).toHaveBeenCalledWith(
        'report:by-date:2024-01-01:2024-01-31',
        result,
        60000,
      );
    });

    it('should return empty data when no results', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getByDate(query);

      expect(result.data).toHaveLength(0);
      expect(result.totals.collectionsCount).toBe(0);
      expect(result.totals.totalAmount).toBe(0);
    });

    it('should use default date range when from/to are not provided', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getByDate({});

      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();
      expect(cacheManager.get).toHaveBeenCalledWith('report:by-date:default:default');
    });

    it('should handle null collectionsCount and totalAmount in date results', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: '2024-01-15',
          collectionsCount: null,
          totalAmount: null,
        },
      ]);

      const result = await service.getByDate(query);

      expect(result.data[0].collectionsCount).toBe(0);
      expect(result.data[0].totalAmount).toBe(0);
    });
  });

  describe('getByOperator', () => {
    const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };

    const rawResults = [
      {
        operatorId: 'op-1',
        operatorName: 'John Doe',
        operatorUsername: 'johndoe',
        collectionsCount: '7',
        totalAmount: '3500.00',
      },
      {
        operatorId: 'op-2',
        operatorName: 'Jane Smith',
        operatorUsername: 'janesmith',
        collectionsCount: '4',
        totalAmount: '1200.00',
      },
    ];

    it('should return cached result if available', async () => {
      const cachedReport = {
        period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
        data: [],
        totals: { collectionsCount: 0, totalAmount: 0 },
      };

      cacheManager.get.mockResolvedValue(cachedReport);

      const result = await service.getByOperator(query);

      expect(result).toEqual(cachedReport);
      expect(cacheManager.get).toHaveBeenCalledWith('report:by-operator:2024-01-01:2024-01-31');
      expect(collectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query the database and return operator report', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue(rawResults);

      const result = await service.getByOperator(query);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        operator: { id: 'op-1', name: 'John Doe', telegramUsername: 'johndoe' },
        collectionsCount: 7,
        totalAmount: 3500,
      });
      expect(result.data[1]).toEqual({
        operator: { id: 'op-2', name: 'Jane Smith', telegramUsername: 'janesmith' },
        collectionsCount: 4,
        totalAmount: 1200,
      });

      expect(result.totals.collectionsCount).toBe(11);
      expect(result.totals.totalAmount).toBe(4700);

      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();

      expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('collection.operator', 'operator');
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('collection.machine', 'machine');
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('operator.id');
      expect(mockQueryBuilder.addGroupBy).toHaveBeenCalledWith('operator.name');
      expect(mockQueryBuilder.addGroupBy).toHaveBeenCalledWith('operator.telegramUsername');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('"totalAmount"', 'DESC');

      expect(cacheManager.set).toHaveBeenCalledWith(
        'report:by-operator:2024-01-01:2024-01-31',
        result,
        60000,
      );
    });

    it('should return empty data when no results', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getByOperator(query);

      expect(result.data).toHaveLength(0);
      expect(result.totals.collectionsCount).toBe(0);
      expect(result.totals.totalAmount).toBe(0);
    });

    it('should handle null amounts gracefully', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          operatorId: 'op-1',
          operatorName: 'John Doe',
          operatorUsername: 'johndoe',
          collectionsCount: null,
          totalAmount: null,
        },
      ]);

      const result = await service.getByOperator(query);

      expect(result.data[0].collectionsCount).toBe(0);
      expect(result.data[0].totalAmount).toBe(0);
    });
  });

  describe('getTodaySummary', () => {
    it('should return cached result if available', async () => {
      const cachedResult = { pending: 5, todayAmount: 1000, monthAmount: 15000 };
      cacheManager.get.mockResolvedValue(cachedResult);

      const result = await service.getTodaySummary();

      expect(result).toEqual(cachedResult);
      expect(cacheManager.get).toHaveBeenCalledWith('report:today-summary');
      expect(collectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query the database and return today summary', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(3);
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '2500.75' })  // todayResult
        .mockResolvedValueOnce({ total: '18000.50' }); // monthResult

      const result = await service.getTodaySummary();

      expect(result.pending).toBe(3);
      expect(result.todayAmount).toBe(2500.75);
      expect(result.monthAmount).toBe(18000.5);

      // Should be called 3 times: pending count, today amount, month amount
      expect(collectionRepository.createQueryBuilder).toHaveBeenCalledTimes(3);

      // Cache with 30 second TTL
      expect(cacheManager.set).toHaveBeenCalledWith(
        'report:today-summary',
        result,
        30000,
      );
    });

    it('should handle null totals gracefully', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: null })
        .mockResolvedValueOnce({ total: null });

      const result = await service.getTodaySummary();

      expect(result.pending).toBe(0);
      expect(result.todayAmount).toBe(0);
      expect(result.monthAmount).toBe(0);
    });

    it('should handle undefined result from getRawOne', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const result = await service.getTodaySummary();

      expect(result.pending).toBe(0);
      expect(result.todayAmount).toBe(0);
      expect(result.monthAmount).toBe(0);
    });
  });

  describe('invalidateCache', () => {
    it('should delete all tracked cache keys', async () => {
      // Populate some cache keys by calling methods
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '1',
        totalAmount: '100',
        pendingCount: '0',
        receivedCount: '1',
        cancelledCount: '0',
      });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      // Run some report methods to populate activeCacheKeys
      await service.getSummary({ from: '2024-01-01', to: '2024-01-31' });
      await service.getByMachine({ from: '2024-02-01', to: '2024-02-28' });

      cacheManager.del.mockResolvedValue(true);

      await service.invalidateCache();

      // Should have called del for each tracked key
      expect(cacheManager.del).toHaveBeenCalledWith('report:summary:2024-01-01:2024-01-31');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-machine:2024-02-01:2024-02-28');
    });

    it('should do nothing when no cache keys are tracked', async () => {
      await service.invalidateCache();

      expect(cacheManager.del).not.toHaveBeenCalled();
    });

    it('should clear the active cache keys set after invalidation', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getByDate({ from: '2024-03-01', to: '2024-03-31' });

      cacheManager.del.mockResolvedValue(true);

      await service.invalidateCache();

      expect(cacheManager.del).toHaveBeenCalledTimes(1);

      // Second invalidation should not delete anything since keys were cleared
      cacheManager.del.mockClear();
      await service.invalidateCache();

      expect(cacheManager.del).not.toHaveBeenCalled();
    });
  });

  describe('cache key generation', () => {
    it('should generate correct cache keys with query params', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '0',
        totalAmount: '0',
        pendingCount: '0',
        receivedCount: '0',
        cancelledCount: '0',
      });

      await service.getSummary({ from: '2024-06-01', to: '2024-06-30' });

      expect(cacheManager.get).toHaveBeenCalledWith('report:summary:2024-06-01:2024-06-30');
    });

    it('should generate cache keys with defaults for missing params', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '0',
        totalAmount: '0',
        pendingCount: '0',
        receivedCount: '0',
        cancelledCount: '0',
      });

      await service.getSummary({});

      expect(cacheManager.get).toHaveBeenCalledWith('report:summary:default:default');
    });
  });

  describe('date range handling', () => {
    it('should set to-date hours to end of day when custom range provided', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '1',
        totalAmount: '100',
        pendingCount: '0',
        receivedCount: '1',
        cancelledCount: '0',
      });

      const result = await service.getSummary({ from: '2024-01-01', to: '2024-01-31' });

      // The to-date should be set to end of day in Tashkent (UTC+5),
      // so 23:59:59.999 Tashkent = 18:59:59.999 UTC
      const toDate = new Date(result.period.to);
      expect(toDate.getUTCHours()).toBe(18);
      expect(toDate.getUTCMinutes()).toBe(59);
      expect(toDate.getUTCSeconds()).toBe(59);
      expect(toDate.getUTCMilliseconds()).toBe(999);
    });

    it('should default to current month when no dates provided', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '0',
        totalAmount: '0',
        pendingCount: '0',
        receivedCount: '0',
        cancelledCount: '0',
      });

      const now = new Date();
      const result = await service.getSummary({});

      // Default range should cover current month in Tashkent timezone
      const fromDate = new Date(result.period.from);
      const toDate = new Date(result.period.to);
      // From should be before or equal to now, To should be after or equal to now
      expect(fromDate.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(toDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });
  });

  describe('query builder interactions', () => {
    it('getSummary should filter by RECEIVED status for totalAmount', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '0',
        totalAmount: '0',
        pendingCount: '0',
        receivedCount: '0',
        cancelledCount: '0',
      });

      await service.getSummary({ from: '2024-01-01', to: '2024-01-31' });

      expect(mockQueryBuilder.setParameters).toHaveBeenCalledWith({
        collected: CollectionStatus.COLLECTED,
        received: CollectionStatus.RECEIVED,
        cancelled: CollectionStatus.CANCELLED,
      });
    });

    it('getByMachine should filter by RECEIVED status', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getByMachine({ from: '2024-01-01', to: '2024-01-31' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.RECEIVED },
      );
    });

    it('getByDate should filter by RECEIVED status', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getByDate({ from: '2024-01-01', to: '2024-01-31' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.RECEIVED },
      );
    });

    it('getByOperator should filter by RECEIVED status', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getByOperator({ from: '2024-01-01', to: '2024-01-31' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.RECEIVED },
      );
    });

    it('getTodaySummary should filter pending by COLLECTED status', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });

      await service.getTodaySummary();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.COLLECTED },
      );
    });
  });

  describe('rounding precision', () => {
    it('getSummary should round totalAmount to 2 decimal places', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalCollections: '1',
        totalAmount: '1234.5678',
        pendingCount: '0',
        receivedCount: '1',
        cancelledCount: '0',
      });

      const result = await service.getSummary({ from: '2024-01-01', to: '2024-01-31' });

      expect(result.totalAmount).toBe(1234.57);
    });

    it('getByMachine should round amounts to 2 decimal places', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          machineId: 'machine-1',
          machineCode: 'A01',
          machineName: 'Machine One',
          collectionsCount: '3',
          totalAmount: '999.999',
        },
      ]);

      const result = await service.getByMachine({ from: '2024-01-01', to: '2024-01-31' });

      expect(result.data[0].totalAmount).toBe(1000);
      expect(result.data[0].averageAmount).toBe(
        Math.round((999.999 / 3) * 100) / 100,
      );
    });

    it('getTodaySummary should round amounts to 2 decimal places', async () => {
      cacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '123.456' })
        .mockResolvedValueOnce({ total: '789.014' });

      const result = await service.getTodaySummary();

      expect(result.todayAmount).toBe(123.46);
      expect(result.monthAmount).toBe(789.01);
    });
  });
});
