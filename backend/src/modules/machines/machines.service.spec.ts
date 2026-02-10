import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { MachinesService } from './machines.service';
import { Machine, MachineStatus } from './entities/machine.entity';
import { MachineLocation } from './entities/machine-location.entity';

describe('MachinesService', () => {
  let service: MachinesService;
  let machineRepository: jest.Mocked<Repository<Machine>>;
  let locationRepository: jest.Mocked<Repository<MachineLocation>>;

  // Factory functions that return fresh objects every time, preventing
  // cross-test mutation issues caused by Object.assign in the service.
  const createMockMachine = (overrides: Record<string, any> = {}): Machine =>
    ({
      id: 'machine-123',
      code: 'A01',
      name: 'Test Machine',
      location: 'Test Location',
      latitude: 55.7558,
      longitude: 37.6173,
      isActive: true,
      status: MachineStatus.APPROVED,
      createdById: null,
      approvedById: null,
      approvedAt: null,
      rejectionReason: null,
      vhm24Id: null,
      vhm24SyncedAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      createdBy: null,
      approvedBy: null,
      ...overrides,
    } as unknown as Machine);

  const createMockLocation = (overrides: Record<string, any> = {}): MachineLocation =>
    ({
      id: 'loc-123',
      machineId: 'machine-123',
      machine: null,
      address: '123 Test St',
      latitude: 55.7558,
      longitude: 37.6173,
      validFrom: new Date('2025-01-01'),
      validTo: null,
      isCurrent: true,
      createdAt: new Date('2025-01-01'),
      ...overrides,
    } as unknown as MachineLocation);

  // Machine query builder mock
  const mockMachineQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };

  // Location query builder mock
  const mockLocationQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  // QueryRunner mock
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      findOne: jest.Mock;
      save: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      remove: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    // Reset query builder mocks
    mockMachineQueryBuilder.andWhere.mockClear().mockReturnThis();
    mockMachineQueryBuilder.where.mockClear().mockReturnThis();
    mockMachineQueryBuilder.orderBy.mockClear().mockReturnThis();
    mockMachineQueryBuilder.getMany.mockReset();
    mockMachineQueryBuilder.getOne.mockReset();

    mockLocationQueryBuilder.andWhere.mockClear().mockReturnThis();
    mockLocationQueryBuilder.where.mockClear().mockReturnThis();
    mockLocationQueryBuilder.orderBy.mockClear().mockReturnThis();
    mockLocationQueryBuilder.getOne.mockReset();

    mockQueryRunner = {
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
        remove: jest.fn(),
        delete: jest.fn(),
      },
    };

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
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(mockMachineQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(MachineLocation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(mockLocationQueryBuilder),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<MachinesService>(MachinesService);
    machineRepository = module.get(getRepositoryToken(Machine));
    locationRepository = module.get(getRepositoryToken(MachineLocation));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // create
  // ===========================================================================
  describe('create', () => {
    it('should create a machine with APPROVED status', async () => {
      const dto = { code: 'B01', name: 'New Machine' };
      const createdMachine = createMockMachine({
        ...dto,
        status: MachineStatus.APPROVED,
      });

      machineRepository.findOne.mockResolvedValue(null);
      machineRepository.create.mockReturnValue(createdMachine);
      machineRepository.save.mockResolvedValue(createdMachine);

      const result = await service.create(dto);

      expect(result.code).toBe('B01');
      expect(result.name).toBe('New Machine');
      expect(result.status).toBe(MachineStatus.APPROVED);
      expect(machineRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'B01' },
      });
      expect(machineRepository.create).toHaveBeenCalledWith({
        ...dto,
        status: MachineStatus.APPROVED,
      });
      expect(machineRepository.save).toHaveBeenCalledWith(createdMachine);
    });

    it('should create a machine with optional fields', async () => {
      const dto = {
        code: 'B02',
        name: 'Full Machine',
        location: 'Building A',
        latitude: 40.7128,
        longitude: -74.006,
        isActive: false,
      };
      const createdMachine = createMockMachine({
        ...dto,
        status: MachineStatus.APPROVED,
      });

      machineRepository.findOne.mockResolvedValue(null);
      machineRepository.create.mockReturnValue(createdMachine);
      machineRepository.save.mockResolvedValue(createdMachine);

      const result = await service.create(dto);

      expect(machineRepository.create).toHaveBeenCalledWith({
        ...dto,
        status: MachineStatus.APPROVED,
      });
      expect(result).toEqual(createdMachine);
    });

    it('should throw ConflictException when code already exists', async () => {
      const dto = { code: 'A01', name: 'Duplicate Machine' };

      machineRepository.findOne.mockResolvedValue(createMockMachine());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        'Machine with this code already exists',
      );
      expect(machineRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate repository save errors', async () => {
      const dto = { code: 'B01', name: 'New Machine' };

      machineRepository.findOne.mockResolvedValue(null);
      machineRepository.create.mockReturnValue(createMockMachine(dto));
      machineRepository.save.mockRejectedValue(new Error('DB write error'));

      await expect(service.create(dto)).rejects.toThrow('DB write error');
    });
  });

  // ===========================================================================
  // createByOperator
  // ===========================================================================
  describe('createByOperator', () => {
    it('should create a machine with PENDING status and createdById', async () => {
      const dto = { code: 'C01', name: 'Operator Machine' };
      const userId = 'operator-123';
      const pendingMachine = createMockMachine({
        ...dto,
        status: MachineStatus.PENDING,
        createdById: userId,
      });

      machineRepository.findOne.mockResolvedValue(null);
      machineRepository.create.mockReturnValue(pendingMachine);
      machineRepository.save.mockResolvedValue(pendingMachine);

      const result = await service.createByOperator(dto, userId);

      expect(result.status).toBe(MachineStatus.PENDING);
      expect(result.createdById).toBe('operator-123');
      expect(machineRepository.create).toHaveBeenCalledWith({
        ...dto,
        status: MachineStatus.PENDING,
        createdById: userId,
      });
    });

    it('should throw ConflictException when code already exists', async () => {
      const dto = { code: 'A01', name: 'Duplicate' };

      machineRepository.findOne.mockResolvedValue(createMockMachine());

      await expect(
        service.createByOperator(dto, 'operator-123'),
      ).rejects.toThrow(ConflictException);
      expect(machineRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate repository errors', async () => {
      const dto = { code: 'C02', name: 'Machine' };

      machineRepository.findOne.mockResolvedValue(null);
      machineRepository.create.mockReturnValue(createMockMachine(dto));
      machineRepository.save.mockRejectedValue(new Error('Connection lost'));

      await expect(
        service.createByOperator(dto, 'operator-123'),
      ).rejects.toThrow('Connection lost');
    });
  });

  // ===========================================================================
  // findAll
  // ===========================================================================
  describe('findAll', () => {
    it('should return active approved machines by default', async () => {
      const machines = [createMockMachine()];
      mockMachineQueryBuilder.getMany.mockResolvedValue(machines);

      const result = await service.findAll();

      expect(result).toEqual(machines);
      expect(machineRepository.createQueryBuilder).toHaveBeenCalledWith(
        'machine',
      );
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.isActive = :isActive',
        { isActive: true },
      );
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.status = :status',
        { status: MachineStatus.APPROVED },
      );
      expect(mockMachineQueryBuilder.orderBy).toHaveBeenCalledWith(
        'machine.name',
        'ASC',
      );
    });

    it('should skip active filter when activeOnly is false', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(false, true);

      // Only the approved status filter should be applied, not isActive
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledTimes(1);
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.status = :status',
        { status: MachineStatus.APPROVED },
      );
    });

    it('should skip approved filter when approvedOnly is false', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(true, false);

      // Only the isActive filter should be applied, not status
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledTimes(1);
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should skip both filters when both are false', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(false, false);

      expect(mockMachineQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should return empty array when no machines exist', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // findAllActive
  // ===========================================================================
  describe('findAllActive', () => {
    it('should delegate to findAll with (true, true)', async () => {
      const machines = [createMockMachine()];
      mockMachineQueryBuilder.getMany.mockResolvedValue(machines);

      const result = await service.findAllActive();

      expect(result).toEqual(machines);
      // Verify both filters are applied
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.isActive = :isActive',
        { isActive: true },
      );
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.status = :status',
        { status: MachineStatus.APPROVED },
      );
    });
  });

  // ===========================================================================
  // findById
  // ===========================================================================
  describe('findById', () => {
    it('should return a machine when found', async () => {
      const machine = createMockMachine();
      machineRepository.findOne.mockResolvedValue(machine);

      const result = await service.findById('machine-123');

      expect(result).toEqual(machine);
      expect(machineRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'machine-123' },
      });
    });

    it('should return null when not found', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // findByIdOrFail
  // ===========================================================================
  describe('findByIdOrFail', () => {
    it('should return a machine when found', async () => {
      const machine = createMockMachine();
      machineRepository.findOne.mockResolvedValue(machine);

      const result = await service.findByIdOrFail('machine-123');

      expect(result).toEqual(machine);
    });

    it('should throw NotFoundException when not found', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrFail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByIdOrFail('non-existent')).rejects.toThrow(
        'Machine not found',
      );
    });
  });

  // ===========================================================================
  // findByIdWithCreator
  // ===========================================================================
  describe('findByIdWithCreator', () => {
    it('should return a machine with createdBy relation', async () => {
      const machineWithCreator = createMockMachine({
        createdBy: { id: 'user-1', name: 'Creator' },
      });
      machineRepository.findOne.mockResolvedValue(machineWithCreator);

      const result = await service.findByIdWithCreator('machine-123');

      expect(result).toEqual(machineWithCreator);
      expect(machineRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'machine-123' },
        relations: ['createdBy'],
      });
    });

    it('should throw NotFoundException when not found', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findByIdWithCreator('non-existent'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findByIdWithCreator('non-existent'),
      ).rejects.toThrow('Machine not found');
    });
  });

  // ===========================================================================
  // findByCode
  // ===========================================================================
  describe('findByCode', () => {
    it('should return a machine by code', async () => {
      const machine = createMockMachine();
      machineRepository.findOne.mockResolvedValue(machine);

      const result = await service.findByCode('A01');

      expect(result).toEqual(machine);
      expect(machineRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'A01' },
      });
    });

    it('should return null when code not found', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      const result = await service.findByCode('NONEXIST');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // findByCodeOrFail
  // ===========================================================================
  describe('findByCodeOrFail', () => {
    it('should return a machine when code found', async () => {
      const machine = createMockMachine();
      machineRepository.findOne.mockResolvedValue(machine);

      const result = await service.findByCodeOrFail('A01');

      expect(result).toEqual(machine);
    });

    it('should throw NotFoundException when code not found', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCodeOrFail('NONEXIST')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByCodeOrFail('NONEXIST')).rejects.toThrow(
        'Machine not found',
      );
    });
  });

  // ===========================================================================
  // findPending
  // ===========================================================================
  describe('findPending', () => {
    it('should return pending machines with createdBy relation ordered by createdAt DESC', async () => {
      const pendingMachines = [
        createMockMachine({ status: MachineStatus.PENDING }),
      ];
      machineRepository.find.mockResolvedValue(pendingMachines);

      const result = await service.findPending();

      expect(result).toEqual(pendingMachines);
      expect(machineRepository.find).toHaveBeenCalledWith({
        where: { status: MachineStatus.PENDING },
        relations: ['createdBy'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no pending machines', async () => {
      machineRepository.find.mockResolvedValue([]);

      const result = await service.findPending();

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // approve
  // ===========================================================================
  describe('approve', () => {
    it('should approve a pending machine', async () => {
      const pendingMachine = createMockMachine({
        status: MachineStatus.PENDING,
      });
      const approvedMachine = createMockMachine({
        status: MachineStatus.APPROVED,
        approvedById: 'admin-123',
        approvedAt: new Date(),
      });

      machineRepository.findOne.mockResolvedValue(pendingMachine);
      machineRepository.save.mockResolvedValue(approvedMachine);

      const result = await service.approve('machine-123', 'admin-123');

      expect(result.status).toBe(MachineStatus.APPROVED);
      expect(result.approvedById).toBe('admin-123');
      expect(machineRepository.save).toHaveBeenCalled();
      // Verify the machine object was mutated before save
      expect(pendingMachine.status).toBe(MachineStatus.APPROVED);
      expect(pendingMachine.approvedById).toBe('admin-123');
      expect(pendingMachine.approvedAt).toBeInstanceOf(Date);
    });

    it('should throw BadRequestException when machine is already APPROVED', async () => {
      machineRepository.findOne.mockResolvedValue(createMockMachine());

      await expect(
        service.approve('machine-123', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.approve('machine-123', 'admin-123'),
      ).rejects.toThrow('Machine is not pending approval');
      expect(machineRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when machine is REJECTED', async () => {
      machineRepository.findOne.mockResolvedValue(
        createMockMachine({ status: MachineStatus.REJECTED }),
      );

      await expect(
        service.approve('machine-123', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when machine does not exist', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(
        service.approve('non-existent', 'admin-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // reject
  // ===========================================================================
  describe('reject', () => {
    it('should reject a pending machine with a reason', async () => {
      const pendingMachine = createMockMachine({
        status: MachineStatus.PENDING,
      });
      const rejectedMachine = createMockMachine({
        status: MachineStatus.REJECTED,
        approvedById: 'admin-123',
        rejectionReason: 'Not valid',
      });

      machineRepository.findOne.mockResolvedValue(pendingMachine);
      machineRepository.save.mockResolvedValue(rejectedMachine);

      const result = await service.reject(
        'machine-123',
        'admin-123',
        'Not valid',
      );

      expect(result.status).toBe(MachineStatus.REJECTED);
      expect(result.rejectionReason).toBe('Not valid');
      // Verify the machine object was mutated
      expect(pendingMachine.status).toBe(MachineStatus.REJECTED);
      expect(pendingMachine.approvedById).toBe('admin-123');
      expect(pendingMachine.approvedAt).toBeInstanceOf(Date);
      expect(pendingMachine.rejectionReason).toBe('Not valid');
    });

    it('should throw BadRequestException when machine is not PENDING', async () => {
      machineRepository.findOne.mockResolvedValue(createMockMachine());

      await expect(
        service.reject('machine-123', 'admin-123', 'reason'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reject('machine-123', 'admin-123', 'reason'),
      ).rejects.toThrow('Machine is not pending approval');
    });

    it('should throw NotFoundException when machine does not exist', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(
        service.reject('non-existent', 'admin-123', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // update
  // ===========================================================================
  describe('update', () => {
    it('should update a machine without changing code', async () => {
      const updateDto = { name: 'Updated Name', location: 'New Location' };
      const machine = createMockMachine();
      const updatedMachine = createMockMachine(updateDto);

      machineRepository.findOne.mockResolvedValue(machine);
      machineRepository.save.mockResolvedValue(updatedMachine);

      const result = await service.update('machine-123', updateDto);

      expect(result.name).toBe('Updated Name');
      expect(result.location).toBe('New Location');
    });

    it('should update code when the new code does not exist', async () => {
      const updateDto = { code: 'Z99' };
      const machine = createMockMachine();
      const updatedMachine = createMockMachine({ code: 'Z99' });

      // First call: findByIdOrFail -> find by id
      // Second call: findByCode -> check code uniqueness
      machineRepository.findOne
        .mockResolvedValueOnce(machine)
        .mockResolvedValueOnce(null); // No existing machine with code Z99

      machineRepository.save.mockResolvedValue(updatedMachine);

      const result = await service.update('machine-123', updateDto);

      expect(result.code).toBe('Z99');
    });

    it('should throw ConflictException when updating to an existing code', async () => {
      const updateDto = { code: 'B01' };
      const machine = createMockMachine();
      const existingWithCode = createMockMachine({
        id: 'other-id',
        code: 'B01',
      });

      machineRepository.findOne
        .mockResolvedValueOnce(machine) // findByIdOrFail
        .mockResolvedValueOnce(existingWithCode); // findByCode

      await expect(
        service.update('machine-123', updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException with correct message when updating to an existing code', async () => {
      const updateDto = { code: 'B01' };
      const machine = createMockMachine();
      const existingWithCode = createMockMachine({
        id: 'other-id',
        code: 'B01',
      });

      machineRepository.findOne
        .mockResolvedValueOnce(machine)
        .mockResolvedValueOnce(existingWithCode);

      await expect(
        service.update('machine-123', updateDto),
      ).rejects.toThrow('Machine with this code already exists');
    });

    it('should allow updating with the same code (no change)', async () => {
      const updateDto = { code: 'A01' }; // same as default mock code
      const machine = createMockMachine();
      const updatedMachine = createMockMachine();

      machineRepository.findOne.mockResolvedValueOnce(machine);
      machineRepository.save.mockResolvedValue(updatedMachine);

      // code === machine.code, so no code uniqueness check is made
      const result = await service.update('machine-123', updateDto);

      expect(result).toEqual(updatedMachine);
      // findOne called only once for findByIdOrFail, not for code check
      expect(machineRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should skip code check when code is not provided in DTO', async () => {
      const updateDto = { name: 'Only Name' };
      const machine = createMockMachine();

      machineRepository.findOne.mockResolvedValue(machine);
      machineRepository.save.mockResolvedValue(
        createMockMachine({ name: 'Only Name' }),
      );

      await service.update('machine-123', updateDto);

      // Only one findOne call for findByIdOrFail
      expect(machineRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when machine does not exist', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // deactivate
  // ===========================================================================
  describe('deactivate', () => {
    it('should deactivate a machine', async () => {
      const machine = createMockMachine();
      const deactivatedMachine = createMockMachine({ isActive: false });

      machineRepository.findOne.mockResolvedValue(machine);
      machineRepository.save.mockResolvedValue(deactivatedMachine);

      const result = await service.deactivate('machine-123');

      expect(result.isActive).toBe(false);
      expect(machineRepository.save).toHaveBeenCalled();
    });

    it('should deactivate an already inactive machine (idempotent)', async () => {
      const inactiveMachine = createMockMachine({ isActive: false });

      machineRepository.findOne.mockResolvedValue(inactiveMachine);
      machineRepository.save.mockResolvedValue(inactiveMachine);

      const result = await service.deactivate('machine-123');

      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when machine does not exist', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivate('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================================================
  // activate
  // ===========================================================================
  describe('activate', () => {
    it('should activate an inactive machine', async () => {
      const inactiveMachine = createMockMachine({ isActive: false });
      const activatedMachine = createMockMachine({ isActive: true });

      machineRepository.findOne.mockResolvedValue(inactiveMachine);
      machineRepository.save.mockResolvedValue(activatedMachine);

      const result = await service.activate('machine-123');

      expect(result.isActive).toBe(true);
    });

    it('should activate an already active machine (idempotent)', async () => {
      const machine = createMockMachine(); // isActive: true by default
      machineRepository.findOne.mockResolvedValue(machine);
      machineRepository.save.mockResolvedValue(machine);

      const result = await service.activate('machine-123');

      expect(result.isActive).toBe(true);
    });

    it('should throw NotFoundException when machine does not exist', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(service.activate('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================================================
  // remove
  // ===========================================================================
  describe('remove', () => {
    it('should remove a machine and its locations in a transaction', async () => {
      const machine = createMockMachine();
      mockQueryRunner.manager.findOne.mockResolvedValue(machine);
      mockQueryRunner.manager.delete.mockResolvedValue(undefined);
      mockQueryRunner.manager.remove.mockResolvedValue(undefined);

      await service.remove('machine-123');

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(Machine, {
        where: { id: 'machine-123' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockQueryRunner.manager.delete).toHaveBeenCalledWith(
        MachineLocation,
        { machineId: 'machine-123' },
      );
      expect(mockQueryRunner.manager.remove).toHaveBeenCalledWith(machine);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException and rollback when machine not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove('non-existent')).rejects.toThrow(
        'Machine not found',
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback and re-throw on delete error', async () => {
      const dbError = new Error('FK constraint violation');
      mockQueryRunner.manager.findOne.mockResolvedValue(createMockMachine());
      mockQueryRunner.manager.delete.mockRejectedValue(dbError);

      await expect(service.remove('machine-123')).rejects.toThrow(
        'FK constraint violation',
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should release queryRunner even when rollback itself fails', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);
      mockQueryRunner.rollbackTransaction.mockRejectedValue(
        new Error('Rollback failed'),
      );

      await expect(service.remove('non-existent')).rejects.toThrow(
        'Rollback failed',
      );
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // search
  // ===========================================================================
  describe('search', () => {
    it('should search active approved machines by default', async () => {
      const machines = [createMockMachine()];
      mockMachineQueryBuilder.getMany.mockResolvedValue(machines);

      const result = await service.search('test');

      expect(result).toEqual(machines);
      expect(mockMachineQueryBuilder.where).toHaveBeenCalledWith(
        'machine.isActive = :isActive',
        { isActive: true },
      );
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.status = :status',
        { status: MachineStatus.APPROVED },
      );
      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(machine.code ILIKE :query OR machine.name ILIKE :query OR machine.location ILIKE :query)',
        { query: '%test%' },
      );
      expect(mockMachineQueryBuilder.orderBy).toHaveBeenCalledWith(
        'machine.name',
        'ASC',
      );
    });

    it('should include all statuses when includeAllStatuses is true', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      await service.search('test', true);

      // Should NOT add the status filter
      const statusCalls = mockMachineQueryBuilder.andWhere.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('machine.status'),
      );
      expect(statusCalls).toHaveLength(0);
    });

    it('should filter by approved status when includeAllStatuses is false (default)', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      await service.search('query', false);

      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        'machine.status = :status',
        { status: MachineStatus.APPROVED },
      );
    });

    it('should wrap query with wildcards for ILIKE search', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      await service.search('A01');

      expect(mockMachineQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(machine.code ILIKE :query OR machine.name ILIKE :query OR machine.location ILIKE :query)',
        { query: '%A01%' },
      );
    });

    it('should return empty array when no results found', async () => {
      mockMachineQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.search('nonexistent');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getLocations
  // ===========================================================================
  describe('getLocations', () => {
    it('should return locations for a machine ordered by validFrom DESC', async () => {
      const locations = [createMockLocation()];
      locationRepository.find.mockResolvedValue(locations);

      const result = await service.getLocations('machine-123');

      expect(result).toEqual(locations);
      expect(locationRepository.find).toHaveBeenCalledWith({
        where: { machineId: 'machine-123' },
        order: { validFrom: 'DESC' },
      });
    });

    it('should return empty array when no locations exist', async () => {
      locationRepository.find.mockResolvedValue([]);

      const result = await service.getLocations('machine-123');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getCurrentLocation
  // ===========================================================================
  describe('getCurrentLocation', () => {
    it('should return the current location for a machine', async () => {
      const location = createMockLocation();
      locationRepository.findOne.mockResolvedValue(location);

      const result = await service.getCurrentLocation('machine-123');

      expect(result).toEqual(location);
      expect(locationRepository.findOne).toHaveBeenCalledWith({
        where: { machineId: 'machine-123', isCurrent: true },
      });
    });

    it('should return null when no current location exists', async () => {
      locationRepository.findOne.mockResolvedValue(null);

      const result = await service.getCurrentLocation('machine-123');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getLocationForDate
  // ===========================================================================
  describe('getLocationForDate', () => {
    it('should return the location valid for a given date', async () => {
      const location = createMockLocation();
      mockLocationQueryBuilder.getOne.mockResolvedValue(location);

      const date = new Date('2025-06-15');
      const result = await service.getLocationForDate('machine-123', date);

      expect(result).toEqual(location);
      expect(locationRepository.createQueryBuilder).toHaveBeenCalledWith('loc');
      expect(mockLocationQueryBuilder.where).toHaveBeenCalledWith(
        'loc.machineId = :machineId',
        { machineId: 'machine-123' },
      );
      expect(mockLocationQueryBuilder.andWhere).toHaveBeenCalledWith(
        'loc.validFrom <= :date',
        { date: '2025-06-15' },
      );
      expect(mockLocationQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(loc.validTo IS NULL OR loc.validTo >= :date)',
        { date: '2025-06-15' },
      );
      expect(mockLocationQueryBuilder.orderBy).toHaveBeenCalledWith(
        'loc.validFrom',
        'DESC',
      );
    });

    it('should return null when no location is valid for the date', async () => {
      mockLocationQueryBuilder.getOne.mockResolvedValue(null);

      const result = await service.getLocationForDate(
        'machine-123',
        new Date('2020-01-01'),
      );

      expect(result).toBeNull();
    });

    it('should extract date string correctly from Date object', async () => {
      mockLocationQueryBuilder.getOne.mockResolvedValue(null);

      // Use a date that could have timezone issues
      await service.getLocationForDate(
        'machine-123',
        new Date('2025-12-31T23:59:59.999Z'),
      );

      expect(mockLocationQueryBuilder.andWhere).toHaveBeenCalledWith(
        'loc.validFrom <= :date',
        { date: '2025-12-31' },
      );
    });
  });

  // ===========================================================================
  // addLocation
  // ===========================================================================
  describe('addLocation', () => {
    const createLocationDto = {
      address: '456 New St',
      latitude: 40.7128,
      longitude: -74.006,
      validFrom: '2025-06-01',
      validTo: '2025-12-31',
      isCurrent: true,
    };

    it('should add a location and unset previous current locations when isCurrent is true', async () => {
      const savedLocation = createMockLocation({
        address: createLocationDto.address,
      });

      machineRepository.findOne.mockResolvedValue(createMockMachine()); // findByIdOrFail
      mockQueryRunner.manager.create.mockReturnValue(savedLocation);
      mockQueryRunner.manager.save.mockResolvedValue(savedLocation);

      const result = await service.addLocation('machine-123', createLocationDto);

      expect(result).toEqual(savedLocation);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      // Should unset previous current locations
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        MachineLocation,
        { machineId: 'machine-123', isCurrent: true },
        { isCurrent: false },
      );
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        MachineLocation,
        {
          machineId: 'machine-123',
          address: '456 New St',
          latitude: 40.7128,
          longitude: -74.006,
          validFrom: new Date('2025-06-01'),
          validTo: new Date('2025-12-31'),
          isCurrent: true,
        },
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should not unset previous current locations when isCurrent is false', async () => {
      const dto = { ...createLocationDto, isCurrent: false };

      machineRepository.findOne.mockResolvedValue(createMockMachine());
      mockQueryRunner.manager.create.mockReturnValue(createMockLocation());
      mockQueryRunner.manager.save.mockResolvedValue(createMockLocation());

      await service.addLocation('machine-123', dto);

      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();
    });

    it('should handle isCurrent as undefined (defaults to false)', async () => {
      const dto = {
        address: '789 St',
        validFrom: '2025-01-01',
      };

      machineRepository.findOne.mockResolvedValue(createMockMachine());
      mockQueryRunner.manager.create.mockReturnValue(createMockLocation());
      mockQueryRunner.manager.save.mockResolvedValue(createMockLocation());

      await service.addLocation('machine-123', dto);

      // isCurrent is falsy/undefined, so update should NOT be called
      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();
      // Should use false as default for isCurrent
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        MachineLocation,
        expect.objectContaining({
          isCurrent: false,
        }),
      );
    });

    it('should set validTo to null when not provided', async () => {
      const dto = {
        address: '789 St',
        validFrom: '2025-01-01',
      };

      machineRepository.findOne.mockResolvedValue(createMockMachine());
      mockQueryRunner.manager.create.mockReturnValue(createMockLocation());
      mockQueryRunner.manager.save.mockResolvedValue(createMockLocation());

      await service.addLocation('machine-123', dto);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        MachineLocation,
        expect.objectContaining({
          validTo: null,
        }),
      );
    });

    it('should throw NotFoundException when machine does not exist', async () => {
      machineRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addLocation('non-existent', createLocationDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback and re-throw on save error', async () => {
      machineRepository.findOne.mockResolvedValue(createMockMachine());
      mockQueryRunner.manager.create.mockReturnValue(createMockLocation());
      mockQueryRunner.manager.save.mockRejectedValue(
        new Error('Save failed'),
      );

      await expect(
        service.addLocation('machine-123', createLocationDto),
      ).rejects.toThrow('Save failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should release queryRunner even when rollback fails', async () => {
      machineRepository.findOne.mockResolvedValue(createMockMachine());
      mockQueryRunner.manager.create.mockReturnValue(createMockLocation());
      mockQueryRunner.manager.save.mockRejectedValue(new Error('Save failed'));
      mockQueryRunner.rollbackTransaction.mockRejectedValue(
        new Error('Rollback failed'),
      );

      await expect(
        service.addLocation('machine-123', createLocationDto),
      ).rejects.toThrow('Rollback failed');

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // updateLocation
  // ===========================================================================
  describe('updateLocation', () => {
    it('should update a location', async () => {
      const dto = { address: 'Updated Address' };
      const existingLocation = createMockLocation({ isCurrent: false });
      const updatedLocation = createMockLocation({
        isCurrent: false,
        address: 'Updated Address',
      });

      locationRepository.findOne.mockResolvedValue(existingLocation);
      locationRepository.save.mockResolvedValue(updatedLocation);

      const result = await service.updateLocation('loc-123', dto);

      expect(result.address).toBe('Updated Address');
    });

    it('should unset other current locations when setting isCurrent to true', async () => {
      const dto = { isCurrent: true };
      const existingLocation = createMockLocation({
        isCurrent: false,
        machineId: 'machine-123',
      });

      locationRepository.findOne.mockResolvedValue(existingLocation);
      locationRepository.save.mockResolvedValue(
        createMockLocation({ isCurrent: true }),
      );

      await service.updateLocation('loc-123', dto);

      expect(locationRepository.update).toHaveBeenCalledWith(
        { machineId: 'machine-123', isCurrent: true },
        { isCurrent: false },
      );
    });

    it('should not unset current locations when isCurrent is false in DTO', async () => {
      const dto = { isCurrent: false };

      locationRepository.findOne.mockResolvedValue(createMockLocation());
      locationRepository.save.mockResolvedValue(createMockLocation());

      await service.updateLocation('loc-123', dto);

      expect(locationRepository.update).not.toHaveBeenCalled();
    });

    it('should not unset current locations when location is already current and isCurrent is true', async () => {
      const dto = { isCurrent: true };
      const alreadyCurrent = createMockLocation({ isCurrent: true });

      locationRepository.findOne.mockResolvedValue(alreadyCurrent);
      locationRepository.save.mockResolvedValue(alreadyCurrent);

      await service.updateLocation('loc-123', dto);

      // dto.isCurrent is true but location.isCurrent is already true => skip update
      expect(locationRepository.update).not.toHaveBeenCalled();
    });

    it('should not unset current locations when isCurrent is not provided in DTO', async () => {
      const dto = { address: 'Only Address' };

      locationRepository.findOne.mockResolvedValue(createMockLocation());
      locationRepository.save.mockResolvedValue(createMockLocation());

      await service.updateLocation('loc-123', dto);

      expect(locationRepository.update).not.toHaveBeenCalled();
    });

    it('should convert validFrom string to Date', async () => {
      const dto = { validFrom: '2025-07-01' };
      const existingLocation = createMockLocation();

      locationRepository.findOne.mockResolvedValue(existingLocation);
      locationRepository.save.mockImplementation(async (loc) => loc as MachineLocation);

      await service.updateLocation('loc-123', dto);

      // The Object.assign should have set validFrom to a new Date
      expect(existingLocation.validFrom).toEqual(new Date('2025-07-01'));
    });

    it('should convert validTo string to Date', async () => {
      const dto = { validTo: '2025-12-31' };
      const existingLocation = createMockLocation();

      locationRepository.findOne.mockResolvedValue(existingLocation);
      locationRepository.save.mockImplementation(async (loc) => loc as MachineLocation);

      await service.updateLocation('loc-123', dto);

      expect(existingLocation.validTo).toEqual(new Date('2025-12-31'));
    });

    it('should keep existing validFrom when not provided in DTO', async () => {
      const dto = { address: 'Only address change' };
      const originalValidFrom = new Date('2025-01-01');
      const existingLocation = createMockLocation({
        validFrom: originalValidFrom,
      });

      locationRepository.findOne.mockResolvedValue(existingLocation);
      locationRepository.save.mockImplementation(async (loc) => loc as MachineLocation);

      await service.updateLocation('loc-123', dto);

      // validFrom should remain as the original date since dto.validFrom is falsy
      expect(existingLocation.validFrom).toEqual(originalValidFrom);
    });

    it('should keep existing validTo when not provided in DTO', async () => {
      const dto = { address: 'Only address change' };
      const originalValidTo = new Date('2025-12-31');
      const existingLocation = createMockLocation({
        validTo: originalValidTo,
      });

      locationRepository.findOne.mockResolvedValue(existingLocation);
      locationRepository.save.mockImplementation(async (loc) => loc as MachineLocation);

      await service.updateLocation('loc-123', dto);

      expect(existingLocation.validTo).toEqual(originalValidTo);
    });

    it('should throw NotFoundException when location not found', async () => {
      locationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateLocation('non-existent', { address: 'Test' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateLocation('non-existent', { address: 'Test' }),
      ).rejects.toThrow('Location not found');
    });
  });

  // ===========================================================================
  // deleteLocation
  // ===========================================================================
  describe('deleteLocation', () => {
    it('should delete a location', async () => {
      const location = createMockLocation();
      locationRepository.findOne.mockResolvedValue(location);
      locationRepository.remove.mockResolvedValue(location);

      await service.deleteLocation('loc-123');

      expect(locationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'loc-123' },
      });
      expect(locationRepository.remove).toHaveBeenCalledWith(location);
    });

    it('should throw NotFoundException when location not found', async () => {
      locationRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteLocation('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deleteLocation('non-existent')).rejects.toThrow(
        'Location not found',
      );
    });

    it('should propagate repository remove errors', async () => {
      locationRepository.findOne.mockResolvedValue(createMockLocation());
      locationRepository.remove.mockRejectedValue(
        new Error('Remove failed'),
      );

      await expect(service.deleteLocation('loc-123')).rejects.toThrow(
        'Remove failed',
      );
    });
  });

  // ===========================================================================
  // setCurrentLocation
  // ===========================================================================
  describe('setCurrentLocation', () => {
    it('should set a location as current and unset others', async () => {
      const location = createMockLocation({
        isCurrent: false,
        machineId: 'machine-123',
      });
      const updatedLocation = createMockLocation({
        isCurrent: true,
        machineId: 'machine-123',
      });

      mockQueryRunner.manager.findOne.mockResolvedValue(location);
      mockQueryRunner.manager.save.mockResolvedValue(updatedLocation);

      const result = await service.setCurrentLocation('loc-123');

      expect(result.isCurrent).toBe(true);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(
        MachineLocation,
        { where: { id: 'loc-123' } },
      );
      // Unset all locations for this machine
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        MachineLocation,
        { machineId: 'machine-123' },
        { isCurrent: false },
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException and rollback when location not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(
        service.setCurrentLocation('non-existent'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.setCurrentLocation('non-existent'),
      ).rejects.toThrow('Location not found');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback and re-throw on update error', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(createMockLocation());
      mockQueryRunner.manager.update.mockRejectedValue(
        new Error('Update failed'),
      );

      await expect(
        service.setCurrentLocation('loc-123'),
      ).rejects.toThrow('Update failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback and re-throw on save error', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(createMockLocation());
      mockQueryRunner.manager.update.mockResolvedValue(undefined);
      mockQueryRunner.manager.save.mockRejectedValue(
        new Error('Save failed'),
      );

      await expect(
        service.setCurrentLocation('loc-123'),
      ).rejects.toThrow('Save failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should release queryRunner even when rollback itself fails', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);
      mockQueryRunner.rollbackTransaction.mockRejectedValue(
        new Error('Rollback failed'),
      );

      await expect(
        service.setCurrentLocation('non-existent'),
      ).rejects.toThrow('Rollback failed');

      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
