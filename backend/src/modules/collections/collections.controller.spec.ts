import { Test, TestingModule } from '@nestjs/testing';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { Collection, CollectionStatus, CollectionSource } from './entities/collection.entity';
import { CollectionHistory } from './entities/collection-history.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReceiveCollectionDto } from './dto/receive-collection.dto';
import { EditCollectionDto } from './dto/edit-collection.dto';
import { CancelCollectionDto } from './dto/cancel-collection.dto';
import { BulkCreateCollectionDto } from './dto/bulk-create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';

describe('CollectionsController', () => {
  let controller: CollectionsController;
  let collectionsService: jest.Mocked<CollectionsService>;

  const mockUser: User = {
    id: 'user-123',
    telegramId: 123456789,
    telegramUsername: 'testuser',
    telegramFirstName: 'Test',
    name: 'Test User',
    phone: '+1234567890',
    role: UserRole.OPERATOR,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const mockManagerUser: User = {
    ...mockUser,
    id: 'manager-123',
    role: UserRole.MANAGER,
  } as User;

  const mockMachine = {
    id: 'machine-123',
    code: 'A01',
    name: 'Test Machine',
    isActive: true,
  };

  const mockCollection: Collection = {
    id: 'collection-123',
    machineId: 'machine-123',
    operatorId: 'user-123',
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
    operator: mockUser,
    manager: null,
  } as unknown as Collection;

  const mockReceivedCollection: Collection = {
    ...mockCollection,
    status: CollectionStatus.RECEIVED,
    amount: 1000,
    managerId: 'manager-123',
    receivedAt: new Date(),
    manager: mockManagerUser,
  } as unknown as Collection;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            findAll: jest.fn(),
            findPending: jest.fn(),
            findByOperator: jest.fn(),
            findByIdOrFail: jest.fn(),
            getHistory: jest.fn(),
            create: jest.fn(),
            bulkCreate: jest.fn(),
            receive: jest.fn(),
            edit: jest.fn(),
            cancel: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CollectionsController>(CollectionsController);
    collectionsService = module.get(CollectionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all collections with filters', async () => {
      const query: CollectionQueryDto = {
        status: CollectionStatus.COLLECTED,
        page: 1,
        limit: 10,
      };
      const expectedResult = {
        data: [mockCollection],
        total: 1,
      };
      collectionsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(collectionsService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });

    it('should return collections without filters', async () => {
      const query: CollectionQueryDto = {};
      const expectedResult = {
        data: [mockCollection, mockReceivedCollection],
        total: 2,
      };
      collectionsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(collectionsService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });

    it('should handle date range filters', async () => {
      const query: CollectionQueryDto = {
        from: '2024-01-01',
        to: '2024-12-31',
      };
      collectionsService.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.findAll(query);

      expect(collectionsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findPending', () => {
    it('should return pending collections', async () => {
      const pendingCollections = [mockCollection];
      collectionsService.findPending.mockResolvedValue(pendingCollections);

      const result = await controller.findPending();

      expect(collectionsService.findPending).toHaveBeenCalled();
      expect(result).toEqual(pendingCollections);
    });

    it('should return empty array when no pending collections', async () => {
      collectionsService.findPending.mockResolvedValue([]);

      const result = await controller.findPending();

      expect(result).toEqual([]);
    });
  });

  describe('findMy', () => {
    it('should return current user collections for today', async () => {
      const collections = [mockCollection];
      collectionsService.findByOperator.mockResolvedValue(collections);

      const result = await controller.findMy(mockUser, undefined);

      expect(collectionsService.findByOperator).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(Date),
      );
      expect(result).toEqual(collections);
    });

    it('should return current user collections for specific date', async () => {
      const collections = [mockCollection];
      const dateString = '2024-06-15';
      collectionsService.findByOperator.mockResolvedValue(collections);

      const result = await controller.findMy(mockUser, dateString);

      expect(collectionsService.findByOperator).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(Date),
      );
      expect(result).toEqual(collections);
    });
  });

  describe('findOne', () => {
    it('should return a collection by ID', async () => {
      collectionsService.findByIdOrFail.mockResolvedValue(mockCollection);

      const result = await controller.findOne('collection-123');

      expect(collectionsService.findByIdOrFail).toHaveBeenCalledWith('collection-123');
      expect(result).toEqual(mockCollection);
    });
  });

  describe('getHistory', () => {
    it('should return collection history', async () => {
      const mockHistory: CollectionHistory[] = [
        {
          id: 'history-1',
          collectionId: 'collection-123',
          changedById: 'user-123',
          fieldName: 'amount',
          oldValue: '1000',
          newValue: '1500',
          reason: 'Correction',
          createdAt: new Date(),
          changedBy: mockUser,
          collection: mockCollection,
        } as CollectionHistory,
      ];
      collectionsService.getHistory.mockResolvedValue(mockHistory);

      const result = await controller.getHistory('collection-123');

      expect(collectionsService.getHistory).toHaveBeenCalledWith('collection-123');
      expect(result).toEqual(mockHistory);
    });

    it('should return empty array when no history', async () => {
      collectionsService.getHistory.mockResolvedValue([]);

      const result = await controller.getHistory('collection-123');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a collection', async () => {
      const dto: CreateCollectionDto = {
        machineId: 'machine-123',
        collectedAt: new Date(),
      };
      collectionsService.create.mockResolvedValue(mockCollection);

      const result = await controller.create(dto, mockUser);

      expect(collectionsService.create).toHaveBeenCalledWith(dto, mockUser.id);
      expect(result).toEqual(mockCollection);
    });

    it('should create a collection with notes', async () => {
      const dto: CreateCollectionDto = {
        machineId: 'machine-123',
        collectedAt: new Date(),
        notes: 'Test notes',
      };
      const collectionWithNotes = { ...mockCollection, notes: 'Test notes' };
      collectionsService.create.mockResolvedValue(collectionWithNotes as Collection);

      const result = await controller.create(dto, mockUser);

      expect(collectionsService.create).toHaveBeenCalledWith(dto, mockUser.id);
      expect(result.notes).toBe('Test notes');
    });

    it('should create a collection with specific source', async () => {
      const dto: CreateCollectionDto = {
        machineId: 'machine-123',
        collectedAt: new Date(),
        source: CollectionSource.MANUAL_HISTORY,
      };
      collectionsService.create.mockResolvedValue(mockCollection);

      await controller.create(dto, mockUser);

      expect(collectionsService.create).toHaveBeenCalledWith(dto, mockUser.id);
    });
  });

  describe('bulkCreate', () => {
    it('should bulk create collections', async () => {
      const dto: BulkCreateCollectionDto = {
        collections: [
          {
            machineId: 'machine-123',
            collectedAt: '2024-01-15',
            amount: 1000,
          },
          {
            machineCode: 'A02',
            collectedAt: '2024-01-16',
            amount: 1500,
          },
        ],
        source: CollectionSource.MANUAL_HISTORY,
      };
      const expectedResult = {
        created: 2,
        failed: 0,
        errors: [],
        collections: [mockCollection, mockCollection],
      };
      collectionsService.bulkCreate.mockResolvedValue(expectedResult);

      const result = await controller.bulkCreate(dto, mockManagerUser);

      expect(collectionsService.bulkCreate).toHaveBeenCalledWith(dto, mockManagerUser.id);
      expect(result).toEqual(expectedResult);
    });

    it('should handle partial bulk create failures', async () => {
      const dto: BulkCreateCollectionDto = {
        collections: [
          { machineId: 'machine-123', collectedAt: '2024-01-15' },
          { machineId: 'invalid-id', collectedAt: '2024-01-16' },
        ],
      };
      const expectedResult = {
        created: 1,
        failed: 1,
        errors: [{ index: 1, error: 'Machine not found' }],
        collections: [mockCollection],
      };
      collectionsService.bulkCreate.mockResolvedValue(expectedResult);

      const result = await controller.bulkCreate(dto, mockManagerUser);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('receive', () => {
    it('should receive a collection', async () => {
      const dto: ReceiveCollectionDto = {
        amount: 1000,
      };
      collectionsService.receive.mockResolvedValue(mockReceivedCollection);

      const result = await controller.receive('collection-123', dto, mockManagerUser);

      expect(collectionsService.receive).toHaveBeenCalledWith(
        'collection-123',
        mockManagerUser.id,
        dto,
      );
      expect(result.status).toBe(CollectionStatus.RECEIVED);
      expect(result.amount).toBe(1000);
    });

    it('should receive a collection with notes', async () => {
      const dto: ReceiveCollectionDto = {
        amount: 1500,
        notes: 'Received with extra coins',
      };
      const collectionWithNotes = {
        ...mockReceivedCollection,
        amount: 1500,
        notes: 'Received with extra coins',
      };
      collectionsService.receive.mockResolvedValue(collectionWithNotes as Collection);

      const result = await controller.receive('collection-123', dto, mockManagerUser);

      expect(result.notes).toBe('Received with extra coins');
    });
  });

  describe('edit', () => {
    it('should edit a received collection', async () => {
      const dto: EditCollectionDto = {
        amount: 1500,
        reason: 'Miscounted',
      };
      const editedCollection = { ...mockReceivedCollection, amount: 1500 };
      collectionsService.edit.mockResolvedValue(editedCollection as Collection);

      const result = await controller.edit('collection-123', dto, mockManagerUser);

      expect(collectionsService.edit).toHaveBeenCalledWith(
        'collection-123',
        mockManagerUser.id,
        dto,
      );
      expect(result.amount).toBe(1500);
    });
  });

  describe('cancel', () => {
    it('should cancel a collection', async () => {
      const dto: CancelCollectionDto = {
        reason: 'Duplicate entry',
      };
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };
      collectionsService.cancel.mockResolvedValue(cancelledCollection as Collection);

      const result = await controller.cancel('collection-123', dto, mockManagerUser);

      expect(collectionsService.cancel).toHaveBeenCalledWith(
        'collection-123',
        mockManagerUser.id,
        dto.reason,
      );
      expect(result.status).toBe(CollectionStatus.CANCELLED);
    });

    it('should cancel a collection without reason', async () => {
      const dto: CancelCollectionDto = {};
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };
      collectionsService.cancel.mockResolvedValue(cancelledCollection as Collection);

      await controller.cancel('collection-123', dto, mockManagerUser);

      expect(collectionsService.cancel).toHaveBeenCalledWith(
        'collection-123',
        mockManagerUser.id,
        undefined,
      );
    });
  });
});
