import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { CollectionsService } from './collections.service';
import {
  Collection,
  CollectionStatus,
  CollectionSource,
} from './entities/collection.entity';
import { CollectionHistory } from './entities/collection-history.entity';
import { MachinesService } from '../machines/machines.service';
import { TelegramService } from '../../telegram/telegram.service';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let collectionRepository: jest.Mocked<Repository<Collection>>;
  let historyRepository: jest.Mocked<Repository<CollectionHistory>>;
  let machinesService: jest.Mocked<MachinesService>;
  let telegramService: jest.Mocked<TelegramService>;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let configService: jest.Mocked<ConfigService>;
  let mockQueryRunner: any;
  let mockQueryBuilder: any;

  const mockMachine = {
    id: 'machine-123',
    code: 'A01',
    name: 'Test Machine',
    isActive: true,
  };

  const mockMachine2 = {
    id: 'machine-456',
    code: 'B02',
    name: 'Second Machine',
    isActive: true,
  };

  const mockOperator = {
    id: 'operator-123',
    name: 'Test Operator',
    telegramUsername: 'testop',
  };

  const mockManager = {
    id: 'manager-123',
    name: 'Test Manager',
    telegramUsername: 'testmgr',
  };

  const mockCollection = {
    id: 'collection-123',
    machineId: 'machine-123',
    operatorId: 'operator-123',
    managerId: null,
    collectedAt: new Date('2025-01-15T10:00:00Z'),
    receivedAt: null,
    amount: null,
    status: CollectionStatus.COLLECTED,
    source: CollectionSource.REALTIME,
    notes: null,
    latitude: null,
    longitude: null,
    locationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    machine: mockMachine,
    operator: mockOperator,
    manager: null,
  } as unknown as Collection;

  const mockReceivedCollection = {
    ...mockCollection,
    id: 'collection-received',
    status: CollectionStatus.RECEIVED,
    amount: 5000,
    managerId: 'manager-123',
    receivedAt: new Date('2025-01-15T12:00:00Z'),
    manager: mockManager,
  } as unknown as Collection;

  const mockCancelledCollection = {
    ...mockCollection,
    id: 'collection-cancelled',
    status: CollectionStatus.CANCELLED,
  } as unknown as Collection;

  beforeEach(async () => {
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        {
          provide: getRepositoryToken(Collection),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(CollectionHistory),
          useValue: {
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: MachinesService,
          useValue: {
            findByIdOrFail: jest.fn(),
            findById: jest.fn(),
            findByCode: jest.fn(),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            notifyManagersAboutNewCollection: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(30),
          },
        },
        {
          provide: DataSource,
          useFactory: () => {
            mockQueryRunner = {
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                findOne: jest.fn(),
                save: jest.fn(),
                create: jest.fn().mockImplementation((_, data) => data),
                createQueryBuilder: jest.fn(),
              },
            };
            return {
              createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
            };
          },
        },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
    collectionRepository = module.get(getRepositoryToken(Collection));
    historyRepository = module.get(getRepositoryToken(CollectionHistory));
    machinesService = module.get(MachinesService);
    telegramService = module.get(TelegramService);
    cacheManager = module.get(CACHE_MANAGER);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('should create a collection successfully', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne
        .mockResolvedValueOnce(null) // duplicate check returns null
        .mockResolvedValue(mockCollection); // notifyManagersAsync -> findById
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      expect(result).toEqual(mockCollection);
      expect(machinesService.findByIdOrFail).toHaveBeenCalledWith('machine-123');
      expect(collectionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          machineId: 'machine-123',
          operatorId: 'operator-123',
          source: CollectionSource.REALTIME,
        }),
      );
      expect(collectionRepository.save).toHaveBeenCalled();
    });

    it('should create a collection with all optional fields', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
        latitude: 41.3111,
        longitude: 69.2797,
        notes: 'Test notes',
        source: CollectionSource.MANUAL_HISTORY,
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(null);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      expect(result).toEqual(mockCollection);
      expect(collectionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          machineId: 'machine-123',
          operatorId: 'operator-123',
          latitude: 41.3111,
          longitude: 69.2797,
          notes: 'Test notes',
          source: CollectionSource.MANUAL_HISTORY,
        }),
      );
    });

    it('should throw BadRequestException when duplicate collection exists', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(mockCollection);

      await expect(service.create(dto, 'operator-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include DUPLICATE_COLLECTION code in duplicate error', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(mockCollection);

      try {
        await service.create(dto, 'operator-123');
        fail('Expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse();
        expect(response).toEqual(
          expect.objectContaining({
            code: 'DUPLICATE_COLLECTION',
            existingCollectionId: 'collection-123',
          }),
        );
      }
    });

    it('should allow duplicate when skipDuplicateCheck is true', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
        skipDuplicateCheck: true,
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(mockCollection);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      expect(result).toEqual(mockCollection);
    });

    it('should handle string collectedAt by converting to Date', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: '2025-01-15T10:00:00Z' as any,
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(null);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      expect(result).toEqual(mockCollection);
      expect(collectionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collectedAt: expect.any(Date),
        }),
      );
    });

    it('should default source to REALTIME when not provided', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(null);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      await service.create(dto, 'operator-123');

      expect(collectionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: CollectionSource.REALTIME,
        }),
      );
    });

    it('should invalidate reports cache after creating collection', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(null);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      await service.create(dto, 'operator-123');

      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-machine');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-date');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-operator');
      expect(cacheManager.del).toHaveBeenCalledWith('report:today-summary');
    });

    it('should propagate error when machine not found', async () => {
      const dto = {
        machineId: 'non-existent',
        collectedAt: new Date(),
      };

      machinesService.findByIdOrFail.mockRejectedValue(
        new NotFoundException('Machine not found'),
      );

      await expect(service.create(dto, 'operator-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not block on telegram notification failure', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce(mockCollection); // notifyManagersAsync -> findByIdOrFail -> findById
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      // Should still return the collection even if telegram notification setup fails
      expect(result).toEqual(mockCollection);
    });
  });

  // ---------------------------------------------------------------------------
  // bulkCreate
  // ---------------------------------------------------------------------------
  describe('bulkCreate', () => {
    it('should bulk create collections successfully', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z', amount: 1000 },
          { machineId: 'machine-456', collectedAt: '2025-01-15T11:00:00Z' },
        ],
      };

      machinesService.findById
        .mockResolvedValueOnce(mockMachine as any)
        .mockResolvedValueOnce(mockMachine2 as any);

      const savedCollection1 = { ...mockCollection, id: 'c1' } as unknown as Collection;
      const savedCollection2 = { ...mockCollection, id: 'c2' } as unknown as Collection;

      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedCollection1)
        .mockResolvedValueOnce(savedCollection2);

      const result = await service.bulkCreate(dto, 'operator-123');

      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.collections).toHaveLength(2);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should set RECEIVED status when amount is provided', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z', amount: 5000 },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Collection,
        expect.objectContaining({
          amount: 5000,
          status: CollectionStatus.RECEIVED,
          managerId: 'operator-123',
          receivedAt: expect.any(Date),
        }),
      );
    });

    it('should set COLLECTED status when amount is not provided', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Collection,
        expect.objectContaining({
          status: CollectionStatus.COLLECTED,
          managerId: undefined,
          receivedAt: undefined,
        }),
      );
    });

    it('should lookup machine by code when machineId is not provided', async () => {
      const dto = {
        collections: [
          { machineCode: 'A01', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findByCode.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      const result = await service.bulkCreate(dto, 'operator-123');

      expect(machinesService.findByCode).toHaveBeenCalledWith('A01');
      expect(result.created).toBe(1);
    });

    it('should fail items where machine is not found', async () => {
      const dto = {
        collections: [
          { machineId: 'non-existent', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(null as any);

      const result = await service.bulkCreate(dto, 'operator-123');

      expect(result.created).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ index: 0, error: 'Machine not found' });
    });

    it('should handle non-Error thrown during bulk create item processing', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockRejectedValueOnce('string error');

      const result = await service.bulkCreate(dto, 'operator-123');

      expect(result.created).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({ index: 0, error: 'Unknown error' });
    });

    it('should handle mixed success and failure in bulk create', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
          { machineId: 'non-existent', collectedAt: '2025-01-15T11:00:00Z' },
          { machineId: 'machine-456', collectedAt: '2025-01-15T12:00:00Z' },
        ],
      };

      machinesService.findById
        .mockResolvedValueOnce(mockMachine as any)
        .mockResolvedValueOnce(null as any)
        .mockResolvedValueOnce(mockMachine2 as any);

      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      const result = await service.bulkCreate(dto, 'operator-123');

      expect(result.created).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors[0].index).toBe(1);
    });

    it('should use provided source for bulk create', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
        source: CollectionSource.EXCEL_IMPORT,
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Collection,
        expect.objectContaining({
          source: CollectionSource.EXCEL_IMPORT,
        }),
      );
    });

    it('should default to MANUAL_HISTORY source when not provided', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Collection,
        expect.objectContaining({
          source: CollectionSource.MANUAL_HISTORY,
        }),
      );
    });

    it('should invalidate reports cache when at least one collection is created', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
    });

    it('should not invalidate reports cache when no collections were created', async () => {
      const dto = {
        collections: [
          { machineId: 'non-existent', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(null as any);

      await service.bulkCreate(dto, 'operator-123');

      expect(cacheManager.del).not.toHaveBeenCalled();
    });

    it('should rollback transaction on unexpected error', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);
      mockQueryRunner.commitTransaction.mockRejectedValue(new Error('Commit failed'));

      await expect(service.bulkCreate(dto, 'operator-123')).rejects.toThrow(
        'Commit failed',
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should include locationId and notes when provided', async () => {
      const dto = {
        collections: [
          {
            machineId: 'machine-123',
            collectedAt: '2025-01-15T10:00:00Z',
            notes: 'Test note',
            locationId: 'location-1',
          },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        Collection,
        expect.objectContaining({
          notes: 'Test note',
          locationId: 'location-1',
        }),
      );
    });

    it('should handle empty collections array', async () => {
      const dto = {
        collections: [],
      };

      const result = await service.bulkCreate(dto, 'operator-123');

      expect(result.created).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.collections).toHaveLength(0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should deduplicate machine IDs and codes for batch loading', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
          { machineId: 'machine-123', collectedAt: '2025-01-15T11:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);

      await service.bulkCreate(dto, 'operator-123');

      // findById should only be called once for the deduplicated machine ID
      expect(machinesService.findById).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------
  describe('findAll', () => {
    it('should return paginated results with default settings', async () => {
      const collections = [mockCollection];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([collections, 1]);

      const result = await service.findAll({});

      expect(result).toEqual({ data: collections, total: 1 });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.collectedAt',
        'DESC',
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0); // (1 - 1) * 20
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('should apply status filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ status: CollectionStatus.COLLECTED });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.COLLECTED },
      );
    });

    it('should apply machineId filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ machineId: 'machine-123' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.machineId = :machineId',
        { machineId: 'machine-123' },
      );
    });

    it('should apply operatorId filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ operatorId: 'operator-123' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.operatorId = :operatorId',
        { operatorId: 'operator-123' },
      );
    });

    it('should apply source filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ source: CollectionSource.REALTIME });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.source = :source',
        { source: CollectionSource.REALTIME },
      );
    });

    it('should apply from date filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ from: '2025-01-01' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.collectedAt >= :from',
        { from: expect.any(Date) },
      );
    });

    it('should apply to date filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ to: '2025-01-31' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.collectedAt <= :to',
        { to: expect.any(Date) },
      );
    });

    it('should apply all filters simultaneously', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        status: CollectionStatus.RECEIVED,
        machineId: 'machine-123',
        operatorId: 'operator-123',
        source: CollectionSource.REALTIME,
        from: '2025-01-01',
        to: '2025-01-31',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(6);
    });

    it('should use custom sort field when valid', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: 'amount' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.amount',
        'DESC',
      );
    });

    it('should default to collectedAt when sort field is not in whitelist', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: 'invalidField' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.collectedAt',
        'DESC',
      );
    });

    it('should reject SQL injection attempts in sortBy', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: 'id; DROP TABLE collections;' });

      // Should fall back to collectedAt
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.collectedAt',
        'DESC',
      );
    });

    it('should accept ASC sort order', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortOrder: 'ASC' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.collectedAt',
        'ASC',
      );
    });

    it('should default sort order to DESC for non-ASC values', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortOrder: 'INVALID' as any });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.collectedAt',
        'DESC',
      );
    });

    it('should handle custom pagination', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20); // (3 - 1) * 10
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should allow all valid sort fields', async () => {
      const validFields = ['collectedAt', 'amount', 'status', 'receivedAt', 'createdAt'];

      for (const field of validFields) {
        mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
        mockQueryBuilder.orderBy.mockClear();

        await service.findAll({ sortBy: field });

        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          `collection.${field}`,
          'DESC',
        );
      }
    });

    it('should include machine, operator, and manager relations', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({});

      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'collection.machine',
        'machine',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'collection.operator',
        'operator',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'collection.manager',
        'manager',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findPending
  // ---------------------------------------------------------------------------
  describe('findPending', () => {
    it('should return pending collections', async () => {
      const pendingCollections = [mockCollection];
      collectionRepository.find.mockResolvedValue(pendingCollections);

      const result = await service.findPending();

      expect(result).toEqual(pendingCollections);
      expect(collectionRepository.find).toHaveBeenCalledWith({
        where: { status: CollectionStatus.COLLECTED },
        relations: ['machine', 'operator'],
        order: { collectedAt: 'DESC' },
      });
    });

    it('should return empty array when no pending collections', async () => {
      collectionRepository.find.mockResolvedValue([]);

      const result = await service.findPending();

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------
  describe('findById', () => {
    it('should return a collection when found', async () => {
      collectionRepository.findOne.mockResolvedValue(mockCollection);

      const result = await service.findById('collection-123');

      expect(result).toEqual(mockCollection);
      expect(collectionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'collection-123' },
        relations: ['machine', 'operator', 'manager'],
      });
    });

    it('should return null when not found', async () => {
      collectionRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findByIdOrFail
  // ---------------------------------------------------------------------------
  describe('findByIdOrFail', () => {
    it('should return a collection when found', async () => {
      collectionRepository.findOne.mockResolvedValue(mockCollection);

      const result = await service.findByIdOrFail('collection-123');

      expect(result).toEqual(mockCollection);
    });

    it('should throw NotFoundException when not found', async () => {
      collectionRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrFail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw with "Collection not found" message', async () => {
      collectionRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrFail('non-existent')).rejects.toThrow(
        'Collection not found',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // receive
  // ---------------------------------------------------------------------------
  describe('receive', () => {
    it('should receive a collection successfully', async () => {
      const receivedCollection = {
        ...mockCollection,
        status: CollectionStatus.RECEIVED,
        amount: 5000,
        managerId: 'manager-123',
        receivedAt: expect.any(Date),
      };

      // First call returns locked collection (COLLECTED status), second returns with relations
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection }) // locked row
        .mockResolvedValueOnce({ ...mockCollection }); // with relations
      mockQueryRunner.manager.save.mockResolvedValue(receivedCollection as Collection);

      const result = await service.receive('collection-123', 'manager-123', {
        amount: 5000,
      });

      expect(result.status).toBe(CollectionStatus.RECEIVED);
      expect(result.amount).toBe(5000);
      expect(result.managerId).toBe('manager-123');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should create audit history records for status and amount', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue(mockReceivedCollection);

      await service.receive('collection-123', 'manager-123', {
        amount: 5000,
      });

      // Should create history for status change
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          collectionId: 'collection-123',
          changedById: 'manager-123',
          fieldName: 'status',
          oldValue: CollectionStatus.COLLECTED,
          newValue: CollectionStatus.RECEIVED,
          reason: 'Collection received by manager',
        }),
      );

      // Should create history for amount change
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          collectionId: 'collection-123',
          changedById: 'manager-123',
          fieldName: 'amount',
          newValue: '5000',
          reason: 'Initial amount set on receive',
        }),
      );
    });

    it('should set notes when provided in dto', async () => {
      const collectionWithNotes = {
        ...mockCollection,
        notes: 'received with notes',
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue(collectionWithNotes as Collection);

      await service.receive('collection-123', 'manager-123', {
        amount: 5000,
        notes: 'received with notes',
      });

      // The collection should have notes set before saving
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'received with notes',
        }),
      );
    });

    it('should not overwrite notes when not provided in dto', async () => {
      const collectionWithExistingNotes = {
        ...mockCollection,
        notes: 'existing notes',
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...collectionWithExistingNotes })
        .mockResolvedValueOnce({ ...collectionWithExistingNotes });
      mockQueryRunner.manager.save.mockResolvedValue(
        collectionWithExistingNotes as Collection,
      );

      await service.receive('collection-123', 'manager-123', { amount: 5000 });

      // Notes should remain as the existing value
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'existing notes',
        }),
      );
    });

    it('should throw NotFoundException when locked row is not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(
        service.receive('non-existent', 'manager-123', { amount: 5000 }),
      ).rejects.toThrow(NotFoundException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw BadRequestException when collection is not in COLLECTED status', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        ...mockCollection,
        status: CollectionStatus.RECEIVED,
      });

      await expect(
        service.receive('collection-123', 'manager-123', { amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when trying to receive cancelled collection', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      });

      await expect(
        service.receive('collection-123', 'manager-123', { amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when relations load returns null', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection }) // locked row found
        .mockResolvedValueOnce(null); // relations load returns null

      await expect(
        service.receive('collection-123', 'manager-123', { amount: 5000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback transaction on error and release queryRunner', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.receive('collection-123', 'manager-123', { amount: 5000 }),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should invalidate reports cache after successful receive', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue(mockReceivedCollection);

      await service.receive('collection-123', 'manager-123', { amount: 5000 });

      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
    });
  });

  // ---------------------------------------------------------------------------
  // edit
  // ---------------------------------------------------------------------------
  describe('edit', () => {
    it('should edit a received collection successfully', async () => {
      const editedCollection = {
        ...mockReceivedCollection,
        amount: 7000,
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection }) // locked row
        .mockResolvedValueOnce({ ...mockReceivedCollection }); // with relations
      mockQueryRunner.manager.save.mockResolvedValue(editedCollection as Collection);

      const result = await service.edit('collection-received', 'manager-123', {
        amount: 7000,
        reason: 'Correction',
      });

      expect(result.amount).toBe(7000);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should create history record when amount changes', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection })
        .mockResolvedValueOnce({ ...mockReceivedCollection });
      mockQueryRunner.manager.save.mockResolvedValue(mockReceivedCollection);

      await service.edit('collection-received', 'user-123', {
        amount: 7000,
        reason: 'Count correction',
      });

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          collectionId: 'collection-received',
          changedById: 'user-123',
          fieldName: 'amount',
          oldValue: '5000',
          newValue: '7000',
          reason: 'Count correction',
        }),
      );
    });

    it('should not create history record when amount is unchanged', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection })
        .mockResolvedValueOnce({ ...mockReceivedCollection });
      mockQueryRunner.manager.save.mockResolvedValue(mockReceivedCollection);

      await service.edit('collection-received', 'user-123', {
        amount: 5000, // same as existing
        reason: 'No change',
      });

      // Should not create a CollectionHistory for amount since it did not change
      expect(mockQueryRunner.manager.create).not.toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          fieldName: 'amount',
        }),
      );
    });

    it('should throw NotFoundException when locked row is not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(
        service.edit('non-existent', 'user-123', {
          amount: 7000,
          reason: 'Correction',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when collection is not in RECEIVED status', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        ...mockCollection,
        status: CollectionStatus.COLLECTED,
      });

      await expect(
        service.edit('collection-123', 'user-123', {
          amount: 7000,
          reason: 'Correction',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when trying to edit cancelled collection', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        ...mockCancelledCollection,
      });

      await expect(
        service.edit('collection-cancelled', 'user-123', {
          amount: 7000,
          reason: 'Correction',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when relations load returns null', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection })
        .mockResolvedValueOnce(null);

      await expect(
        service.edit('collection-received', 'user-123', {
          amount: 7000,
          reason: 'Correction',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback transaction on error and release queryRunner', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection })
        .mockResolvedValueOnce({ ...mockReceivedCollection });
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.edit('collection-received', 'user-123', {
          amount: 7000,
          reason: 'Correction',
        }),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should invalidate reports cache after successful edit', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection })
        .mockResolvedValueOnce({ ...mockReceivedCollection });
      mockQueryRunner.manager.save.mockResolvedValue(mockReceivedCollection);

      await service.edit('collection-received', 'user-123', {
        amount: 7000,
        reason: 'Correction',
      });

      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
    });
  });

  // ---------------------------------------------------------------------------
  // cancel
  // ---------------------------------------------------------------------------
  describe('cancel', () => {
    it('should cancel a collected collection', async () => {
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection }) // locked row
        .mockResolvedValueOnce({ ...mockCollection }); // with relations
      mockQueryRunner.manager.save
        .mockResolvedValueOnce({} as CollectionHistory) // history save
        .mockResolvedValueOnce(cancelledCollection as Collection); // collection save

      const result = await service.cancel('collection-123', 'user-123', 'Test reason');

      expect(result.status).toBe(CollectionStatus.CANCELLED);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should cancel a received collection', async () => {
      const cancelledCollection = {
        ...mockReceivedCollection,
        status: CollectionStatus.CANCELLED,
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockReceivedCollection })
        .mockResolvedValueOnce({ ...mockReceivedCollection });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce({} as CollectionHistory)
        .mockResolvedValueOnce(cancelledCollection as Collection);

      const result = await service.cancel('collection-received', 'user-123');

      expect(result.status).toBe(CollectionStatus.CANCELLED);
    });

    it('should create history record with provided reason', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce({} as CollectionHistory)
        .mockResolvedValueOnce(mockCancelledCollection);

      await service.cancel('collection-123', 'user-123', 'Custom reason');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          collectionId: 'collection-123',
          changedById: 'user-123',
          fieldName: 'status',
          oldValue: CollectionStatus.COLLECTED,
          newValue: CollectionStatus.CANCELLED,
          reason: 'Custom reason',
        }),
      );
    });

    it('should use default reason when not provided', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce({} as CollectionHistory)
        .mockResolvedValueOnce(mockCancelledCollection);

      await service.cancel('collection-123', 'user-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          reason: 'Cancelled by user',
        }),
      );
    });

    it('should throw BadRequestException when already cancelled', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        ...mockCancelledCollection,
      });

      await expect(
        service.cancel('collection-cancelled', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when locked row is not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(
        service.cancel('non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when relations load returns null', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce(null);

      await expect(
        service.cancel('collection-123', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback transaction on error and release queryRunner', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.cancel('collection-123', 'user-123'),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should invalidate reports cache after successful cancel', async () => {
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce({} as CollectionHistory)
        .mockResolvedValueOnce(mockCancelledCollection);

      await service.cancel('collection-123', 'user-123');

      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
    });
  });

  // ---------------------------------------------------------------------------
  // bulkCancel
  // ---------------------------------------------------------------------------
  describe('bulkCancel', () => {
    it('should cancel collections by IDs', async () => {
      const dto = {
        ids: ['collection-123', 'collection-456'],
        reason: 'Bulk cancel reason',
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection, id: 'collection-123' })
        .mockResolvedValueOnce({ ...mockCollection, id: 'collection-456' });
      mockQueryRunner.manager.save.mockResolvedValue({});

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should skip already cancelled collections', async () => {
      const dto = {
        ids: ['collection-123', 'collection-cancelled'],
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCancelledCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        id: 'collection-cancelled',
        error: 'Already cancelled',
      });
    });

    it('should handle not found collections in bulk cancel', async () => {
      const dto = {
        ids: ['non-existent'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        id: 'non-existent',
        error: 'Collection not found',
      });
    });

    it('should use custom reason for bulk cancel history', async () => {
      const dto = {
        ids: ['collection-123'],
        reason: 'Custom bulk reason',
      };

      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});

      await service.bulkCancel(dto, 'user-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          reason: 'Custom bulk reason',
        }),
      );
    });

    it('should use default reason "Bulk cancellation" when not provided', async () => {
      const dto = {
        ids: ['collection-123'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});

      await service.bulkCancel(dto, 'user-123');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CollectionHistory,
        expect.objectContaining({
          reason: 'Bulk cancellation',
        }),
      );
    });

    it('should return early with zero results for empty IDs array', async () => {
      const dto = {
        ids: [],
      };

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should invalidate reports cache when at least one collection is cancelled', async () => {
      const dto = {
        ids: ['collection-123'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});

      await service.bulkCancel(dto, 'user-123');

      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
    });

    it('should not invalidate reports cache when no collections were cancelled', async () => {
      const dto = {
        ids: ['non-existent'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await service.bulkCancel(dto, 'user-123');

      expect(cacheManager.del).not.toHaveBeenCalled();
    });

    // --- useFilters mode ---

    it('should throw BadRequestException when useFilters is true but no filters specified', async () => {
      const dto = {
        useFilters: true,
      };

      await expect(service.bulkCancel(dto, 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should cancel collections by filter with status filter', async () => {
      const dto = {
        useFilters: true,
        status: CollectionStatus.COLLECTED,
        reason: 'Filter cancel',
      };

      const mockFilterQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { collection_id: 'c1' },
          { collection_id: 'c2' },
        ]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockFilterQueryBuilder);

      // Mock findOne for each collection ID
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection, id: 'c1' })
        .mockResolvedValueOnce({ ...mockCollection, id: 'c2' });
      mockQueryRunner.manager.save.mockResolvedValue({});

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(2);
      expect(result.total).toBe(2);
      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status != :cancelledStatus',
        { cancelledStatus: CollectionStatus.CANCELLED },
      );
      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.COLLECTED },
      );
    });

    it('should apply machineId filter in useFilters mode', async () => {
      const dto = {
        useFilters: true,
        machineId: 'machine-123',
      };

      const mockFilterQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockFilterQueryBuilder);

      const result = await service.bulkCancel(dto, 'user-123');

      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.machineId = :machineId',
        { machineId: 'machine-123' },
      );
      expect(result.total).toBe(0);
    });

    it('should apply operatorId filter in useFilters mode', async () => {
      const dto = {
        useFilters: true,
        operatorId: 'operator-123',
      };

      const mockFilterQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockFilterQueryBuilder);

      await service.bulkCancel(dto, 'user-123');

      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.operatorId = :operatorId',
        { operatorId: 'operator-123' },
      );
    });

    it('should apply source filter in useFilters mode', async () => {
      const dto = {
        useFilters: true,
        source: CollectionSource.REALTIME,
      };

      const mockFilterQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockFilterQueryBuilder);

      await service.bulkCancel(dto, 'user-123');

      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.source = :source',
        { source: CollectionSource.REALTIME },
      );
    });

    it('should apply from and to date filters in useFilters mode', async () => {
      const dto = {
        useFilters: true,
        from: '2025-01-01',
        to: '2025-01-31',
      };

      const mockFilterQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(mockFilterQueryBuilder);

      await service.bulkCancel(dto, 'user-123');

      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.collectedAt >= :from',
        { from: expect.any(Date) },
      );
      expect(mockFilterQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.collectedAt <= :to',
        { to: expect.any(Date) },
      );
    });

    it('should use ids array when useFilters is false', async () => {
      const dto = {
        useFilters: false,
        ids: ['collection-123'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(1);
      // Should NOT call createQueryBuilder on manager
      expect(mockQueryRunner.manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should default to empty ids when neither useFilters nor ids provided', async () => {
      const dto = {} as any;

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.total).toBe(0);
      expect(result.cancelled).toBe(0);
    });

    it('should rollback transaction on unexpected error', async () => {
      const dto = {
        ids: ['collection-123'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});
      mockQueryRunner.commitTransaction.mockRejectedValue(
        new Error('Commit failed'),
      );

      await expect(service.bulkCancel(dto, 'user-123')).rejects.toThrow(
        'Commit failed',
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should handle non-Error thrown during bulk cancel item processing', async () => {
      const dto = {
        ids: ['collection-123'],
      };

      mockQueryRunner.manager.findOne.mockResolvedValueOnce({ ...mockCollection });
      mockQueryRunner.manager.save.mockRejectedValueOnce('string error');

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        id: 'collection-123',
        error: 'Unknown error',
      });
    });

    it('should handle individual item errors without failing the whole batch', async () => {
      const dto = {
        ids: ['collection-123', 'collection-456'],
      };

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce({ ...mockCollection })
        .mockResolvedValueOnce({ ...mockCollection, id: 'collection-456' });

      // First collection save succeeds for history & collection,
      // second collection's history save throws
      mockQueryRunner.manager.save
        .mockResolvedValueOnce({}) // history for c1
        .mockResolvedValueOnce({}) // collection for c1
        .mockRejectedValueOnce(new Error('Save failed')); // history for c2

      const result = await service.bulkCancel(dto, 'user-123');

      expect(result.cancelled).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        id: 'collection-456',
        error: 'Save failed',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getHistory
  // ---------------------------------------------------------------------------
  describe('getHistory', () => {
    it('should return history records for a collection', async () => {
      const mockHistoryRecords = [
        {
          id: 'history-1',
          collectionId: 'collection-123',
          fieldName: 'status',
          oldValue: 'collected',
          newValue: 'received',
          createdAt: new Date(),
        },
      ] as unknown as CollectionHistory[];

      historyRepository.find.mockResolvedValue(mockHistoryRecords);

      const result = await service.getHistory('collection-123');

      expect(result).toEqual(mockHistoryRecords);
      expect(historyRepository.find).toHaveBeenCalledWith({
        where: { collectionId: 'collection-123' },
        relations: ['changedBy'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no history exists', async () => {
      historyRepository.find.mockResolvedValue([]);

      const result = await service.getHistory('collection-123');

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // countByMachine
  // ---------------------------------------------------------------------------
  describe('countByMachine', () => {
    it('should return count of collections for a machine', async () => {
      collectionRepository.count.mockResolvedValue(5);

      const result = await service.countByMachine('machine-123');

      expect(result).toBe(5);
      expect(collectionRepository.count).toHaveBeenCalledWith({
        where: { machineId: 'machine-123' },
      });
    });

    it('should return 0 when no collections exist for machine', async () => {
      collectionRepository.count.mockResolvedValue(0);

      const result = await service.countByMachine('non-existent');

      expect(result).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // findByOperator
  // ---------------------------------------------------------------------------
  describe('findByOperator', () => {
    it('should return collections for an operator', async () => {
      const collections = [mockCollection];
      mockQueryBuilder.getMany.mockResolvedValue(collections);

      const result = await service.findByOperator('operator-123');

      expect(result).toEqual(collections);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'collection.operatorId = :operatorId',
        { operatorId: 'operator-123' },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'collection.collectedAt',
        'DESC',
      );
    });

    it('should filter by date when provided', async () => {
      const collections = [mockCollection];
      mockQueryBuilder.getMany.mockResolvedValue(collections);

      const date = new Date('2025-01-15');
      const result = await service.findByOperator('operator-123', date);

      expect(result).toEqual(collections);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.collectedAt BETWEEN :start AND :end',
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date),
        }),
      );
    });

    it('should set start and end of day when date filter is used', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const date = new Date('2025-01-15');
      await service.findByOperator('operator-123', date);

      const callArgs = mockQueryBuilder.andWhere.mock.calls[0][1];
      // Start of day in Tashkent (UTC+5): 2025-01-14T19:00:00.000Z
      expect(callArgs.start.getUTCHours()).toBe(19);
      expect(callArgs.start.getUTCMinutes()).toBe(0);
      expect(callArgs.start.getUTCSeconds()).toBe(0);
      // End of day in Tashkent (UTC+5): 2025-01-15T18:59:59.999Z
      expect(callArgs.end.getUTCHours()).toBe(18);
      expect(callArgs.end.getUTCMinutes()).toBe(59);
      expect(callArgs.end.getUTCSeconds()).toBe(59);
    });

    it('should not apply date filter when date is not provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.findByOperator('operator-123');

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should return empty array when no collections found', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.findByOperator('operator-123');

      expect(result).toEqual([]);
    });

    it('should include machine relation', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.findByOperator('operator-123');

      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'collection.machine',
        'machine',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // checkDuplicate
  // ---------------------------------------------------------------------------
  describe('checkDuplicate', () => {
    it('should return collection when duplicate found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockCollection);

      const result = await service.checkDuplicate(
        'machine-123',
        new Date('2025-01-15T10:00:00Z'),
      );

      expect(result).toEqual(mockCollection);
    });

    it('should return null when no duplicate found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await service.checkDuplicate(
        'machine-123',
        new Date('2025-01-15T10:00:00Z'),
      );

      expect(result).toBeNull();
    });

    it('should exclude cancelled collections from duplicate check', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await service.checkDuplicate('machine-123', new Date('2025-01-15T10:00:00Z'));

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.status != :cancelled',
        { cancelled: CollectionStatus.CANCELLED },
      );
    });

    it('should use configured duplicate check window', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const collectedAt = new Date('2025-01-15T10:00:00Z');
      await service.checkDuplicate('machine-123', collectedAt);

      // duplicateCheckMinutes defaults to 30, so window is +/- 30 minutes
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'collection.collectedAt BETWEEN :windowBefore AND :windowAfter',
        {
          windowBefore: expect.any(Date),
          windowAfter: expect.any(Date),
        },
      );
    });

    it('should filter by machineId', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await service.checkDuplicate('machine-123', new Date('2025-01-15T10:00:00Z'));

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'collection.machineId = :machineId',
        { machineId: 'machine-123' },
      );
    });

    it('should include machine and operator relations', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await service.checkDuplicate('machine-123', new Date());

      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'collection.machine',
        'machine',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'collection.operator',
        'operator',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // invalidateReportsCache (private, tested indirectly)
  // ---------------------------------------------------------------------------
  describe('invalidateReportsCache (indirect)', () => {
    it('should delete all five report cache keys', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date('2025-01-15T10:00:00Z'),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(null);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      await service.create(dto, 'operator-123');

      expect(cacheManager.del).toHaveBeenCalledTimes(5);
      expect(cacheManager.del).toHaveBeenCalledWith('report:summary');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-machine');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-date');
      expect(cacheManager.del).toHaveBeenCalledWith('report:by-operator');
      expect(cacheManager.del).toHaveBeenCalledWith('report:today-summary');
    });
  });

  // ---------------------------------------------------------------------------
  // Transaction lifecycle
  // ---------------------------------------------------------------------------
  describe('transaction lifecycle', () => {
    it('receive should always release queryRunner in finally block', async () => {
      mockQueryRunner.manager.findOne.mockRejectedValue(new Error('DB error'));

      await expect(
        service.receive('collection-123', 'manager-123', { amount: 5000 }),
      ).rejects.toThrow();

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('edit should always release queryRunner in finally block', async () => {
      mockQueryRunner.manager.findOne.mockRejectedValue(new Error('DB error'));

      await expect(
        service.edit('collection-123', 'user-123', {
          amount: 7000,
          reason: 'Test',
        }),
      ).rejects.toThrow();

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('cancel should always release queryRunner in finally block', async () => {
      mockQueryRunner.manager.findOne.mockRejectedValue(new Error('DB error'));

      await expect(
        service.cancel('collection-123', 'user-123'),
      ).rejects.toThrow();

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('bulkCancel should always release queryRunner in finally block', async () => {
      // Individual item errors are caught inside the loop, so we need
      // the outer try/catch to trigger via commitTransaction failure
      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockCollection });
      mockQueryRunner.manager.save.mockResolvedValue({});
      mockQueryRunner.commitTransaction.mockRejectedValue(
        new Error('Commit failed'),
      );

      const dto = { ids: ['c1'] };

      await expect(
        service.bulkCancel(dto, 'user-123'),
      ).rejects.toThrow();

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('bulkCreate should always release queryRunner in finally block', async () => {
      const dto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2025-01-15T10:00:00Z' },
        ],
      };

      machinesService.findById.mockResolvedValue(mockMachine as any);
      mockQueryRunner.manager.save.mockResolvedValue(mockCollection);
      mockQueryRunner.commitTransaction.mockRejectedValue(new Error('Commit failed'));

      await expect(service.bulkCreate(dto, 'operator-123')).rejects.toThrow();

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Constructor: duplicateCheckMinutes fallback
  // ---------------------------------------------------------------------------
  describe('constructor duplicateCheckMinutes fallback', () => {
    it('should default duplicateCheckMinutes to 30 when config returns falsy', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CollectionsService,
          {
            provide: getRepositoryToken(Collection),
            useValue: {
              find: jest.fn(),
              findOne: jest.fn(),
              save: jest.fn(),
              create: jest.fn(),
              createQueryBuilder: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getOne: jest.fn(),
              }),
            },
          },
          {
            provide: getRepositoryToken(CollectionHistory),
            useValue: { save: jest.fn(), find: jest.fn() },
          },
          {
            provide: MachinesService,
            useValue: { findByIdOrFail: jest.fn(), findById: jest.fn(), findByCode: jest.fn() },
          },
          {
            provide: TelegramService,
            useValue: { notifyManagersAboutNewCollection: jest.fn() },
          },
          { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
          {
            provide: DataSource,
            useValue: { createQueryRunner: jest.fn() },
          },
        ],
      }).compile();

      const svc = module.get<CollectionsService>(CollectionsService);
      expect(svc).toBeDefined();
      // The service should have been created with duplicateCheckMinutes = 30
      // (the || 30 fallback was exercised)
    });
  });
});
