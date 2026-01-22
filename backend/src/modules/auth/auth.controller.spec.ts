import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService, TelegramAuthData } from './auth.service';
import { User, UserRole } from '../users/entities/user.entity';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

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

  const mockLoginResponse = {
    accessToken: 'mock-jwt-token',
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateTelegramAuth: jest.fn(),
            login: jest.fn(),
            refreshToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('telegramAuth', () => {
    const authDto: TelegramAuthDto = {
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      photo_url: 'https://example.com/photo.jpg',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'valid-hash',
    };

    it('should authenticate user via Telegram and return access token', async () => {
      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      const result = await controller.telegramAuth(authDto);

      expect(authService.validateTelegramAuth).toHaveBeenCalledWith({
        id: authDto.id,
        first_name: authDto.first_name,
        last_name: authDto.last_name,
        username: authDto.username,
        photo_url: authDto.photo_url,
        auth_date: authDto.auth_date,
        hash: authDto.hash,
      });
      expect(authService.login).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockLoginResponse);
    });

    it('should pass correct TelegramAuthData structure', async () => {
      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      await controller.telegramAuth(authDto);

      const expectedAuthData: TelegramAuthData = {
        id: authDto.id,
        first_name: authDto.first_name,
        last_name: authDto.last_name,
        username: authDto.username,
        photo_url: authDto.photo_url,
        auth_date: authDto.auth_date,
        hash: authDto.hash,
      };

      expect(authService.validateTelegramAuth).toHaveBeenCalledWith(expectedAuthData);
    });

    it('should handle authentication without optional fields', async () => {
      const minimalAuthDto: TelegramAuthDto = {
        id: 123456789,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'valid-hash',
      };

      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      await controller.telegramAuth(minimalAuthDto);

      expect(authService.validateTelegramAuth).toHaveBeenCalledWith({
        id: minimalAuthDto.id,
        first_name: undefined,
        last_name: undefined,
        username: undefined,
        photo_url: undefined,
        auth_date: minimalAuthDto.auth_date,
        hash: minimalAuthDto.hash,
      });
    });
  });

  describe('me', () => {
    it('should return the current user from request', async () => {
      const mockRequest = { user: mockUser };

      const result = await controller.me(mockRequest);

      expect(result).toEqual(mockUser);
    });

    it('should return user with all properties', async () => {
      const mockRequest = { user: mockUser };

      const result = await controller.me(mockRequest);

      expect(result.id).toBe(mockUser.id);
      expect(result.telegramId).toBe(mockUser.telegramId);
      expect(result.role).toBe(mockUser.role);
      expect(result.isActive).toBe(mockUser.isActive);
    });
  });

  describe('refresh', () => {
    const mockRefreshResponse = {
      accessToken: 'new-mock-jwt-token',
    };

    it('should refresh the access token', async () => {
      const mockRequest = { user: mockUser };
      authService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const result = await controller.refresh(mockRequest);

      expect(authService.refreshToken).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockRefreshResponse);
    });

    it('should use user id from request', async () => {
      const differentUser = { ...mockUser, id: 'different-user-id' };
      const mockRequest = { user: differentUser };
      authService.refreshToken.mockResolvedValue(mockRefreshResponse);

      await controller.refresh(mockRequest);

      expect(authService.refreshToken).toHaveBeenCalledWith('different-user-id');
    });
  });
});
