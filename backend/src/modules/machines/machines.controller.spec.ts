import { Test, TestingModule } from '@nestjs/testing';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';
import { Machine, MachineStatus } from './entities/machine.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { RejectMachineDto } from './dto/reject-machine.dto';
import {
  CreateMachineLocationDto,
  UpdateMachineLocationDto,
} from './dto/machine-location.dto';
import { MachineLocation } from './entities/machine-location.entity';

describe('MachinesController', () => {
  let controller: MachinesController;
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
    createdAt: new Date(),
    updatedAt: new Date(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            getLocations: jest.fn(),
            getCurrentLocation: jest.fn(),
            getLocationForDate: jest.fn(),
            addLocation: jest.fn(),
            updateLocation: jest.fn(),
            deleteLocation: jest.fn(),
            setCurrentLocation: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MachinesController>(MachinesController);
    machinesService = module.get(MachinesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all active approved machines by default', async () => {
      const machines = [mockMachine];
      machinesService.findAll.mockResolvedValue(machines);

      const result = await controller.findAll(undefined, undefined, undefined);

      expect(machinesService.findAll).toHaveBeenCalledWith(true, true);
      expect(result).toEqual(machines);
    });

    it('should return all machines when active is false', async () => {
      const machines = [mockMachine, { ...mockMachine, isActive: false }];
      machinesService.findAll.mockResolvedValue(machines as Machine[]);

      const result = await controller.findAll('false', undefined, undefined);

      expect(machinesService.findAll).toHaveBeenCalledWith(false, true);
      expect(result).toEqual(machines);
    });

    it('should return all machines including unapproved when approved is false', async () => {
      const machines = [mockMachine, mockPendingMachine];
      machinesService.findAll.mockResolvedValue(machines as Machine[]);

      const result = await controller.findAll(undefined, undefined, 'false');

      expect(machinesService.findAll).toHaveBeenCalledWith(true, false);
      expect(result).toEqual(machines);
    });

    it('should search machines when search query is provided', async () => {
      const machines = [mockMachine];
      machinesService.search.mockResolvedValue(machines);

      const result = await controller.findAll(undefined, 'Test', undefined);

      expect(machinesService.search).toHaveBeenCalledWith('Test', false);
      expect(result).toEqual(machines);
    });

    it('should search machines including all statuses when approved is false', async () => {
      const machines = [mockMachine, mockPendingMachine];
      machinesService.search.mockResolvedValue(machines as Machine[]);

      const result = await controller.findAll(undefined, 'Machine', 'false');

      expect(machinesService.search).toHaveBeenCalledWith('Machine', true);
      expect(result).toEqual(machines);
    });
  });

  describe('getPending', () => {
    it('should return pending machines', async () => {
      const pendingMachines = [mockPendingMachine];
      machinesService.findPending.mockResolvedValue(pendingMachines as Machine[]);

      const result = await controller.getPending();

      expect(machinesService.findPending).toHaveBeenCalled();
      expect(result).toEqual(pendingMachines);
    });

    it('should return empty array when no pending machines', async () => {
      machinesService.findPending.mockResolvedValue([]);

      const result = await controller.getPending();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a machine by ID', async () => {
      machinesService.findByIdOrFail.mockResolvedValue(mockMachine);

      const result = await controller.findOne('machine-123');

      expect(machinesService.findByIdOrFail).toHaveBeenCalledWith('machine-123');
      expect(result).toEqual(mockMachine);
    });
  });

  describe('create', () => {
    it('should create a machine (admin only)', async () => {
      const dto: CreateMachineDto = {
        code: 'C01',
        name: 'New Machine',
        location: 'New Location',
      };
      const newMachine = {
        ...mockMachine,
        id: 'new-machine-123',
        ...dto,
      };
      machinesService.create.mockResolvedValue(newMachine as Machine);

      const result = await controller.create(dto);

      expect(machinesService.create).toHaveBeenCalledWith(dto);
      expect(result.code).toBe('C01');
      expect(result.name).toBe('New Machine');
    });

    it('should create a machine without location', async () => {
      const dto: CreateMachineDto = {
        code: 'D01',
        name: 'Machine Without Location',
      };
      machinesService.create.mockResolvedValue({
        ...mockMachine,
        ...dto,
        location: null as unknown as string,
      } as Machine);

      const result = await controller.create(dto);

      expect(machinesService.create).toHaveBeenCalledWith(dto);
      expect(result.location).toBeNull();
    });
  });

  describe('requestMachine', () => {
    it('should create a pending machine request by operator', async () => {
      const dto: CreateMachineDto = {
        code: 'E01',
        name: 'Requested Machine',
        location: 'Some Location',
      };
      machinesService.createByOperator.mockResolvedValue(mockPendingMachine);

      const result = await controller.requestMachine(dto, mockOperatorUser);

      expect(machinesService.createByOperator).toHaveBeenCalledWith(dto, mockOperatorUser.id);
      expect(result.status).toBe(MachineStatus.PENDING);
    });

    it('should set createdById to requesting user', async () => {
      const dto: CreateMachineDto = {
        code: 'F01',
        name: 'Another Machine',
      };
      const pendingMachine = {
        ...mockPendingMachine,
        createdById: mockOperatorUser.id,
      };
      machinesService.createByOperator.mockResolvedValue(pendingMachine as Machine);

      const result = await controller.requestMachine(dto, mockOperatorUser);

      expect(machinesService.createByOperator).toHaveBeenCalledWith(dto, mockOperatorUser.id);
      expect(result.createdById).toBe(mockOperatorUser.id);
    });
  });

  describe('approve', () => {
    it('should approve a pending machine', async () => {
      const approvedMachine = {
        ...mockPendingMachine,
        status: MachineStatus.APPROVED,
        approvedById: mockAdminUser.id,
        approvedAt: new Date(),
      };
      machinesService.approve.mockResolvedValue(approvedMachine as Machine);

      const result = await controller.approve('pending-machine-123', mockAdminUser);

      expect(machinesService.approve).toHaveBeenCalledWith(
        'pending-machine-123',
        mockAdminUser.id,
      );
      expect(result.status).toBe(MachineStatus.APPROVED);
      expect(result.approvedById).toBe(mockAdminUser.id);
    });
  });

  describe('reject', () => {
    it('should reject a pending machine with reason', async () => {
      const dto: RejectMachineDto = {
        reason: 'Duplicate machine',
      };
      const rejectedMachine = {
        ...mockPendingMachine,
        status: MachineStatus.REJECTED,
        approvedById: mockAdminUser.id,
        rejectionReason: dto.reason,
      };
      machinesService.reject.mockResolvedValue(rejectedMachine as Machine);

      const result = await controller.reject('pending-machine-123', dto, mockAdminUser);

      expect(machinesService.reject).toHaveBeenCalledWith(
        'pending-machine-123',
        mockAdminUser.id,
        dto.reason,
      );
      expect(result.status).toBe(MachineStatus.REJECTED);
      expect(result.rejectionReason).toBe('Duplicate machine');
    });
  });

  describe('update', () => {
    it('should update a machine', async () => {
      const dto: UpdateMachineDto = {
        name: 'Updated Machine Name',
        location: 'Updated Location',
      };
      const updatedMachine = {
        ...mockMachine,
        ...dto,
      };
      machinesService.update.mockResolvedValue(updatedMachine as Machine);

      const result = await controller.update('machine-123', dto);

      expect(machinesService.update).toHaveBeenCalledWith('machine-123', dto);
      expect(result.name).toBe('Updated Machine Name');
      expect(result.location).toBe('Updated Location');
    });

    it('should update machine code', async () => {
      const dto: UpdateMachineDto = {
        code: 'A02',
      };
      const updatedMachine = {
        ...mockMachine,
        code: 'A02',
      };
      machinesService.update.mockResolvedValue(updatedMachine as Machine);

      const result = await controller.update('machine-123', dto);

      expect(result.code).toBe('A02');
    });

    it('should update isActive status', async () => {
      const dto: UpdateMachineDto = {
        isActive: false,
      };
      const updatedMachine = {
        ...mockMachine,
        isActive: false,
      };
      machinesService.update.mockResolvedValue(updatedMachine as Machine);

      const result = await controller.update('machine-123', dto);

      expect(result.isActive).toBe(false);
    });
  });

  describe('deactivate', () => {
    it('should deactivate a machine', async () => {
      const deactivatedMachine = {
        ...mockMachine,
        isActive: false,
      };
      machinesService.deactivate.mockResolvedValue(deactivatedMachine as Machine);

      const result = await controller.deactivate('machine-123');

      expect(machinesService.deactivate).toHaveBeenCalledWith('machine-123');
      expect(result.isActive).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate a machine', async () => {
      const activatedMachine = { ...mockMachine, isActive: true };
      machinesService.activate.mockResolvedValue(activatedMachine as Machine);

      const result = await controller.activate('machine-123');

      expect(machinesService.activate).toHaveBeenCalledWith('machine-123');
      expect(result.isActive).toBe(true);
    });
  });

  // ========== Machine Locations ==========

  describe('getLocations', () => {
    it('should return all locations for a machine', async () => {
      const mockLocations = [
        { id: 'loc-1', machineId: 'machine-123', address: 'Address 1', isCurrent: true },
        { id: 'loc-2', machineId: 'machine-123', address: 'Address 2', isCurrent: false },
      ] as unknown as MachineLocation[];
      machinesService.getLocations.mockResolvedValue(mockLocations);

      const result = await controller.getLocations('machine-123');

      expect(machinesService.getLocations).toHaveBeenCalledWith('machine-123');
      expect(result).toEqual(mockLocations);
    });

    it('should return empty array when no locations', async () => {
      machinesService.getLocations.mockResolvedValue([]);

      const result = await controller.getLocations('machine-123');

      expect(result).toEqual([]);
    });
  });

  describe('getCurrentLocation', () => {
    it('should return the current location for a machine', async () => {
      const mockLocation = {
        id: 'loc-1',
        machineId: 'machine-123',
        address: 'Current Address',
        isCurrent: true,
      } as unknown as MachineLocation;
      machinesService.getCurrentLocation.mockResolvedValue(mockLocation);

      const result = await controller.getCurrentLocation('machine-123');

      expect(machinesService.getCurrentLocation).toHaveBeenCalledWith('machine-123');
      expect(result).toEqual(mockLocation);
    });

    it('should return null when no current location', async () => {
      machinesService.getCurrentLocation.mockResolvedValue(null);

      const result = await controller.getCurrentLocation('machine-123');

      expect(result).toBeNull();
    });
  });

  describe('getLocationForDate', () => {
    it('should return the location for a specific date', async () => {
      const mockLocation = {
        id: 'loc-1',
        machineId: 'machine-123',
        address: 'Past Address',
        validFrom: '2024-01-01',
        validTo: '2024-06-30',
      } as unknown as MachineLocation;
      machinesService.getLocationForDate.mockResolvedValue(mockLocation);

      const result = await controller.getLocationForDate('machine-123', '2024-03-15');

      expect(machinesService.getLocationForDate).toHaveBeenCalledWith(
        'machine-123',
        expect.any(Date),
      );
      expect(result).toEqual(mockLocation);
    });
  });

  describe('addLocation', () => {
    it('should add a new location to a machine', async () => {
      const dto: CreateMachineLocationDto = {
        address: 'New Location Address',
        validFrom: '2024-06-01',
        latitude: 55.75,
        longitude: 37.62,
        isCurrent: true,
      };
      const mockLocation = {
        id: 'loc-new',
        machineId: 'machine-123',
        ...dto,
      } as unknown as MachineLocation;
      machinesService.addLocation.mockResolvedValue(mockLocation);

      const result = await controller.addLocation('machine-123', dto);

      expect(machinesService.addLocation).toHaveBeenCalledWith('machine-123', dto);
      expect(result).toEqual(mockLocation);
    });
  });

  describe('updateLocation', () => {
    it('should update a machine location', async () => {
      const dto: UpdateMachineLocationDto = {
        address: 'Updated Address',
        latitude: 56.0,
      };
      const mockUpdatedLocation = {
        id: 'loc-1',
        machineId: 'machine-123',
        address: 'Updated Address',
        latitude: 56.0,
      } as unknown as MachineLocation;
      machinesService.updateLocation.mockResolvedValue(mockUpdatedLocation);

      const result = await controller.updateLocation('loc-1', dto);

      expect(machinesService.updateLocation).toHaveBeenCalledWith('loc-1', dto);
      expect(result).toEqual(mockUpdatedLocation);
    });
  });

  describe('deleteLocation', () => {
    it('should delete a machine location', async () => {
      machinesService.deleteLocation.mockResolvedValue(undefined as any);

      const result = await controller.deleteLocation('loc-1');

      expect(machinesService.deleteLocation).toHaveBeenCalledWith('loc-1');
      expect(result).toBeUndefined();
    });
  });

  describe('setCurrentLocation', () => {
    it('should set a location as current', async () => {
      const mockLocation = {
        id: 'loc-1',
        machineId: 'machine-123',
        address: 'Current Address',
        isCurrent: true,
      } as unknown as MachineLocation;
      machinesService.setCurrentLocation.mockResolvedValue(mockLocation);

      const result = await controller.setCurrentLocation('loc-1');

      expect(machinesService.setCurrentLocation).toHaveBeenCalledWith('loc-1');
      expect(result).toEqual(mockLocation);
    });
  });
});
