import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';

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
});
