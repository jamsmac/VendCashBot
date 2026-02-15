import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';
import { UserModule } from './entities/user-module.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;

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

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockUser]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(UserModule),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createDto = {
        telegramId: 123456789,
        name: 'Test User',
        role: UserRole.OPERATOR,
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockUser);
      repository.save.mockResolvedValue(mockUser);

      const result = await service.create(createDto);

      expect(result).toEqual(mockUser);
      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if user already exists', async () => {
      const createDto = {
        telegramId: 123456789,
        name: 'Test User',
        role: UserRole.OPERATOR,
      };

      repository.findOne.mockResolvedValue(mockUser);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException on unique constraint violation (race condition)', async () => {
      const createDto = {
        telegramId: 123456789,
        name: 'Test User',
        role: UserRole.OPERATOR,
      };

      const dbError = new Error('duplicate key value violates unique constraint');
      (dbError as any).code = '23505';

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockUser);
      repository.save.mockRejectedValue(dbError);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should re-throw non-unique-constraint errors from save', async () => {
      const createDto = {
        telegramId: 123456789,
        name: 'Test User',
        role: UserRole.OPERATOR,
      };

      const genericError = new Error('connection error');

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockUser);
      repository.save.mockRejectedValue(genericError);

      await expect(service.create(createDto)).rejects.toThrow('connection error');
    });
  });

  describe('findAll', () => {
    it('should return all active users', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockUser]);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should filter by role when provided', async () => {
      await service.findAll(UserRole.OPERATOR);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.role = :role',
        { role: UserRole.OPERATOR },
      );
    });

    it('should include inactive users when requested', async () => {
      mockQueryBuilder.andWhere.mockClear();
      await service.findAll(undefined, true);

      // Should not filter by isActive
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'user.isActive = :isActive',
        expect.any(Object),
      );
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByIdOrFail', () => {
    it('should return user when found', async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByIdOrFail('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findByIdOrFail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByTelegramId', () => {
    it('should return user when found', async () => {
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByTelegramId(123456789);

      expect(result).toEqual(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { telegramId: 123456789 },
      });
    });
  });

  describe('update', () => {
    it('should update and return user', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };

      repository.findOne.mockResolvedValue(mockUser);
      repository.save.mockResolvedValue(updatedUser);

      const result = await service.update('user-123', updateDto);

      expect(result.name).toBe('Updated Name');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should update all optional fields when provided', async () => {
      const updateDto = {
        name: 'Updated Name',
        telegramUsername: 'newusername',
        telegramFirstName: 'NewFirst',
        phone: '+9876543210',
        isActive: false,
      };
      const userCopy = { ...mockUser };
      const updatedUser = { ...mockUser, ...updateDto };

      repository.findOne.mockResolvedValue(userCopy);
      repository.save.mockResolvedValue(updatedUser);

      const result = await service.update('user-123', updateDto);

      expect(userCopy.name).toBe('Updated Name');
      expect(userCopy.telegramUsername).toBe('newusername');
      expect(userCopy.telegramFirstName).toBe('NewFirst');
      expect(userCopy.phone).toBe('+9876543210');
      expect(userCopy.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(userCopy);
      expect(result).toEqual(updatedUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate user', async () => {
      const deactivatedUser = { ...mockUser, isActive: false };

      repository.findOne.mockResolvedValue(mockUser);
      repository.save.mockResolvedValue(deactivatedUser);

      const result = await service.deactivate('user-123');

      expect(result.isActive).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const activatedUser = { ...mockUser, isActive: true };

      repository.findOne.mockResolvedValue(inactiveUser);
      repository.save.mockResolvedValue(activatedUser);

      const result = await service.activate('user-123');

      expect(result.isActive).toBe(true);
    });
  });

  describe('getOperators', () => {
    it('should return operators', async () => {
      const result = await service.getOperators();

      expect(result).toEqual([mockUser]);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.role = :role',
        { role: UserRole.OPERATOR },
      );
    });
  });

  describe('getManagers', () => {
    it('should return managers and admins', async () => {
      repository.find.mockResolvedValue([mockUser]);

      const result = await service.getManagers();

      expect(result).toEqual([mockUser]);
      expect(repository.find).toHaveBeenCalledWith({
        where: [
          { role: UserRole.MANAGER, isActive: true },
          { role: UserRole.ADMIN, isActive: true },
        ],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findAllActive', () => {
    it('should return active users with specified roles', async () => {
      repository.find.mockResolvedValue([mockUser]);

      const result = await service.findAllActive([UserRole.MANAGER, UserRole.ADMIN]);

      expect(result).toEqual([mockUser]);
      expect(repository.find).toHaveBeenCalledWith({
        where: [
          { role: UserRole.MANAGER, isActive: true },
          { role: UserRole.ADMIN, isActive: true },
        ],
      });
    });
  });

  describe('deleteById', () => {
    it('should delete user by id', async () => {
      repository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      await service.deleteById('user-123');

      expect(repository.delete).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getUserModules', () => {
    let userModuleRepo: jest.Mocked<any>;

    beforeEach(() => {
      userModuleRepo = (service as any).userModuleRepository;
    });

    it('should return all modules for admin', async () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      repository.findOne.mockResolvedValue(adminUser);
      userModuleRepo.find.mockResolvedValue([]);

      const result = await service.getUserModules('user-123');

      // Admin gets all 7 modules by default
      expect(result).toEqual(expect.arrayContaining([
        'dashboard', 'collections', 'reports', 'sales', 'machines', 'settings', 'users',
      ]));
      expect(result.length).toBe(7);
    });

    it('should return default modules for manager', async () => {
      const managerUser = { ...mockUser, role: UserRole.MANAGER };
      repository.findOne.mockResolvedValue(managerUser);
      userModuleRepo.find.mockResolvedValue([]);

      const result = await service.getUserModules('user-123');

      expect(result).toEqual(expect.arrayContaining(['dashboard', 'collections', 'reports']));
      expect(result.length).toBe(3);
    });

    it('should return default modules for operator', async () => {
      repository.findOne.mockResolvedValue(mockUser); // operator
      userModuleRepo.find.mockResolvedValue([]);

      const result = await service.getUserModules('user-123');

      expect(result).toEqual(['collections']);
    });

    it('should combine role defaults with custom grants', async () => {
      const managerUser = { ...mockUser, role: UserRole.MANAGER };
      repository.findOne.mockResolvedValue(managerUser);
      userModuleRepo.find.mockResolvedValue([{ module: 'sales' }, { module: 'machines' }]);

      const result = await service.getUserModules('user-123');

      expect(result).toEqual(expect.arrayContaining([
        'dashboard', 'collections', 'reports', 'sales', 'machines',
      ]));
      expect(result.length).toBe(5);
    });

    it('should deduplicate when custom grant overlaps with role default', async () => {
      const managerUser = { ...mockUser, role: UserRole.MANAGER };
      repository.findOne.mockResolvedValue(managerUser);
      // 'dashboard' is already a manager default
      userModuleRepo.find.mockResolvedValue([{ module: 'dashboard' }, { module: 'sales' }]);

      const result = await service.getUserModules('user-123');

      expect(result.length).toBe(4); // dashboard, collections, reports, sales (no duplicate)
    });

    it('should throw NotFoundException for non-existent user', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.getUserModules('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCustomModules', () => {
    let userModuleRepo: jest.Mocked<any>;

    beforeEach(() => {
      userModuleRepo = (service as any).userModuleRepository;
    });

    it('should return empty array when no custom grants', async () => {
      userModuleRepo.find.mockResolvedValue([]);

      const result = await service.getCustomModules('user-123');

      expect(result).toEqual([]);
    });

    it('should return custom grant modules', async () => {
      userModuleRepo.find.mockResolvedValue([{ module: 'sales' }, { module: 'machines' }]);

      const result = await service.getCustomModules('user-123');

      expect(result).toEqual(['sales', 'machines']);
    });
  });

  describe('setUserModules', () => {
    let userModuleRepo: jest.Mocked<any>;

    beforeEach(() => {
      userModuleRepo = (service as any).userModuleRepository;
    });

    it('should store only non-default modules for operator', async () => {
      repository.findOne.mockResolvedValue(mockUser); // operator, default: collections
      userModuleRepo.delete.mockResolvedValue({ affected: 0 });
      userModuleRepo.create.mockImplementation((data: Record<string, unknown>) => data);
      userModuleRepo.save.mockResolvedValue([]);
      userModuleRepo.find.mockResolvedValue([{ module: 'sales' }]);

      const result = await service.setUserModules('user-123', ['collections', 'sales'], 'admin-1');

      // 'collections' is operator default, should only save 'sales'
      expect(userModuleRepo.delete).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(userModuleRepo.create).toHaveBeenCalledWith({
        userId: 'user-123',
        module: 'sales',
        grantedBy: 'admin-1',
      });
      expect(userModuleRepo.save).toHaveBeenCalled();
    });

    it('should delete all custom grants when only defaults provided', async () => {
      const managerUser = { ...mockUser, role: UserRole.MANAGER };
      repository.findOne.mockResolvedValue(managerUser);
      userModuleRepo.delete.mockResolvedValue({ affected: 2 });
      userModuleRepo.find.mockResolvedValue([]);

      // Only provide manager defaults — no custom modules needed
      const result = await service.setUserModules('user-123', ['dashboard', 'collections', 'reports'], 'admin-1');

      expect(userModuleRepo.delete).toHaveBeenCalledWith({ userId: 'user-123' });
      // save should not be called with empty array
      expect(userModuleRepo.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent user', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.setUserModules('non-existent', ['sales'], 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });
});
