import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { Machine, MachineStatus } from './entities/machine.entity';
import { MachineLocation } from './entities/machine-location.entity';

describe('MachinesService', () => {
  let service: MachinesService;
  let repository: jest.Mocked<Repository<Machine>>;

  const mockMachine = {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    approvedBy: null,
  } as unknown as Machine;

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MachinesService,
        {
          provide: getRepositoryToken(Machine),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(MachineLocation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                findOne: jest.fn(),
                save: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MachinesService>(MachinesService);
    repository = module.get(getRepositoryToken(Machine));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a machine', async () => {
      const dto = { code: 'B01', name: 'New Machine' };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({ ...mockMachine, ...dto } as Machine);
      repository.save.mockResolvedValue({ ...mockMachine, ...dto } as Machine);

      const result = await service.create(dto);

      expect(result.code).toBe('B01');
      expect(result.name).toBe('New Machine');
    });

    it('should throw ConflictException when code exists', async () => {
      const dto = { code: 'A01', name: 'Duplicate Machine' };

      repository.findOne.mockResolvedValue(mockMachine);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('createByOperator', () => {
    it('should create a pending machine', async () => {
      const dto = { code: 'C01', name: 'Operator Machine' };
      const pendingMachine = {
        ...mockMachine,
        ...dto,
        status: MachineStatus.PENDING,
        createdById: 'operator-123',
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(pendingMachine as Machine);
      repository.save.mockResolvedValue(pendingMachine as Machine);

      const result = await service.createByOperator(dto, 'operator-123');

      expect(result.status).toBe(MachineStatus.PENDING);
      expect(result.createdById).toBe('operator-123');
    });
  });

  describe('findById', () => {
    it('should return a machine', async () => {
      repository.findOne.mockResolvedValue(mockMachine);

      const result = await service.findById('machine-123');

      expect(result).toEqual(mockMachine);
    });

    it('should return null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByIdOrFail', () => {
    it('should return a machine when found', async () => {
      repository.findOne.mockResolvedValue(mockMachine);

      const result = await service.findByIdOrFail('machine-123');

      expect(result).toEqual(mockMachine);
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrFail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByCode', () => {
    it('should return a machine by code', async () => {
      repository.findOne.mockResolvedValue(mockMachine);

      const result = await service.findByCode('A01');

      expect(result).toEqual(mockMachine);
    });
  });

  describe('approve', () => {
    it('should approve a pending machine', async () => {
      const pendingMachine = { ...mockMachine, status: MachineStatus.PENDING };
      const approvedMachine = {
        ...pendingMachine,
        status: MachineStatus.APPROVED,
        approvedById: 'admin-123',
        approvedAt: expect.any(Date),
      };

      repository.findOne.mockResolvedValue(pendingMachine as Machine);
      repository.save.mockResolvedValue(approvedMachine as Machine);

      const result = await service.approve('machine-123', 'admin-123');

      expect(result.status).toBe(MachineStatus.APPROVED);
      expect(result.approvedById).toBe('admin-123');
    });

    it('should throw BadRequestException when not pending', async () => {
      repository.findOne.mockResolvedValue(mockMachine);

      await expect(service.approve('machine-123', 'admin-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending machine', async () => {
      const pendingMachine = { ...mockMachine, status: MachineStatus.PENDING };
      const rejectedMachine = {
        ...pendingMachine,
        status: MachineStatus.REJECTED,
        approvedById: 'admin-123',
        rejectionReason: 'Test reason',
      };

      repository.findOne.mockResolvedValue(pendingMachine as Machine);
      repository.save.mockResolvedValue(rejectedMachine as Machine);

      const result = await service.reject('machine-123', 'admin-123', 'Test reason');

      expect(result.status).toBe(MachineStatus.REJECTED);
      expect(result.rejectionReason).toBe('Test reason');
    });
  });

  describe('update', () => {
    it('should update a machine', async () => {
      const updateDto = { name: 'Updated Machine' };
      const updatedMachine = { ...mockMachine, ...updateDto };

      repository.findOne.mockResolvedValue(mockMachine);
      repository.save.mockResolvedValue(updatedMachine as Machine);

      const result = await service.update('machine-123', updateDto);

      expect(result.name).toBe('Updated Machine');
    });

    it('should throw ConflictException when updating to existing code', async () => {
      const updateDto = { code: 'B01' };
      const existingMachine = { ...mockMachine, id: 'other-id', code: 'B01' };

      repository.findOne
        .mockResolvedValueOnce(mockMachine)
        .mockResolvedValueOnce(existingMachine as Machine);

      await expect(service.update('machine-123', updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate a machine', async () => {
      const deactivatedMachine = { ...mockMachine, isActive: false };

      repository.findOne.mockResolvedValue(mockMachine);
      repository.save.mockResolvedValue(deactivatedMachine as Machine);

      const result = await service.deactivate('machine-123');

      expect(result.isActive).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate a machine', async () => {
      const inactiveMachine = { ...mockMachine, isActive: false };
      const activatedMachine = { ...inactiveMachine, isActive: true };

      repository.findOne.mockResolvedValue(inactiveMachine as Machine);
      repository.save.mockResolvedValue(activatedMachine as Machine);

      const result = await service.activate('machine-123');

      expect(result.isActive).toBe(true);
    });
  });

  describe('findPending', () => {
    it('should return pending machines', async () => {
      const pendingMachines = [{ ...mockMachine, status: MachineStatus.PENDING }];
      repository.find.mockResolvedValue(pendingMachines as Machine[]);

      const result = await service.findPending();

      expect(result).toEqual(pendingMachines);
      expect(repository.find).toHaveBeenCalledWith({
        where: { status: MachineStatus.PENDING },
        relations: ['createdBy'],
        order: { createdAt: 'DESC' },
      });
    });
  });
});
