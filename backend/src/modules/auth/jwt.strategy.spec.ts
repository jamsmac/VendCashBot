import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { AuthService, JwtPayload } from './auth.service';
import { User, UserRole } from '../users/entities/user.entity';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: AuthService,
          useValue: {
            validateJwtPayload: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'jwt.secret') return 'test-jwt-secret';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    const payload: JwtPayload = {
      sub: 'user-123',
      telegramId: 123456789,
      role: 'operator',
    };

    it('should return user when payload is valid', async () => {
      authService.validateJwtPayload.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toEqual(mockUser);
      expect(authService.validateJwtPayload).toHaveBeenCalledWith(payload);
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      authService.validateJwtPayload.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('extractJwtFromCookieOrHeader (via _jwtFromRequest)', () => {
    // passport-jwt stores the extractor function as _jwtFromRequest on the instance
    let extractFn: (req: any) => string | null;

    beforeEach(() => {
      extractFn = (strategy as any)._jwtFromRequest;
    });

    it('should be a function', () => {
      expect(typeof extractFn).toBe('function');
    });

    it('should extract token from access_token cookie', () => {
      const req = {
        cookies: { access_token: 'cookie-token-123' },
        headers: {},
      };
      expect(extractFn(req)).toBe('cookie-token-123');
    });

    it('should extract token from Authorization Bearer header when no cookie', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Bearer header-token-456' },
      };
      expect(extractFn(req)).toBe('header-token-456');
    });

    it('should prefer cookie over Authorization header', () => {
      const req = {
        cookies: { access_token: 'cookie-token' },
        headers: { authorization: 'Bearer header-token' },
      };
      expect(extractFn(req)).toBe('cookie-token');
    });

    it('should return null when no token is available', () => {
      const req = {
        cookies: {},
        headers: {},
      };
      expect(extractFn(req)).toBeNull();
    });

    it('should return null when Authorization header does not start with Bearer', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Basic some-token' },
      };
      expect(extractFn(req)).toBeNull();
    });

    it('should return null when cookies object is undefined', () => {
      const req = {
        headers: {},
      };
      expect(extractFn(req)).toBeNull();
    });
  });
});
