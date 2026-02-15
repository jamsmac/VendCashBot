import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService, TelegramAuthData } from './auth.service';
import { InvitesService } from '../invites/invites.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { RegisterByInviteDto } from './dto/register-by-invite.dto';
import { Response, Request } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let invitesService: jest.Mocked<InvitesService>;
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

  const mockLoginResponse = {
    accessToken: 'mock-jwt-token',
    refreshToken: 'mock-refresh-token',
    user: mockUser,
  };

  let mockResponse: Response;

  const mockRequest = {
    cookies: {
      refresh_token: 'existing-refresh-token',
    },
  } as unknown as Request;

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateTelegramAuth: jest.fn(),
            login: jest.fn(),
            refreshTokens: jest.fn(),
            revokeAllUserTokens: jest.fn(),
            registerWithTelegramAndInvite: jest.fn(),
            findUsersByRole: jest.fn(),
          },
        },
        {
          provide: InvitesService,
          useValue: {
            validateInvite: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            getUserModules: jest.fn().mockResolvedValue(['collections']),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    invitesService = module.get(InvitesService);
    usersService = module.get(UsersService);

    // Reset mocks
    jest.clearAllMocks();
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

    it('should authenticate user via Telegram and set cookies', async () => {
      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      const result = await controller.telegramAuth(authDto, mockResponse);

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
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2); // access_token and refresh_token
      expect(result).toEqual({ user: mockUser });
    });

    it('should pass correct TelegramAuthData structure', async () => {
      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      await controller.telegramAuth(authDto, mockResponse);

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

      await controller.telegramAuth(minimalAuthDto, mockResponse);

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
    it('should return the current user with modules', async () => {
      usersService.getUserModules.mockResolvedValue(['collections']);

      const result = await controller.me(mockUser);

      expect(usersService.getUserModules).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({ ...mockUser, modules: ['collections'] });
    });

    it('should return user with all properties and modules', async () => {
      usersService.getUserModules.mockResolvedValue(['dashboard', 'collections', 'reports']);

      const result = await controller.me(mockUser);

      expect(result.id).toBe(mockUser.id);
      expect(result.telegramId).toBe(mockUser.telegramId);
      expect(result.role).toBe(mockUser.role);
      expect(result.isActive).toBe(mockUser.isActive);
      expect(result.modules).toEqual(['dashboard', 'collections', 'reports']);
    });
  });

  describe('refresh', () => {
    const mockRefreshResponse = {
      accessToken: 'new-mock-jwt-token',
      refreshToken: 'new-mock-refresh-token',
    };

    it('should refresh tokens using cookie and set new cookies', async () => {
      authService.refreshTokens.mockResolvedValue(mockRefreshResponse);

      const result = await controller.refresh(mockRequest, mockResponse);

      expect(authService.refreshTokens).toHaveBeenCalledWith('existing-refresh-token');
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    it('should throw error when no refresh token in cookie', async () => {
      const requestWithoutCookie = {
        cookies: {},
      } as unknown as Request;

      await expect(
        controller.refresh(requestWithoutCookie, mockResponse),
      ).rejects.toThrow('No refresh token provided');
    });
  });

  describe('validateInvite', () => {
    it('should return valid invite info', async () => {
      invitesService.validateInvite.mockResolvedValue({
        valid: true,
        role: UserRole.OPERATOR,
      } as any);

      const result = await controller.validateInvite('INVITE123');

      expect(invitesService.validateInvite).toHaveBeenCalledWith('INVITE123');
      expect(result).toEqual({ valid: true, role: UserRole.OPERATOR });
    });

    it('should return invalid when invite is not found', async () => {
      invitesService.validateInvite.mockResolvedValue({
        valid: false,
        role: undefined,
      } as any);

      const result = await controller.validateInvite('BAD_CODE');

      expect(result).toEqual({ valid: false, role: undefined });
    });
  });

  describe('register', () => {
    const registerDto: RegisterByInviteDto = {
      code: 'INVITE123',
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      photo_url: 'https://example.com/photo.jpg',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'valid-hash',
    };

    it('should register user via Telegram + invite code and set cookies', async () => {
      authService.registerWithTelegramAndInvite.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      const result = await controller.register(registerDto, mockResponse);

      expect(authService.registerWithTelegramAndInvite).toHaveBeenCalledWith(
        {
          id: registerDto.id,
          first_name: registerDto.first_name,
          last_name: registerDto.last_name,
          username: registerDto.username,
          photo_url: registerDto.photo_url,
          auth_date: registerDto.auth_date,
          hash: registerDto.hash,
        },
        registerDto.code,
      );
      expect(authService.login).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        'mock-jwt-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'mock-refresh-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(result).toEqual({ user: mockUser });
    });

    it('should handle registration without optional fields', async () => {
      const minimalDto: RegisterByInviteDto = {
        code: 'INVITE123',
        id: 123456789,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'valid-hash',
      };

      authService.registerWithTelegramAndInvite.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue(mockLoginResponse);

      const result = await controller.register(minimalDto, mockResponse);

      expect(authService.registerWithTelegramAndInvite).toHaveBeenCalledWith(
        {
          id: minimalDto.id,
          first_name: undefined,
          last_name: undefined,
          username: undefined,
          photo_url: undefined,
          auth_date: minimalDto.auth_date,
          hash: minimalDto.hash,
        },
        minimalDto.code,
      );
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe('devLogin', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should throw ForbiddenException in production', async () => {
      process.env.NODE_ENV = 'production';

      await expect(
        controller.devLogin('operator', mockResponse),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.devLogin('operator', mockResponse),
      ).rejects.toThrow('Dev login is only available in development environment');
    });

    it('should throw ForbiddenException when NODE_ENV is not development', async () => {
      process.env.NODE_ENV = 'test';

      await expect(
        controller.devLogin('operator', mockResponse),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when NODE_ENV is undefined', async () => {
      delete process.env.NODE_ENV;

      await expect(
        controller.devLogin('operator', mockResponse),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should login as first user with requested role in development', async () => {
      process.env.NODE_ENV = 'development';
      authService.findUsersByRole.mockResolvedValue([mockUser]);
      authService.login.mockResolvedValue(mockLoginResponse);

      const result = await controller.devLogin('operator', mockResponse);

      expect(authService.findUsersByRole).toHaveBeenCalledWith('operator');
      expect(authService.login).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        'mock-jwt-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'mock-refresh-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(result).toEqual({ user: mockUser });
    });

    it('should throw UnauthorizedException when no users found with role', async () => {
      process.env.NODE_ENV = 'development';
      authService.findUsersByRole.mockResolvedValue([]);

      await expect(
        controller.devLogin('nonexistent', mockResponse),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        (() => {
          authService.findUsersByRole.mockResolvedValue([]);
          return controller.devLogin('nonexistent', mockResponse);
        })(),
      ).rejects.toThrow('No user found with role nonexistent');
    });

    it('should throw UnauthorizedException when findUsersByRole returns null', async () => {
      process.env.NODE_ENV = 'development';
      authService.findUsersByRole.mockResolvedValue(null as any);

      await expect(
        controller.devLogin('admin', mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should use the first user when multiple users exist with the role', async () => {
      process.env.NODE_ENV = 'development';
      const secondUser = { ...mockUser, id: 'user-456', name: 'Second User' } as User;
      authService.findUsersByRole.mockResolvedValue([mockUser, secondUser]);
      authService.login.mockResolvedValue(mockLoginResponse);

      await controller.devLogin('operator', mockResponse);

      expect(authService.login).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('logout', () => {
    it('should revoke all user tokens and clear cookies', async () => {
      authService.revokeAllUserTokens.mockResolvedValue(undefined);

      const result = await controller.logout(mockUser, mockResponse);

      expect(authService.revokeAllUserTokens).toHaveBeenCalledWith(mockUser.id);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('access_token', expect.objectContaining({ path: '/' }));
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token', expect.objectContaining({ path: '/' }));
      expect(result).toEqual({ success: true });
    });
  });
});
