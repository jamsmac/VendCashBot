import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { MachinesController } from '../src/modules/machines/machines.controller';
import { MachinesService } from '../src/modules/machines/machines.service';
import { Machine, MachineStatus } from '../src/modules/machines/entities/machine.entity';
import { User, UserRole } from '../src/modules/users/entities/user.entity';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

describe('MachinesController (e2e)', () => {
  let app: INestApplication;
  let machinesService: jest.Mocked<MachinesService>;

  const mockAdminUser: User = {
    id: 'admin-123',
    telegramId: 111111111,
    telegramUsername: 'admin',
    telegramFirstName: 'Admin',
    name: 'Admin User',
    phone: '+1234567890',
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  } as User;

  const mockOperatorUser: User = {
    id: 'operator-123',
    telegramId: 222222222,
    telegramUsername: 'operator',
    telegramFirstName: 'Operator',
    name: 'Operator User',
    phone: '+0987654321',
    role: UserRole.OPERATOR,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  } as User;

  const mockMachine: Machine = {
    id: 'machine-123',
    code: 'A01',
    name: 'Test Machine',
    location: 'Test Location',
    isActive: true,
    status: MachineStatus.APPROVED,
    createdById: null,
    approvedById: null,
    approvedAt: null,
    rejectionReason: null,
    vhm24Id: null,
    vhm24SyncedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdBy: null,
    approvedBy: null,
  } as unknown as Machine;

  const mockPendingMachine: Machine = {
    ...mockMachine,
    id: 'pending-machine-123',
    code: 'B01',
    name: 'Pending Machine',
    status: MachineStatus.PENDING,
    createdById: 'operator-123',
    createdBy: mockOperatorUser,
  } as unknown as Machine;

  // Mock guard that always allows access and sets user
  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = mockAdminUser; // Set as admin for role-protected routes
      return true;
    }),
  };

  const mockRolesGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MachinesController],
      providers: [
        {
          provide: MachinesService,
          useValue: {
            findAll: jest.fn(),
            search: jest.fn(),
            findPending: jest.fn(),
            findByIdOrFail: jest.fn(),
            create: jest.fn(),
            createByOperator: jest.fn(),
            approve: jest.fn(),
            reject: jest.fn(),
            update: jest.fn(),
            deactivate: jest.fn(),
            activate: jest.fn(),
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

    machinesService = moduleFixture.get(MachinesService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /machines', () => {
    it('should return all active approved machines by default', async () => {
      machinesService.findAll.mockResolvedValue([mockMachine]);

      const response = await request(app.getHttpServer())
        .get('/machines')
        .expect(200);

      expect(machinesService.findAll).toHaveBeenCalledWith(true, true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].code).toBe('A01');
    });

    it('should include inactive machines when active=false', async () => {
      const inactiveMachine = { ...mockMachine, isActive: false };
      machinesService.findAll.mockResolvedValue([mockMachine, inactiveMachine] as Machine[]);

      await request(app.getHttpServer())
        .get('/machines')
        .query({ active: 'false' })
        .expect(200);

      expect(machinesService.findAll).toHaveBeenCalledWith(false, true);
    });

    it('should include unapproved machines when approved=false', async () => {
      machinesService.findAll.mockResolvedValue([mockMachine, mockPendingMachine] as Machine[]);

      await request(app.getHttpServer())
        .get('/machines')
        .query({ approved: 'false' })
        .expect(200);

      expect(machinesService.findAll).toHaveBeenCalledWith(true, false);
    });

    it('should search machines by query', async () => {
      machinesService.search.mockResolvedValue([mockMachine]);

      const response = await request(app.getHttpServer())
        .get('/machines')
        .query({ search: 'Test' })
        .expect(200);

      expect(machinesService.search).toHaveBeenCalledWith('Test', false);
      expect(response.body).toHaveLength(1);
    });

    it('should search with all statuses when approved=false', async () => {
      machinesService.search.mockResolvedValue([mockMachine, mockPendingMachine] as Machine[]);

      await request(app.getHttpServer())
        .get('/machines')
        .query({ search: 'Machine', approved: 'false' })
        .expect(200);

      expect(machinesService.search).toHaveBeenCalledWith('Machine', true);
    });
  });

  describe('GET /machines/pending', () => {
    it('should return pending machines', async () => {
      machinesService.findPending.mockResolvedValue([mockPendingMachine] as Machine[]);

      const response = await request(app.getHttpServer())
        .get('/machines/pending')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBe(MachineStatus.PENDING);
    });

    it('should return empty array when no pending machines', async () => {
      machinesService.findPending.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/machines/pending')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
  });

  describe('GET /machines/:id', () => {
    it('should return a machine by ID', async () => {
      machinesService.findByIdOrFail.mockResolvedValue(mockMachine);

      const response = await request(app.getHttpServer())
        .get('/machines/machine-123')
        .expect(200);

      expect(response.body.id).toBe('machine-123');
      expect(response.body.code).toBe('A01');
    });
  });

  describe('POST /machines', () => {
    it('should create a machine', async () => {
      const createDto = {
        code: 'C01',
        name: 'New Machine',
        location: 'New Location',
      };
      const newMachine = { ...mockMachine, ...createDto, id: 'new-machine-123' };
      machinesService.create.mockResolvedValue(newMachine as Machine);

      const response = await request(app.getHttpServer())
        .post('/machines')
        .send(createDto)
        .expect(201);

      expect(response.body.code).toBe('C01');
      expect(response.body.name).toBe('New Machine');
    });

    it('should create a machine without location', async () => {
      const createDto = {
        code: 'D01',
        name: 'Machine Without Location',
      };
      machinesService.create.mockResolvedValue({
        ...mockMachine,
        ...createDto,
        location: null,
      } as unknown as Machine);

      const response = await request(app.getHttpServer())
        .post('/machines')
        .send(createDto)
        .expect(201);

      expect(response.body.location).toBeNull();
    });

    it('should return 400 for missing code', async () => {
      const createDto = {
        name: 'Machine Without Code',
      };

      await request(app.getHttpServer())
        .post('/machines')
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for missing name', async () => {
      const createDto = {
        code: 'E01',
      };

      await request(app.getHttpServer())
        .post('/machines')
        .send(createDto)
        .expect(400);
    });

    it('should return 400 for code exceeding max length', async () => {
      const createDto = {
        code: 'A'.repeat(51), // Max is 50
        name: 'Test Machine',
      };

      await request(app.getHttpServer())
        .post('/machines')
        .send(createDto)
        .expect(400);
    });
  });

  describe('POST /machines/request', () => {
    it('should create a pending machine request', async () => {
      const createDto = {
        code: 'F01',
        name: 'Requested Machine',
      };
      machinesService.createByOperator.mockResolvedValue(mockPendingMachine);

      const response = await request(app.getHttpServer())
        .post('/machines/request')
        .send(createDto)
        .expect(201);

      expect(response.body.status).toBe(MachineStatus.PENDING);
    });
  });

  describe('POST /machines/:id/approve', () => {
    it('should approve a pending machine', async () => {
      const approvedMachine = {
        ...mockPendingMachine,
        status: MachineStatus.APPROVED,
        approvedById: mockAdminUser.id,
        approvedAt: new Date(),
      };
      machinesService.approve.mockResolvedValue(approvedMachine as Machine);

      const response = await request(app.getHttpServer())
        .post('/machines/pending-machine-123/approve')
        .expect(201);

      expect(response.body.status).toBe(MachineStatus.APPROVED);
      expect(response.body.approvedById).toBe(mockAdminUser.id);
    });
  });

  describe('POST /machines/:id/reject', () => {
    it('should reject a pending machine', async () => {
      const rejectDto = {
        reason: 'Duplicate machine',
      };
      const rejectedMachine = {
        ...mockPendingMachine,
        status: MachineStatus.REJECTED,
        approvedById: mockAdminUser.id,
        rejectionReason: rejectDto.reason,
      };
      machinesService.reject.mockResolvedValue(rejectedMachine as Machine);

      const response = await request(app.getHttpServer())
        .post('/machines/pending-machine-123/reject')
        .send(rejectDto)
        .expect(201);

      expect(response.body.status).toBe(MachineStatus.REJECTED);
      expect(response.body.rejectionReason).toBe('Duplicate machine');
    });

    it('should return 400 for missing reason', async () => {
      await request(app.getHttpServer())
        .post('/machines/pending-machine-123/reject')
        .send({})
        .expect(400);
    });

    it('should return 400 for empty reason', async () => {
      await request(app.getHttpServer())
        .post('/machines/pending-machine-123/reject')
        .send({ reason: '' })
        .expect(400);
    });
  });

  describe('PATCH /machines/:id', () => {
    it('should update a machine', async () => {
      const updateDto = {
        name: 'Updated Machine Name',
        location: 'Updated Location',
      };
      const updatedMachine = { ...mockMachine, ...updateDto };
      machinesService.update.mockResolvedValue(updatedMachine as Machine);

      const response = await request(app.getHttpServer())
        .patch('/machines/machine-123')
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe('Updated Machine Name');
      expect(response.body.location).toBe('Updated Location');
    });

    it('should update only code', async () => {
      const updateDto = { code: 'Z01' };
      const updatedMachine = { ...mockMachine, code: 'Z01' };
      machinesService.update.mockResolvedValue(updatedMachine as Machine);

      const response = await request(app.getHttpServer())
        .patch('/machines/machine-123')
        .send(updateDto)
        .expect(200);

      expect(response.body.code).toBe('Z01');
    });

    it('should update isActive status', async () => {
      const updateDto = { isActive: false };
      const updatedMachine = { ...mockMachine, isActive: false };
      machinesService.update.mockResolvedValue(updatedMachine as Machine);

      const response = await request(app.getHttpServer())
        .patch('/machines/machine-123')
        .send(updateDto)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });
  });

  describe('DELETE /machines/:id', () => {
    it('should deactivate a machine', async () => {
      const deactivatedMachine = { ...mockMachine, isActive: false };
      machinesService.deactivate.mockResolvedValue(deactivatedMachine as Machine);

      const response = await request(app.getHttpServer())
        .delete('/machines/machine-123')
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });
  });

  describe('POST /machines/:id/activate', () => {
    it('should activate a machine', async () => {
      const activatedMachine = { ...mockMachine, isActive: true };
      machinesService.activate.mockResolvedValue(activatedMachine as Machine);

      const response = await request(app.getHttpServer())
        .post('/machines/machine-123/activate')
        .expect(201);

      expect(response.body.isActive).toBe(true);
    });
  });
});
