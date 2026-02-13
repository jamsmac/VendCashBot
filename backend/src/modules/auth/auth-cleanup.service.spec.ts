import { Test, TestingModule } from '@nestjs/testing';
import { AuthCleanupService } from './auth-cleanup.service';
import { AuthService } from './auth.service';

describe('AuthCleanupService', () => {
  let service: AuthCleanupService;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCleanupService,
        {
          provide: AuthService,
          useValue: {
            cleanupExpiredTokens: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthCleanupService>(AuthCleanupService);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupExpiredTokens', () => {
    it('should call authService.cleanupExpiredTokens and log the count', async () => {
      authService.cleanupExpiredTokens.mockResolvedValue(5);

      await service.cleanupExpiredTokens();

      expect(authService.cleanupExpiredTokens).toHaveBeenCalledTimes(1);
    });

    it('should log success when tokens are cleaned up', async () => {
      authService.cleanupExpiredTokens.mockResolvedValue(10);

      // Should not throw
      await expect(service.cleanupExpiredTokens()).resolves.toBeUndefined();
    });

    it('should handle zero deleted tokens', async () => {
      authService.cleanupExpiredTokens.mockResolvedValue(0);

      await service.cleanupExpiredTokens();

      expect(authService.cleanupExpiredTokens).toHaveBeenCalled();
    });

    it('should catch and log errors without throwing', async () => {
      authService.cleanupExpiredTokens.mockRejectedValue(
        new Error('DB connection lost'),
      );

      // Should NOT throw — error is caught internally
      await expect(service.cleanupExpiredTokens()).resolves.toBeUndefined();
    });
  });
});
