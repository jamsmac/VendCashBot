import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
  HealthIndicatorResult,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../modules/users/entities/user.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Detailed health check - restricted to admins only
   * Exposes memory usage and database status
   */
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HealthCheck()
  @ApiOperation({ summary: 'Detailed health check (admin only)' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database connectivity check
      () => this.db.pingCheck('database'),
      // Memory heap check (max 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      // Memory RSS check (max 500MB)
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
      // WebSocket connections check
      async (): Promise<HealthIndicatorResult> => {
        const connectedClients = this.notificationsGateway.getConnectedClientsCount();
        return {
          websocket: {
            status: 'up',
            connectedClients,
          },
        };
      },
    ]);
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe' })
  readiness() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
