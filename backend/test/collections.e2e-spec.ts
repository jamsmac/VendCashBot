import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { CollectionsController } from '../src/modules/collections/collections.controller';
import { CollectionsService } from '../src/modules/collections/collections.service';
import { Collection, CollectionStatus, CollectionSource } from '../src/modules/collections/entities/collection.entity';
import { CollectionHistory } from '../src/modules/collections/entities/collection-history.entity';
import { User, UserRole } from '../src/modules/users/entities/user.entity';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

describe('CollectionsController (e2e)', () => {
  let app: INestApplication;
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
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
    collectedAt: new Date('2024-01-15T10:00:00Z'),
    receivedAt: null,
    amount: null,
    status: CollectionStatus.COLLECTED,
    source: CollectionSource.REALTIME,
    notes: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    machine: mockMachine,
    operator: mockUser,
    manager: null,
  } as unknown as Collection;

  const mockReceivedCollection: Collection = {
    ...mockCollection,
    id: 'collection-456',
    status: CollectionStatus.RECEIVED,
    amount: 1500,
    managerId: 'manager-123',
    receivedAt: new Date('2024-01-15T12:00:00Z'),
    manager: mockManagerUser,
  } as unknown as Collection;

  // Mock guard that always allows access and sets user
  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = mockManagerUser; // Set as manager for role-protected routes
      return true;
    }),
  };

  const mockRolesGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    collectionsService = moduleFixture.get(CollectionsService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /collections', () => {
    it('should return all collections', async () => {
      const expectedResult = {
        data: [mockCollection, mockReceivedCollection],
        total: 2,
      };
      collectionsService.findAll.mockResolvedValue(expectedResult);

      const response = await request(app.getHttpServer())
        .get('/collections')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should filter collections by status', async () => {
      const expectedResult = {
        data: [mockCollection],
        total: 1,
      };
      collectionsService.findAll.mockResolvedValue(expectedResult);

      const response = await request(app.getHttpServer())
        .get('/collections')
        .query({ status: CollectionStatus.COLLECTED })
        .expect(200);

      expect(collectionsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: CollectionStatus.COLLECTED }),
      );
      expect(response.body.data).toHaveLength(1);
    });

    it('should support pagination', async () => {
      collectionsService.findAll.mockResolvedValue({ data: [], total: 100 });

      await request(app.getHttpServer())
        .get('/collections')
        .query({ page: 2, limit: 10 })
        .expect(200);

      expect(collectionsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 10 }),
      );
    });

    it('should filter by date range', async () => {
      collectionsService.findAll.mockResolvedValue({ data: [], total: 0 });

      await request(app.getHttpServer())
        .get('/collections')
        .query({ from: '2024-01-01', to: '2024-01-31' })
        .expect(200);

      expect(collectionsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2024-01-01', to: '2024-01-31' }),
      );
    });
  });

  describe('GET /collections/pending', () => {
    it('should return pending collections', async () => {
      collectionsService.findPending.mockResolvedValue([mockCollection]);

      const response = await request(app.getHttpServer())
        .get('/collections/pending')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBe(CollectionStatus.COLLECTED);
    });
  });

  describe('GET /collections/my', () => {
    it('should return current user collections', async () => {
      collectionsService.findByOperator.mockResolvedValue([mockCollection]);

      const response = await request(app.getHttpServer())
        .get('/collections/my')
        .expect(200);

      expect(response.body).toHaveLength(1);
    });

    it('should filter by date', async () => {
      collectionsService.findByOperator.mockResolvedValue([mockCollection]);

      await request(app.getHttpServer())
        .get('/collections/my')
        .query({ date: '2024-01-15' })
        .expect(200);

      expect(collectionsService.findByOperator).toHaveBeenCalledWith(
        mockManagerUser.id,
        expect.any(Date),
      );
    });
  });

  describe('GET /collections/:id', () => {
    it('should return a collection by ID', async () => {
      collectionsService.findByIdOrFail.mockResolvedValue(mockCollection);

      const response = await request(app.getHttpServer())
        .get('/collections/collection-123')
        .expect(200);

      expect(response.body.id).toBe('collection-123');
    });
  });

  describe('GET /collections/:id/history', () => {
    it('should return collection history', async () => {
      const mockHistory: CollectionHistory[] = [
        {
          id: 'history-1',
          collectionId: 'collection-123',
          changedById: 'manager-123',
          fieldName: 'amount',
          oldValue: '1000',
          newValue: '1500',
          reason: 'Correction',
          createdAt: new Date(),
          changedBy: mockManagerUser,
          collection: mockCollection,
        } as CollectionHistory,
      ];
      collectionsService.getHistory.mockResolvedValue(mockHistory);

      const response = await request(app.getHttpServer())
        .get('/collections/collection-123/history')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].fieldName).toBe('amount');
    });
  });

  describe('POST /collections', () => {
    const validMachineUuid = '550e8400-e29b-41d4-a716-446655440000';

    it('should create a collection', async () => {
      const createDto = {
        machineId: validMachineUuid,
        collectedAt: '2024-01-15T10:00:00Z',
      };
      collectionsService.create.mockResolvedValue(mockCollection);

      const response = await request(app.getHttpServer())
        .post('/collections')
        .send(createDto)
        .expect(201);

      expect(response.body.id).toBe('collection-123');
      expect(response.body.status).toBe(CollectionStatus.COLLECTED);
    });

    it('should create a collection with notes', async () => {
      const createDto = {
        machineId: validMachineUuid,
        collectedAt: '2024-01-15T10:00:00Z',
        notes: 'Test notes',
      };
      const collectionWithNotes = { ...mockCollection, notes: 'Test notes' };
      collectionsService.create.mockResolvedValue(collectionWithNotes as Collection);

      const response = await request(app.getHttpServer())
        .post('/collections')
        .send(createDto)
        .expect(201);

      expect(response.body.notes).toBe('Test notes');
    });

    it('should return 400 for invalid machineId', async () => {
      const createDto = {
        machineId: 'invalid-uuid',
        collectedAt: '2024-01-15T10:00:00Z',
      };

      await request(app.getHttpServer())
        .post('/collections')
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/collections')
        .send({})
        .expect(400);
    });
  });

  describe('POST /collections/bulk', () => {
    const validMachineUuid = '550e8400-e29b-41d4-a716-446655440000';

    it('should bulk create collections', async () => {
      const bulkDto = {
        collections: [
          { machineId: validMachineUuid, collectedAt: '2024-01-15', amount: 1000 },
          { machineCode: 'A02', collectedAt: '2024-01-16', amount: 1500 },
        ],
        source: CollectionSource.MANUAL_HISTORY,
      };
      const expectedResult = {
        created: 2,
        failed: 0,
        errors: [],
        collections: [mockCollection, mockReceivedCollection],
      };
      collectionsService.bulkCreate.mockResolvedValue(expectedResult);

      const response = await request(app.getHttpServer())
        .post('/collections/bulk')
        .send(bulkDto)
        .expect(201);

      expect(response.body.created).toBe(2);
      expect(response.body.failed).toBe(0);
    });
  });

  describe('PATCH /collections/:id/receive', () => {
    it('should receive a collection', async () => {
      const receiveDto = {
        amount: 1500,
      };
      collectionsService.receive.mockResolvedValue(mockReceivedCollection);

      const response = await request(app.getHttpServer())
        .patch('/collections/collection-123/receive')
        .send(receiveDto)
        .expect(200);

      expect(response.body.status).toBe(CollectionStatus.RECEIVED);
      expect(response.body.amount).toBe(1500);
    });

    it('should return 400 for negative amount', async () => {
      const receiveDto = {
        amount: -100,
      };

      await request(app.getHttpServer())
        .patch('/collections/collection-123/receive')
        .send(receiveDto)
        .expect(400);
    });

    it('should receive with notes', async () => {
      const receiveDto = {
        amount: 1500,
        notes: 'Extra coins found',
      };
      const collectionWithNotes = {
        ...mockReceivedCollection,
        notes: 'Extra coins found',
      };
      collectionsService.receive.mockResolvedValue(collectionWithNotes as Collection);

      const response = await request(app.getHttpServer())
        .patch('/collections/collection-123/receive')
        .send(receiveDto)
        .expect(200);

      expect(response.body.notes).toBe('Extra coins found');
    });
  });

  describe('PATCH /collections/:id/edit', () => {
    it('should edit a received collection', async () => {
      const editDto = {
        amount: 2000,
        reason: 'Recount showed different amount',
      };
      const editedCollection = { ...mockReceivedCollection, amount: 2000 };
      collectionsService.edit.mockResolvedValue(editedCollection as Collection);

      const response = await request(app.getHttpServer())
        .patch('/collections/collection-456/edit')
        .send(editDto)
        .expect(200);

      expect(response.body.amount).toBe(2000);
    });

    it('should return 400 for missing reason', async () => {
      const editDto = {
        amount: 2000,
      };

      await request(app.getHttpServer())
        .patch('/collections/collection-456/edit')
        .send(editDto)
        .expect(400);
    });
  });

  describe('PATCH /collections/:id/cancel', () => {
    it('should cancel a collection with reason', async () => {
      const cancelDto = {
        reason: 'Duplicate entry',
      };
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };
      collectionsService.cancel.mockResolvedValue(cancelledCollection as Collection);

      const response = await request(app.getHttpServer())
        .patch('/collections/collection-123/cancel')
        .send(cancelDto)
        .expect(200);

      expect(response.body.status).toBe(CollectionStatus.CANCELLED);
    });

    it('should cancel a collection without reason', async () => {
      const cancelledCollection = {
        ...mockCollection,
        status: CollectionStatus.CANCELLED,
      };
      collectionsService.cancel.mockResolvedValue(cancelledCollection as Collection);

      const response = await request(app.getHttpServer())
        .patch('/collections/collection-123/cancel')
        .send({})
        .expect(200);

      expect(response.body.status).toBe(CollectionStatus.CANCELLED);
    });
  });
});
