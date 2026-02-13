import { ConfigService } from '@nestjs/config';
import {
  isRedisConfigured,
  createSessionStorage,
  createRedisSessionStorage,
  SessionData,
} from './session-storage';

// Track logger calls globally
let loggerCalls: { type: string; message: string }[] = [];

// Mock Logger to track logs
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: jest.fn().mockImplementation(() => ({
    error: jest.fn((msg) => loggerCalls.push({ type: 'error', message: msg })),
    warn: jest.fn((msg) => loggerCalls.push({ type: 'warn', message: msg })),
    log: jest.fn((msg) => loggerCalls.push({ type: 'log', message: msg })),
    debug: jest.fn((msg) => loggerCalls.push({ type: 'debug', message: msg })),
  })),
}));

// Mock ioredis to prevent actual Redis connections
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  }));
});

describe('SessionStorage', () => {
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerCalls = [];

    // Create a mock ConfigService
    mockConfigService = {
      get: jest.fn(),
    } as any;
  });

  describe('isRedisConfigured', () => {
    it('should return false when redis host is not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = isRedisConfigured(mockConfigService);

      expect(result).toBe(false);
      expect(mockConfigService.get).toHaveBeenCalledWith('redis.host');
    });

    it('should return false when redis host is localhost', () => {
      mockConfigService.get.mockReturnValue('localhost');

      const result = isRedisConfigured(mockConfigService);

      expect(result).toBe(false);
    });

    it('should return false when redis host is empty string', () => {
      mockConfigService.get.mockReturnValue('');

      const result = isRedisConfigured(mockConfigService);

      expect(result).toBe(false);
    });

    it('should return true when redis host is a real host', () => {
      mockConfigService.get.mockReturnValue('redis.example.com');

      const result = isRedisConfigured(mockConfigService);

      expect(result).toBe(true);
    });

    it('should return true when redis host is an IP address', () => {
      mockConfigService.get.mockReturnValue('192.168.1.100');

      const result = isRedisConfigured(mockConfigService);

      expect(result).toBe(true);
    });

    it('should return true when redis host is 127.0.0.1', () => {
      // 127.0.0.1 is treated as a real host (only localhost is excluded)
      mockConfigService.get.mockReturnValue('127.0.0.1');

      const result = isRedisConfigured(mockConfigService);

      expect(result).toBe(true);
    });
  });

  describe('createSessionStorage', () => {
    describe('when Redis is not configured', () => {
      beforeEach(() => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'redis.host') return undefined;
          if (key === 'NODE_ENV') return undefined;
          if (key === 'nodeEnv') return undefined;
          return undefined;
        });
      });

      it('should return memory storage when redis is not configured', () => {
        const result = createSessionStorage(mockConfigService);

        expect(result.type).toBe('memory');
        expect(result.storage).toBeDefined();
      });

      it('should log warning when redis not configured in development', () => {
        createSessionStorage(mockConfigService);

        const warnCall = loggerCalls.find((call) => call.type === 'warn');
        expect(warnCall?.message).toBe('Redis not configured, using in-memory session storage');
      });

      it('should log error in production when redis not configured', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'redis.host') return undefined;
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        });

        createSessionStorage(mockConfigService);

        const errorCall = loggerCalls.find(
          (call) =>
            call.type === 'error' && call.message.includes('CRITICAL: Redis not configured in production'),
        );
        expect(errorCall).toBeDefined();
      });

      it('should check nodeEnv when NODE_ENV is not set', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'redis.host') return undefined;
          if (key === 'NODE_ENV') return undefined;
          if (key === 'nodeEnv') return 'production';
          return undefined;
        });

        createSessionStorage(mockConfigService);

        const errorCall = loggerCalls.find(
          (call) =>
            call.type === 'error' && call.message.includes('CRITICAL: Redis not configured in production'),
        );
        expect(errorCall).toBeDefined();
      });
    });

    describe('when Redis is configured', () => {
      it('should attempt to create Redis storage and handle failures gracefully', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'redis.host') return 'redis.example.com';
          if (key === 'redis.port') return 6379;
          if (key === 'redis.password') return 'testpassword';
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        });

        const result = createSessionStorage(mockConfigService);

        // Should either return redis or fall back to memory
        expect(result.storage).toBeDefined();
        expect(['redis', 'memory']).toContain(result.type);
      });
    });

    describe('when Redis connection fails', () => {
      beforeEach(() => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'redis.host') return 'redis.example.com';
          if (key === 'redis.port') return 6379;
          if (key === 'redis.password') return 'testpassword';
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        });
      });

      it('should fall back to memory storage when Redis initialization fails', () => {
        const Redis = require('ioredis');
        Redis.mockImplementation(() => {
          throw new Error('Failed to connect to Redis');
        });

        const result = createSessionStorage(mockConfigService);

        expect(result.type).toBe('memory');
        expect(result.storage).toBeDefined();
      });

      it('should log error when Redis initialization fails', () => {
        const Redis = require('ioredis');
        Redis.mockImplementation(() => {
          throw new Error('Failed to connect to Redis');
        });
        loggerCalls = [];

        createSessionStorage(mockConfigService);

        const errorCall = loggerCalls.find(
          (call) => call.type === 'error' && call.message.includes('Failed to create Redis adapter'),
        );
        expect(errorCall).toBeDefined();

        const warnCall = loggerCalls.find(
          (call) => call.type === 'warn' && call.message.includes('Falling back to in-memory'),
        );
        expect(warnCall).toBeDefined();
      });
    });
  });

  describe('MemorySessionStorage', () => {
    it('should write and read session data', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const sessionData: SessionData = {
        step: 'idle',
        selectedMachineId: 'machine-123',
      };

      await storage.write('user-1', sessionData);
      const result = await storage.read('user-1');

      expect(result).toEqual(sessionData);
    });

    it('should return undefined for non-existent keys', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const result = await storage.read('non-existent');

      expect(result).toBeUndefined();
    });

    it('should delete session data', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const sessionData: SessionData = {
        step: 'idle',
      };

      await storage.write('user-1', sessionData);
      await storage.delete('user-1');
      const result = await storage.read('user-1');

      expect(result).toBeUndefined();
    });

    it('should handle multiple sessions independently', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const session1: SessionData = {
        step: 'idle',
        selectedMachineId: 'machine-1',
      };
      const session2: SessionData = {
        step: 'selecting_machine',
        selectedMachineId: 'machine-2',
      };

      await storage.write('user-1', session1);
      await storage.write('user-2', session2);

      const result1 = await storage.read('user-1');
      const result2 = await storage.read('user-2');

      expect(result1).toEqual(session1);
      expect(result2).toEqual(session2);
    });

    it('should overwrite existing session data', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const session1: SessionData = {
        step: 'idle',
        selectedMachineId: 'machine-1',
      };
      const session2: SessionData = {
        step: 'selecting_machine',
        selectedMachineId: 'machine-2',
      };

      await storage.write('user-1', session1);
      await storage.write('user-1', session2);

      const result = await storage.read('user-1');

      expect(result).toEqual(session2);
    });

    it('should handle all session step types', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const steps = [
        'idle',
        'selecting_machine',
        'selecting_date',
        'entering_custom_date',
        'awaiting_location',
        'confirming',
        'entering_amount',
        'searching_machine',
        'creating_machine_code',
        'creating_machine_name',
        'setting_machine_location',
        'setting_welcome_image',
        'editing_text',
        'editing_machine_code',
        'editing_machine_name',
        'editing_machine_location',
      ];

      for (const step of steps) {
        const sessionData: SessionData = {
          step: step as any,
        };
        await storage.write(`user-${step}`, sessionData);
        const result = await storage.read(`user-${step}`);
        expect(result?.step).toBe(step);
      }
    });

    it('should handle complex session data with all optional fields', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const sessionData: SessionData = {
        step: 'confirming',
        selectedMachineId: 'machine-123',
        collectionTime: new Date('2024-01-15T10:30:00Z'),
        pendingCollectionId: 'collection-456',
        searchQuery: 'machine search',
        newMachineCode: 'NEW-001',
        newMachineName: 'New Machine',
        editingTextKey: 'welcome_text',
        editingMachineId: 'machine-789',
        editingMachineReturnPage: 'machines',
      };

      await storage.write('user-1', sessionData);
      const result = await storage.read('user-1');

      expect(result).toEqual(sessionData);
    });

    it('should handle empty session data', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const sessionData: SessionData = {
        step: 'idle',
      };

      await storage.write('user-minimal', sessionData);
      const result = await storage.read('user-minimal');

      expect(result).toEqual(sessionData);
    });
  });

  describe('RedisAdapterWithTTL', () => {
    it('should return undefined when Redis data is invalid JSON', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return 'redis.example.com';
        if (key === 'redis.port') return 6379;
        if (key === 'redis.password') return 'password';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      const Redis = require('ioredis');
      const mockRedisInstance = {
        get: jest.fn().mockResolvedValue('invalid json {'),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        on: jest.fn(),
      };
      Redis.mockImplementation(() => mockRedisInstance);

      const { storage } = createSessionStorage(mockConfigService);

      const result = await storage.read('user-1');

      expect(result).toBeUndefined();
    });

    it('should return undefined when key does not exist in Redis', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return 'redis.example.com';
        if (key === 'redis.port') return 6379;
        if (key === 'redis.password') return 'password';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      const Redis = require('ioredis');
      const mockRedisInstance = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        on: jest.fn(),
      };
      Redis.mockImplementation(() => mockRedisInstance);

      const { storage } = createSessionStorage(mockConfigService);

      const result = await storage.read('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('createRedisSessionStorage (deprecated)', () => {
    it('should return a StorageAdapter', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const storage = createRedisSessionStorage(mockConfigService);

      expect(storage).toBeDefined();
      expect(storage.read).toBeDefined();
      expect(storage.write).toBeDefined();
      expect(storage.delete).toBeDefined();
    });

    it('should return memory storage when redis not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const storage = createRedisSessionStorage(mockConfigService);

      expect(storage).toBeDefined();
      // Verify it works by testing basic operations
      const sessionData: SessionData = { step: 'idle' };
      await storage.write('test', sessionData);
      const result = await storage.read('test');
      expect(result).toEqual(sessionData);
    });
  });

  describe('Session storage integration', () => {
    it('should maintain data consistency across operations', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const initialData: SessionData = {
        step: 'idle',
        selectedMachineId: 'machine-1',
      };

      // Write initial data
      await storage.write('session-1', initialData);

      // Read and verify
      let result = await storage.read('session-1');
      expect(result).toEqual(initialData);

      // Update data
      const updatedData: SessionData = {
        ...initialData,
        step: 'selecting_machine',
      };
      await storage.write('session-1', updatedData);

      // Verify update
      result = await storage.read('session-1');
      expect(result).toEqual(updatedData);

      // Delete and verify
      await storage.delete('session-1');
      result = await storage.read('session-1');
      expect(result).toBeUndefined();
    });

    it('should support concurrent operations', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'redis.host') return undefined;
        return undefined;
      });

      const { storage } = createSessionStorage(mockConfigService);

      const sessions: SessionData[] = [];
      for (let i = 0; i < 10; i++) {
        sessions.push({
          step: 'idle',
          selectedMachineId: `machine-${i}`,
        });
      }

      // Write all sessions concurrently
      await Promise.all(
        sessions.map((data, i) => storage.write(`session-${i}`, data)),
      );

      // Read all sessions concurrently
      const results = await Promise.all(
        sessions.map((_, i) => storage.read(`session-${i}`)),
      );

      // Verify all sessions
      results.forEach((result, i) => {
        expect(result).toEqual(sessions[i]);
      });
    });
  });
});
