import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import {
  HealthCheckService,
  HealthCheckResult,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { NotificationsGateway } from '../notifications/notifications.gateway';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let dbIndicator: jest.Mocked<TypeOrmHealthIndicator>;
  let memoryIndicator: jest.Mocked<MemoryHealthIndicator>;
  let diskIndicator: jest.Mocked<DiskHealthIndicator>;
  let notificationsGateway: jest.Mocked<NotificationsGateway>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn(),
          },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: {
            pingCheck: jest.fn(),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            checkHeap: jest.fn(),
            checkRSS: jest.fn(),
          },
        },
        {
          provide: DiskHealthIndicator,
          useValue: {
            checkStorage: jest.fn(),
          },
        },
        {
          provide: NotificationsGateway,
          useValue: {
            getConnectedClientsCount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
    dbIndicator = module.get(TypeOrmHealthIndicator);
    memoryIndicator = module.get(MemoryHealthIndicator);
    diskIndicator = module.get(DiskHealthIndicator);
    notificationsGateway = module.get(NotificationsGateway);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check (detailed health)', () => {
    it('should call health.check with all indicators', async () => {
      const mockResult: HealthCheckResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
          websocket: { status: 'up', connectedClients: 5 },
        },
        error: {},
        details: {
          database: { status: 'up' },
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
          websocket: { status: 'up', connectedClients: 5 },
        },
      };

      healthCheckService.check.mockResolvedValue(mockResult);

      const result = await controller.check();

      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });

    it('should pass an array of four indicator functions to health.check', async () => {
      healthCheckService.check.mockResolvedValue({
        status: 'ok',
        info: {},
        error: {},
        details: {},
      });

      await controller.check();

      const indicators = healthCheckService.check.mock.calls[0][0];
      expect(indicators).toHaveLength(4);
      expect(typeof indicators[0]).toBe('function');
      expect(typeof indicators[1]).toBe('function');
      expect(typeof indicators[2]).toBe('function');
      expect(typeof indicators[3]).toBe('function');
    });

    it('should invoke db.pingCheck with "database" when the first indicator runs', async () => {
      dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });

      healthCheckService.check.mockImplementation(async (indicators) => {
        for (const fn of indicators) {
          await fn();
        }
        return { status: 'ok', info: {}, error: {}, details: {} };
      });

      await controller.check();

      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database');
    });

    it('should invoke memory.checkHeap with 300MB limit', async () => {
      memoryIndicator.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });
      memoryIndicator.checkRSS.mockResolvedValue({ memory_rss: { status: 'up' } });
      dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      notificationsGateway.getConnectedClientsCount.mockReturnValue(0);

      healthCheckService.check.mockImplementation(async (indicators) => {
        for (const fn of indicators) {
          await fn();
        }
        return { status: 'ok', info: {}, error: {}, details: {} };
      });

      await controller.check();

      expect(memoryIndicator.checkHeap).toHaveBeenCalledWith('memory_heap', 300 * 1024 * 1024);
    });

    it('should invoke memory.checkRSS with 500MB limit', async () => {
      memoryIndicator.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });
      memoryIndicator.checkRSS.mockResolvedValue({ memory_rss: { status: 'up' } });
      dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      notificationsGateway.getConnectedClientsCount.mockReturnValue(0);

      healthCheckService.check.mockImplementation(async (indicators) => {
        for (const fn of indicators) {
          await fn();
        }
        return { status: 'ok', info: {}, error: {}, details: {} };
      });

      await controller.check();

      expect(memoryIndicator.checkRSS).toHaveBeenCalledWith('memory_rss', 500 * 1024 * 1024);
    });

    it('should return websocket indicator with connected clients count', async () => {
      dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      memoryIndicator.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });
      memoryIndicator.checkRSS.mockResolvedValue({ memory_rss: { status: 'up' } });
      notificationsGateway.getConnectedClientsCount.mockReturnValue(42);

      let websocketResult: unknown;

      healthCheckService.check.mockImplementation(async (indicators) => {
        for (const fn of indicators) {
          const res = await fn();
          if (res && 'websocket' in res) {
            websocketResult = res;
          }
        }
        return { status: 'ok', info: {}, error: {}, details: {} };
      });

      await controller.check();

      expect(notificationsGateway.getConnectedClientsCount).toHaveBeenCalled();
      expect(websocketResult).toEqual({
        websocket: {
          status: 'up',
          connectedClients: 42,
        },
      });
    });
  });

  describe('liveness', () => {
    it('should return status ok', () => {
      const result = controller.liveness();

      expect(result.status).toBe('ok');
    });

    it('should return an ISO timestamp', () => {
      const before = new Date().toISOString();
      const result = controller.liveness();
      const after = new Date().toISOString();

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      // Timestamp should be between before and after
      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });

    it('should not depend on any external service', () => {
      const result = controller.liveness();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      });

      // Verify no external calls were made
      expect(healthCheckService.check).not.toHaveBeenCalled();
      expect(dbIndicator.pingCheck).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('should call health.check with database ping', async () => {
      const mockResult: HealthCheckResult = {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      };

      healthCheckService.check.mockResolvedValue(mockResult);

      const result = await controller.readiness();

      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });

    it('should pass exactly one indicator function (database only)', async () => {
      healthCheckService.check.mockResolvedValue({
        status: 'ok',
        info: {},
        error: {},
        details: {},
      });

      await controller.readiness();

      const indicators = healthCheckService.check.mock.calls[0][0];
      expect(indicators).toHaveLength(1);
    });

    it('should invoke db.pingCheck with "database" when the indicator runs', async () => {
      dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });

      healthCheckService.check.mockImplementation(async (indicators) => {
        for (const fn of indicators) {
          await fn();
        }
        return { status: 'ok', info: {}, error: {}, details: {} };
      });

      await controller.readiness();

      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database');
    });

    it('should not check memory or websocket indicators', async () => {
      dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });

      healthCheckService.check.mockImplementation(async (indicators) => {
        for (const fn of indicators) {
          await fn();
        }
        return { status: 'ok', info: {}, error: {}, details: {} };
      });

      await controller.readiness();

      expect(memoryIndicator.checkHeap).not.toHaveBeenCalled();
      expect(memoryIndicator.checkRSS).not.toHaveBeenCalled();
      expect(notificationsGateway.getConnectedClientsCount).not.toHaveBeenCalled();
    });

    it('should propagate errors when database is unreachable', async () => {
      const dbError = new Error('Connection refused');
      healthCheckService.check.mockRejectedValue(dbError);

      await expect(controller.readiness()).rejects.toThrow('Connection refused');
    });
  });
});
