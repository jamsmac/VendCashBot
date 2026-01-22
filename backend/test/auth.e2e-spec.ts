import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserRole } from '../src/modules/users/entities/user.entity';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  } as User;

  const mockJwtToken = 'mock.jwt.token';

  // Mock JwtAuthGuard that sets user on request
  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException();
      }
      req.user = mockUser;
      return true;
    }),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateTelegramAuth: jest.fn(),
            login: jest.fn(),
            refreshToken: jest.fn(),
            validateJwtPayload: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    authService = moduleFixture.get(AuthService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/telegram', () => {
    const validAuthData = {
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      photo_url: 'https://example.com/photo.jpg',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'valid-hash-string',
    };

    it('should authenticate user via Telegram and return token', async () => {
      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue({
        accessToken: mockJwtToken,
        user: mockUser,
      });

      const response = await request(app.getHttpServer())
        .post('/auth/telegram')
        .send(validAuthData)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.accessToken).toBe(mockJwtToken);
      expect(response.body.user.id).toBe(mockUser.id);
    });

    it('should return 400 for invalid auth data (missing id)', async () => {
      const invalidAuthData = {
        first_name: 'Test',
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'valid-hash-string',
      };

      await request(app.getHttpServer())
        .post('/auth/telegram')
        .send(invalidAuthData)
        .expect(400);
    });

    it('should return 400 for invalid auth data (missing hash)', async () => {
      const invalidAuthData = {
        id: 123456789,
        auth_date: Math.floor(Date.now() / 1000),
      };

      await request(app.getHttpServer())
        .post('/auth/telegram')
        .send(invalidAuthData)
        .expect(400);
    });

    it('should work with minimal required fields', async () => {
      const minimalAuthData = {
        id: 123456789,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'valid-hash-string',
      };

      authService.validateTelegramAuth.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue({
        accessToken: mockJwtToken,
        user: mockUser,
      });

      const response = await request(app.getHttpServer())
        .post('/auth/telegram')
        .send(minimalAuthData)
        .expect(201);

      expect(response.body.accessToken).toBe(mockJwtToken);
    });

    it('should handle service validation errors', async () => {
      authService.validateTelegramAuth.mockRejectedValue(
        new UnauthorizedException('Invalid Telegram authentication data'),
      );

      await request(app.getHttpServer())
        .post('/auth/telegram')
        .send(validAuthData)
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('should return 401 without authorization header', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });

    it('should return user with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.id).toBe(mockUser.id);
      expect(response.body.telegramId).toBe(mockUser.telegramId);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return 401 without authorization header', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);
    });

    it('should refresh token with valid authorization', async () => {
      authService.refreshToken.mockResolvedValue({
        accessToken: 'new-mock-token',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', 'Bearer valid-token')
        .expect(201);

      expect(response.body.accessToken).toBe('new-mock-token');
    });
  });
});
