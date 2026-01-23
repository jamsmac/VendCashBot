import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService, TelegramAuthData } from './auth.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let refreshTokenRepository: jest.Mocked<Repository<RefreshToken>>;

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

  const mockRefreshToken: RefreshToken = {
    id: 'token-123',
    token: 'mock-refresh-token',
    userId: mockUser.id,
    user: mockUser,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isRevoked: false,
    createdAt: new Date(),
  };

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
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            save: jest.fn().mockResolvedValue(mockRefreshToken),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    refreshTokenRepository = module.get(getRepositoryToken(RefreshToken));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return accessToken, refreshToken and user', async () => {
      const result = await service.login(mockUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user).toEqual(mockUser);
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          telegramId: mockUser.telegramId,
          role: mockUser.role,
        },
        { expiresIn: '15m' },
      );
      expect(refreshTokenRepository.save).toHaveBeenCalled();
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

  describe('refreshTokens', () => {
    it('should return new tokens when valid refresh token', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(mockRefreshToken);
      refreshTokenRepository.save.mockResolvedValue({ ...mockRefreshToken, isRevoked: true });

      const result = await service.refreshTokens('mock-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException when token not found', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token expired', async () => {
      const expiredToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      refreshTokenRepository.findOne.mockResolvedValue(expiredToken);

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user inactive', async () => {
      const tokenWithInactiveUser = {
        ...mockRefreshToken,
        user: { ...mockUser, isActive: false },
      };
      refreshTokenRepository.findOne.mockResolvedValue(tokenWithInactiveUser);

      await expect(service.refreshTokens('mock-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all user tokens', async () => {
      refreshTokenRepository.update.mockResolvedValue({ affected: 3 } as any);

      await service.revokeAllUserTokens(mockUser.id);

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, isRevoked: false },
        { isRevoked: true },
      );
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      refreshTokenRepository.delete.mockResolvedValue({ affected: 5 } as any);

      const result = await service.cleanupExpiredTokens();

      expect(result).toBe(5);
    });
  });
});
