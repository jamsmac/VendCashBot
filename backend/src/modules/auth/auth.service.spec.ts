import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService, TelegramAuthData } from './auth.service';
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';
import { User, UserRole } from '../users/entities/user.entity';
import { Invite } from '../invites/entities/invite.entity';
import { RefreshToken } from './entities/refresh-token.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOT_TOKEN = 'test-bot-token-12345';

/**
 * Produce a valid Telegram auth hash for the given data using the known BOT_TOKEN.
 * This mirrors the exact algorithm in AuthService.verifyTelegramAuth.
 */
function makeTelegramHash(data: Omit<TelegramAuthData, 'hash'>): string {
  const dataCheckArr = Object.keys(data)
    .filter(
      (key) =>
        data[key as keyof typeof data] !== undefined &&
        data[key as keyof typeof data] !== null,
    )
    .sort()
    .map((key) => `${key}=${data[key as keyof typeof data]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  return crypto.createHmac('sha256', secretKey).update(dataCheckArr).digest('hex');
}

/** Shortcut: build valid auth data with a fresh auth_date. */
function validAuthData(overrides: Partial<TelegramAuthData> = {}): TelegramAuthData {
  const base: Omit<TelegramAuthData, 'hash'> = {
    id: 123456789,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    auth_date: Math.floor(Date.now() / 1000),
    ...overrides,
  };
  // Remove the hash key if it leaked in via overrides so we can recompute it
  delete (base as any).hash;
  return { ...base, hash: makeTelegramHash(base) };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let refreshTokenRepository: jest.Mocked<Repository<RefreshToken>>;
  let mockQueryRunner: any;

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
    token: 'hashed-token',
    userId: mockUser.id,
    user: mockUser,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isRevoked: false,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn().mockImplementation((_entity: any, data: any) => data),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByTelegramId: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
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
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'telegram.botToken') return BOT_TOKEN;
              if (key === 'jwt.refreshDays') return 30;
              return undefined;
            }),
          },
        },
        {
          provide: InvitesService,
          useValue: {
            validateInvite: jest.fn(),
            claimInvite: jest.fn(),
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
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
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

  // =========================================================================
  // findUsersByRole
  // =========================================================================
  describe('findUsersByRole', () => {
    it('should delegate to usersService.findAll with the given role', async () => {
      usersService.findAll.mockResolvedValue([mockUser]);

      const result = await service.findUsersByRole('operator');

      expect(usersService.findAll).toHaveBeenCalledWith(UserRole.OPERATOR);
      expect(result).toEqual([mockUser]);
    });

    it('should return empty array when no users with the given role', async () => {
      usersService.findAll.mockResolvedValue([]);

      const result = await service.findUsersByRole('admin');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // validateTelegramAuth
  // =========================================================================
  describe('validateTelegramAuth', () => {
    it('should return user when auth data is valid and user exists', async () => {
      const authData = validAuthData();
      usersService.findByTelegramId.mockResolvedValue(mockUser);

      const result = await service.validateTelegramAuth(authData);

      expect(result).toEqual(mockUser);
      expect(usersService.findByTelegramId).toHaveBeenCalledWith(authData.id);
    });

    it('should throw UnauthorizedException when hash is invalid', async () => {
      const authData = validAuthData();
      authData.hash = 'deadbeef'.repeat(8); // invalid hash

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        'Invalid Telegram authentication data',
      );
    });

    it('should throw UnauthorizedException when auth_date is in the far future (>60s skew)', async () => {
      const futureAuthDate = Math.floor(Date.now() / 1000) + 120; // 2 minutes in the future
      const authData = validAuthData({ auth_date: futureAuthDate });

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        'Invalid authentication data',
      );
    });

    it('should NOT reject auth_date in the near future (within 60s clock skew tolerance)', async () => {
      const nearFuture = Math.floor(Date.now() / 1000) + 30; // 30s in the future
      const authData = validAuthData({ auth_date: nearFuture });
      usersService.findByTelegramId.mockResolvedValue(mockUser);

      const result = await service.validateTelegramAuth(authData);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when auth_date is older than 24 hours', async () => {
      const oldAuthDate = Math.floor(Date.now() / 1000) - 86401; // 24h + 1s ago
      const authData = validAuthData({ auth_date: oldAuthDate });

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        'Telegram authentication data expired',
      );
    });

    it('should accept auth_date that is exactly 24 hours old', async () => {
      const exactlyExpired = Math.floor(Date.now() / 1000) - 86400;
      const authData = validAuthData({ auth_date: exactlyExpired });
      usersService.findByTelegramId.mockResolvedValue(mockUser);

      // 86400 is NOT > 86400, so this should pass
      const result = await service.validateTelegramAuth(authData);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when user not found (not registered)', async () => {
      const authData = validAuthData();
      usersService.findByTelegramId.mockResolvedValue(null);

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        'User not registered. Please use an invite link.',
      );
    });

    it('should throw UnauthorizedException when user is deactivated', async () => {
      const authData = validAuthData();
      usersService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as User);

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        'User account is deactivated',
      );
    });

    it('should update user telegram data when username changes', async () => {
      const authData = validAuthData({ username: 'new_username' });
      usersService.findByTelegramId.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue({ ...mockUser, telegramUsername: 'new_username' } as User);

      await service.validateTelegramAuth(authData);

      expect(usersService.update).toHaveBeenCalledWith(mockUser.id, {
        telegramUsername: 'new_username',
        telegramFirstName: 'Test',
      });
    });

    it('should update user telegram data when first_name changes', async () => {
      const authData = validAuthData({ first_name: 'NewName' });
      usersService.findByTelegramId.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue({ ...mockUser, telegramFirstName: 'NewName' } as User);

      await service.validateTelegramAuth(authData);

      expect(usersService.update).toHaveBeenCalledWith(mockUser.id, {
        telegramUsername: 'testuser',
        telegramFirstName: 'NewName',
      });
    });

    it('should NOT update user data when nothing changed', async () => {
      const authData = validAuthData({
        username: mockUser.telegramUsername,
        first_name: mockUser.telegramFirstName,
      });
      usersService.findByTelegramId.mockResolvedValue(mockUser);

      await service.validateTelegramAuth(authData);

      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('should handle auth data with undefined optional fields (no username, no first_name)', async () => {
      const user = {
        ...mockUser,
        telegramUsername: undefined as any,
        telegramFirstName: undefined as any,
      } as User;
      const authData = validAuthData({
        username: undefined,
        first_name: undefined,
      });
      usersService.findByTelegramId.mockResolvedValue(user);

      const result = await service.validateTelegramAuth(authData);

      expect(result).toEqual(user);
      // username and first_name both undefined => no update needed
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // verifyTelegramAuth (tested indirectly through validateTelegramAuth)
  // =========================================================================
  describe('verifyTelegramAuth (via validateTelegramAuth)', () => {
    it('should return false (throw) when bot token is not configured', async () => {
      configService.get.mockReturnValue(undefined);

      const authData = validAuthData();

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle hash with different length than calculated (buffer length mismatch)', async () => {
      const authData = validAuthData();
      authData.hash = 'abcd'; // only 4 hex chars = 2 bytes, vs 32 bytes for sha256

      await expect(service.validateTelegramAuth(authData)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should correctly verify auth data with all optional fields present', async () => {
      const authData = validAuthData({
        first_name: 'John',
        last_name: 'Doe',
        username: 'johndoe',
        photo_url: 'https://t.me/photo.jpg',
      });
      usersService.findByTelegramId.mockResolvedValue({
        ...mockUser,
        telegramUsername: 'johndoe',
        telegramFirstName: 'John',
      } as User);

      const result = await service.validateTelegramAuth(authData);

      expect(result).toBeDefined();
    });

    it('should correctly verify auth data with minimal fields (only id and auth_date)', async () => {
      const authData = validAuthData({
        first_name: undefined,
        last_name: undefined,
        username: undefined,
        photo_url: undefined,
      });
      const user = {
        ...mockUser,
        telegramUsername: undefined as any,
        telegramFirstName: undefined as any,
      } as User;
      usersService.findByTelegramId.mockResolvedValue(user);

      const result = await service.validateTelegramAuth(authData);

      expect(result).toEqual(user);
    });
  });

  // =========================================================================
  // registerWithTelegramAndInvite
  // =========================================================================
  describe('registerWithTelegramAndInvite', () => {
    const inviteCode = 'INVITE123';

    const mockInvite = {
      id: 'invite-1',
      code: inviteCode,
      role: UserRole.OPERATOR,
      usedById: null as any,
      usedAt: null as any,
      expiresAt: new Date(Date.now() + 86400000),
      get isExpired() {
        return new Date() > this.expiresAt;
      },
    };

    it('should register a new user via valid telegram auth + invite code', async () => {
      const authData = validAuthData();
      const savedUser = { ...mockUser, id: 'new-user-id' } as User;

      // No existing user
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null) // User lookup
        .mockResolvedValueOnce({ ...mockInvite }); // Invite lookup

      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser) // save user
        .mockResolvedValueOnce({ ...mockInvite, usedById: savedUser.id }); // save invite

      const result = await service.registerWithTelegramAndInvite(authData, inviteCode);

      expect(result).toEqual(savedUser);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when telegram auth is invalid', async () => {
      const authData = validAuthData();
      authData.hash = 'deadbeef'.repeat(8);

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow(UnauthorizedException);

      // Should not start a transaction at all
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when auth_date is expired (>24h)', async () => {
      const oldDate = Math.floor(Date.now() / 1000) - 86401;
      const authData = validAuthData({ auth_date: oldDate });

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow('Данные авторизации устарели');
    });

    it('should throw BadRequestException when user is already registered', async () => {
      const authData = validAuthData();
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(mockUser); // Existing user found

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw BadRequestException when invite code not found', async () => {
      const authData = validAuthData();
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null) // No existing user
        .mockResolvedValueOnce(null); // Invite not found

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow(BadRequestException);
      await expect(
        (() => {
          mockQueryRunner.manager.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
          return service.registerWithTelegramAndInvite(validAuthData(), inviteCode);
        })(),
      ).rejects.toThrow('Код приглашения не найден');
    });

    it('should throw BadRequestException when invite is already used', async () => {
      const authData = validAuthData();
      const usedInvite = { ...mockInvite, usedById: 'someone-else' };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null) // No existing user
        .mockResolvedValueOnce(usedInvite);

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException when invite is expired', async () => {
      const authData = validAuthData();
      const expiredInvite = {
        ...mockInvite,
        usedById: null,
        expiresAt: new Date(Date.now() - 86400000), // expired yesterday
        get isExpired() {
          return new Date() > this.expiresAt;
        },
      };
      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null) // No existing user
        .mockResolvedValueOnce(expiredInvite);

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should create user with correct name from first_name + last_name', async () => {
      const authData = validAuthData({ first_name: 'John', last_name: 'Doe' });
      const savedUser = { ...mockUser, name: 'John Doe' } as User;

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockInvite });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser)
        .mockResolvedValueOnce({});

      await service.registerWithTelegramAndInvite(authData, inviteCode);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          name: 'John Doe',
          telegramId: authData.id,
          telegramUsername: authData.username,
          telegramFirstName: authData.first_name,
          role: mockInvite.role,
        }),
      );
    });

    it('should create user with fallback name "User <id>" when no first/last name', async () => {
      const authData = validAuthData({
        first_name: undefined,
        last_name: undefined,
      });
      const savedUser = { ...mockUser, name: `User ${authData.id}` } as User;

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockInvite });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser)
        .mockResolvedValueOnce({});

      await service.registerWithTelegramAndInvite(authData, inviteCode);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          name: `User ${authData.id}`,
        }),
      );
    });

    it('should use only first_name when last_name is not provided', async () => {
      const authData = validAuthData({
        first_name: 'Alice',
        last_name: undefined,
      });
      const savedUser = { ...mockUser, name: 'Alice' } as User;

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockInvite });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser)
        .mockResolvedValueOnce({});

      await service.registerWithTelegramAndInvite(authData, inviteCode);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          name: 'Alice',
        }),
      );
    });

    it('should rollback and release query runner on any error', async () => {
      const authData = validAuthData();
      const dbError = new Error('DB connection lost');
      mockQueryRunner.manager.findOne.mockRejectedValueOnce(dbError);

      await expect(
        service.registerWithTelegramAndInvite(authData, inviteCode),
      ).rejects.toThrow('DB connection lost');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should assign the invite role to the new user', async () => {
      const authData = validAuthData();
      const managerInvite = { ...mockInvite, role: UserRole.MANAGER };
      const savedUser = { ...mockUser, role: UserRole.MANAGER } as User;

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(managerInvite);
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser)
        .mockResolvedValueOnce({});

      await service.registerWithTelegramAndInvite(authData, inviteCode);

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          role: UserRole.MANAGER,
        }),
      );
    });

    it('should mark invite as used with saved user id and timestamp', async () => {
      const authData = validAuthData();
      const invite = { ...mockInvite };
      const savedUser = { ...mockUser, id: 'new-user-id' } as User;

      mockQueryRunner.manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(invite);
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser)
        .mockResolvedValueOnce(invite);

      await service.registerWithTelegramAndInvite(authData, inviteCode);

      // Second save call is for the invite
      const secondSaveCall = mockQueryRunner.manager.save.mock.calls[1][0];
      expect(secondSaveCall.usedById).toBe('new-user-id');
      expect(secondSaveCall.usedAt).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // login
  // =========================================================================
  describe('login', () => {
    it('should return accessToken, refreshToken and user', async () => {
      const result = await service.login(mockUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user).toEqual(mockUser);
    });

    it('should sign JWT with correct payload', async () => {
      await service.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        telegramId: mockUser.telegramId,
        role: mockUser.role,
      });
    });

    it('should save a hashed refresh token in the repository', async () => {
      await service.login(mockUser);

      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );

      // The stored token should be a sha256 hex hash (64 chars)
      const savedCall = refreshTokenRepository.save.mock.calls[0][0] as any;
      expect(savedCall.token).toHaveLength(64);
    });

    it('should return a raw (unhashed) refresh token string (128 hex chars from 64 random bytes)', async () => {
      const result = await service.login(mockUser);

      // crypto.randomBytes(64).toString('hex') = 128 hex chars
      expect(result.refreshToken).toHaveLength(128);
    });

    it('should set refresh token expiry based on jwt.refreshDays config', async () => {
      // Default is 30 days
      const before = new Date();
      const result = await service.login(mockUser);
      const after = new Date();

      const savedCall = refreshTokenRepository.save.mock.calls[0][0] as any;
      const expiresAt = savedCall.expiresAt as Date;

      // Should be ~30 days from now (give 1s tolerance)
      const expectedMin = new Date(before.getTime() + 29 * 24 * 60 * 60 * 1000);
      const expectedMax = new Date(after.getTime() + 31 * 24 * 60 * 60 * 1000);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });

    it('should use default 30 days when jwt.refreshDays is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'telegram.botToken') return BOT_TOKEN;
        if (key === 'jwt.refreshDays') return undefined; // not configured
        return undefined;
      });

      const result = await service.login(mockUser);

      // Should still work (defaults to 30)
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toHaveLength(128);
    });
  });

  // =========================================================================
  // validateJwtPayload
  // =========================================================================
  describe('validateJwtPayload', () => {
    const payload = {
      sub: mockUser.id,
      telegramId: mockUser.telegramId,
      role: mockUser.role,
    };

    it('should return user when valid and active', async () => {
      usersService.findById.mockResolvedValue(mockUser);

      const result = await service.validateJwtPayload(payload);

      expect(result).toEqual(mockUser);
      expect(usersService.findById).toHaveBeenCalledWith(payload.sub);
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
      usersService.findById.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as User);

      const result = await service.validateJwtPayload(payload);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // refreshTokens
  // =========================================================================
  describe('refreshTokens', () => {
    it('should return new tokens when valid refresh token is provided', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      mockQueryRunner.manager.save.mockResolvedValue({});
      usersService.findById.mockResolvedValue(mockUser);

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toHaveLength(128);
    });

    it('should hash the incoming token before looking it up', async () => {
      const rawToken = 'some-raw-token';
      const expectedHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      mockQueryRunner.manager.save.mockResolvedValue({});
      usersService.findById.mockResolvedValue(mockUser);

      await service.refreshTokens(rawToken);

      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({
          where: { token: expectedHash, isRevoked: false },
        }),
      );
    });

    it('should throw UnauthorizedException when token not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const expiredToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      mockQueryRunner.manager.findOne.mockResolvedValue(expiredToken);

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      usersService.findById.mockResolvedValue(null);

      await expect(service.refreshTokens('token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(
        (() => {
          mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
          usersService.findById.mockResolvedValue(null);
          return service.refreshTokens('token');
        })(),
      ).rejects.toThrow('User inactive');
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      usersService.findById.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as User);

      await expect(service.refreshTokens('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke old token (rotation) within the transaction', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockRefreshToken });
      mockQueryRunner.manager.save.mockResolvedValue({});
      usersService.findById.mockResolvedValue(mockUser);

      await service.refreshTokens('valid-token');

      // First save call should be the revoked old token
      const firstSaveCall = mockQueryRunner.manager.save.mock.calls[0][0];
      expect(firstSaveCall.isRevoked).toBe(true);
    });

    it('should sign new access token with correct payload and 15m expiry', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      mockQueryRunner.manager.save.mockResolvedValue({});
      usersService.findById.mockResolvedValue(mockUser);

      await service.refreshTokens('valid-token');

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          telegramId: mockUser.telegramId,
          role: mockUser.role,
        },
        { expiresIn: '15m' },
      );
    });

    it('should save a new refresh token in the database', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({ ...mockRefreshToken });
      mockQueryRunner.manager.save.mockResolvedValue({});
      mockQueryRunner.manager.create.mockImplementation((_entity: any, data: any) => data);
      usersService.findById.mockResolvedValue(mockUser);

      await service.refreshTokens('valid-token');

      // Second save call is the new refresh token (created via manager.create + manager.save)
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({
          token: expect.any(String),
          userId: mockUser.id,
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('should commit transaction on success', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      mockQueryRunner.manager.save.mockResolvedValue({});
      usersService.findById.mockResolvedValue(mockUser);

      await service.refreshTokens('valid-token');

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction and release on error', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should use pessimistic_write lock when finding the token', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(mockRefreshToken);
      mockQueryRunner.manager.save.mockResolvedValue({});
      usersService.findById.mockResolvedValue(mockUser);

      await service.refreshTokens('valid-token');

      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });
  });

  // =========================================================================
  // revokeAllUserTokens
  // =========================================================================
  describe('revokeAllUserTokens', () => {
    it('should revoke all active tokens for the given user', async () => {
      refreshTokenRepository.update.mockResolvedValue({ affected: 3 } as any);

      await service.revokeAllUserTokens(mockUser.id);

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, isRevoked: false },
        { isRevoked: true },
      );
    });

    it('should succeed even when no tokens to revoke', async () => {
      refreshTokenRepository.update.mockResolvedValue({ affected: 0 } as any);

      await expect(
        service.revokeAllUserTokens(mockUser.id),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // cleanupExpiredTokens
  // =========================================================================
  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens and return the count', async () => {
      refreshTokenRepository.delete.mockResolvedValue({ affected: 5 } as any);

      const result = await service.cleanupExpiredTokens();

      expect(result).toBe(5);
    });

    it('should return 0 when no expired tokens exist', async () => {
      refreshTokenRepository.delete.mockResolvedValue({ affected: 0 } as any);

      const result = await service.cleanupExpiredTokens();

      expect(result).toBe(0);
    });

    it('should return 0 when affected is undefined', async () => {
      refreshTokenRepository.delete.mockResolvedValue({
        affected: undefined,
      } as any);

      const result = await service.cleanupExpiredTokens();

      expect(result).toBe(0);
    });

    it('should call delete with LessThan(now) condition', async () => {
      refreshTokenRepository.delete.mockResolvedValue({ affected: 0 } as any);

      await service.cleanupExpiredTokens();

      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        expiresAt: expect.anything(), // LessThan(new Date())
      });
    });
  });
});
