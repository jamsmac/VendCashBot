import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findAll: jest.fn(),
            getOperators: jest.fn(),
            getManagers: jest.fn(),
            findByIdOrFail: jest.fn(),
            update: jest.fn(),
            deactivate: jest.fn(),
            activate: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all active users by default', async () => {
      usersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAll();

      expect(usersService.findAll).toHaveBeenCalledWith(undefined, false);
      expect(result).toEqual([mockUser]);
    });

    it('should filter by role when provided', async () => {
      usersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAll(UserRole.OPERATOR);

      expect(usersService.findAll).toHaveBeenCalledWith(UserRole.OPERATOR, false);
      expect(result).toEqual([mockUser]);
    });

    it('should include inactive users when includeInactive is "true"', async () => {
      usersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAll(undefined, 'true');

      expect(usersService.findAll).toHaveBeenCalledWith(undefined, true);
      expect(result).toEqual([mockUser]);
    });

    it('should not include inactive users when includeInactive is not "true"', async () => {
      usersService.findAll.mockResolvedValue([mockUser]);

      const result = await controller.findAll(undefined, 'false');

      expect(usersService.findAll).toHaveBeenCalledWith(undefined, false);
      expect(result).toEqual([mockUser]);
    });
  });

  describe('getOperators', () => {
    it('should return all operators', async () => {
      usersService.getOperators.mockResolvedValue([mockUser]);

      const result = await controller.getOperators();

      expect(usersService.getOperators).toHaveBeenCalled();
      expect(result).toEqual([mockUser]);
    });
  });

  describe('getManagers', () => {
    it('should return all managers and admins', async () => {
      const mockManager = { ...mockUser, role: UserRole.MANAGER };
      usersService.getManagers.mockResolvedValue([mockManager as User]);

      const result = await controller.getManagers();

      expect(usersService.getManagers).toHaveBeenCalled();
      expect(result).toEqual([mockManager]);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      usersService.findByIdOrFail.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-123');

      expect(usersService.findByIdOrFail).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockUser);
    });
  });

  describe('update', () => {
    it('should update and return the user', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, name: 'Updated Name' };
      usersService.update.mockResolvedValue(updatedUser as User);

      const result = await controller.update('user-123', updateDto);

      expect(usersService.update).toHaveBeenCalledWith('user-123', updateDto);
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('deactivate', () => {
    it('should deactivate a user', async () => {
      const deactivatedUser = { ...mockUser, isActive: false };
      usersService.deactivate.mockResolvedValue(deactivatedUser as User);

      const result = await controller.deactivate('user-123');

      expect(usersService.deactivate).toHaveBeenCalledWith('user-123');
      expect(result.isActive).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate a user', async () => {
      const activatedUser = { ...mockUser, isActive: true };
      usersService.activate.mockResolvedValue(activatedUser as User);

      const result = await controller.activate('user-123');

      expect(usersService.activate).toHaveBeenCalledWith('user-123');
      expect(result.isActive).toBe(true);
    });
  });
});
