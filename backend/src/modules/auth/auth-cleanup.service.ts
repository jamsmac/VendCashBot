import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredTokens() {
    try {
      const deleted = await this.authService.cleanupExpiredTokens();
      this.logger.log(`Cleaned up ${deleted} expired refresh tokens`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens:', error);
    }
  }
}
