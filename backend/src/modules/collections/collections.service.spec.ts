import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CollectionsService } from './collections.service';
import { Collection, CollectionStatus, CollectionSource } from './entities/collection.entity';
import { CollectionHistory } from './entities/collection-history.entity';
import { MachinesService } from '../machines/machines.service';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let collectionRepository: jest.Mocked<Repository<Collection>>;
  let historyRepository: jest.Mocked<Repository<CollectionHistory>>;
  let machinesService: jest.Mocked<MachinesService>;

  const mockMachine = {
    id: 'machine-123',
    code: 'A01',
    name: 'Test Machine',
    isActive: true,
  };

  const mockCollection = {
    id: 'collection-123',
    machineId: 'machine-123',
    operatorId: 'operator-123',
    managerId: null,
    collectedAt: new Date(),
    receivedAt: null,
    amount: null,
    status: CollectionStatus.COLLECTED,
    source: CollectionSource.REALTIME,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    machine: mockMachine,
    operator: null,
    manager: null,
  } as unknown as Collection;

  beforeEach(async () => {
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
            createQueryBuilder: jest.fn(),
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
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
    collectionRepository = module.get(getRepositoryToken(Collection));
    historyRepository = module.get(getRepositoryToken(CollectionHistory));
    machinesService = module.get(MachinesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a collection', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date(),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(null);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      expect(result).toEqual(mockCollection);
      expect(machinesService.findByIdOrFail).toHaveBeenCalledWith('machine-123');
      expect(collectionRepository.create).toHaveBeenCalled();
      expect(collectionRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException for duplicate collection', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date(),
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(mockCollection);

      await expect(service.create(dto, 'operator-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow duplicate with skipDuplicateCheck flag', async () => {
      const dto = {
        machineId: 'machine-123',
        collectedAt: new Date(),
        skipDuplicateCheck: true,
      };

      machinesService.findByIdOrFail.mockResolvedValue(mockMachine as any);
      collectionRepository.findOne.mockResolvedValue(mockCollection);
      collectionRepository.create.mockReturnValue(mockCollection);
      collectionRepository.save.mockResolvedValue(mockCollection);

      const result = await service.create(dto, 'operator-123');

      expect(result).toEqual(mockCollection);
    });
  });

  describe('findById', () => {
    it('should return a collection', async () => {
      collectionRepository.findOne.mockResolvedValue(mockCollection);

      const result = await service.findById('collection-123');

      expect(result).toEqual(mockCollection);
    });

    it('should return null when not found', async () => {
      collectionRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

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
  });

  describe('receive', () => {
    it('should receive a collection', async () => {
      const receivedCollection = {
        ...mockCollection,
        status: CollectionStatus.RECEIVED,
        amount: 1000,
        managerId: 'manager-123',
        receivedAt: expect.any(Date),
      };

      collectionRepository.findOne.mockResolvedValue(mockCollection);
      collectionRepository.save.mockResolvedValue(receivedCollection as Collection);

      const result = await service.receive('collection-123', 'manager-123', {
        amount: 1000,
      });

      expect(result.status).toBe(CollectionStatus.RECEIVED);
      expect(result.amount).toBe(1000);
      expect(result.managerId).toBe('manager-123');
    });

    it('should throw BadRequestException when collection not in collected status', async () => {
      const receivedCollection = {
        ...mockCollection,
        status: CollectionStatus.RECEIVED,
      };

      collectionRepository.findOne.mockResolvedValue(receivedCollection as Collection);

      await expect(
        service.receive('collection-123', 'manager-123', { amount: 1000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a collection', async () => {
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };

      collectionRepository.findOne.mockResolvedValue(mockCollection);
      collectionRepository.save.mockResolvedValue(cancelledCollection as Collection);
      historyRepository.save.mockResolvedValue({} as CollectionHistory);

      const result = await service.cancel('collection-123', 'user-123', 'Test reason');

      expect(result.status).toBe(CollectionStatus.CANCELLED);
      expect(historyRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when already cancelled', async () => {
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };

      collectionRepository.findOne.mockResolvedValue(cancelledCollection as Collection);

      await expect(
        service.cancel('collection-123', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

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
  });
});
