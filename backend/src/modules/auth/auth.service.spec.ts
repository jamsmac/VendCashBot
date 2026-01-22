import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService, TelegramAuthData } from './auth.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

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
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByTelegramId: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock-bot-token'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return accessToken and user', async () => {
      const result = await service.login(mockUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user).toEqual(mockUser);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        telegramId: mockUser.telegramId,
        role: mockUser.role,
      });
    });
  });

  describe('validateJwtPayload', () => {
    it('should return user when valid', async () => {
      usersService.findById.mockResolvedValue(mockUser);

      const result = await service.validateJwtPayload({
        sub: mockUser.id,
        telegramId: mockUser.telegramId,
        role: mockUser.role,
      });

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      usersService.findById.mockResolvedValue(null);

      const result = await service.validateJwtPayload({
        sub: 'non-existent',
        telegramId: 123,
        role: 'operator',
      });

      expect(result).toBeNull();
    });

    it('should return null when user is inactive', async () => {
      usersService.findById.mockResolvedValue({ ...mockUser, isActive: false } as User);

      const result = await service.validateJwtPayload({
        sub: mockUser.id,
        telegramId: mockUser.telegramId,
        role: mockUser.role,
      });

      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should return new accessToken', async () => {
      usersService.findById.mockResolvedValue(mockUser);

      const result = await service.refreshToken(mockUser.id);

      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('mock-jwt-token');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.refreshToken('non-existent')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      usersService.findById.mockResolvedValue({ ...mockUser, isActive: false } as User);

      await expect(service.refreshToken(mockUser.id)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
