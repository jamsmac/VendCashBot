import { StorageAdapter } from 'grammy';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('SessionStorage');

export interface SessionData {
  step:
    | 'idle'
    | 'selecting_machine'
    | 'selecting_date'
    | 'entering_custom_date'
    | 'awaiting_location'
    | 'confirming'
    | 'entering_amount'
    | 'searching_machine'
    | 'creating_machine_code'
    | 'creating_machine_name'
    | 'setting_machine_location'
    | 'setting_welcome_image'
    | 'editing_text';
  selectedMachineId?: string;
  collectionTime?: Date;
  pendingCollectionId?: string;
  searchQuery?: string;
  newMachineCode?: string;
  newMachineName?: string;
  editingTextKey?: string;
}

/**
 * Check if Redis is properly configured (not using localhost defaults)
 */
export function isRedisConfigured(configService: ConfigService): boolean {
  const redisHost = configService.get('redis.host');
  // Redis is configured if host is set and not localhost (the default)
  return !!redisHost && redisHost !== 'localhost';
}

/**
 * Simple in-memory session storage adapter for grammy
 */
class MemorySessionStorage<T> implements StorageAdapter<T> {
  private sessions: Map<string, T> = new Map();

  read(key: string): Promise<T | undefined> {
    return Promise.resolve(this.sessions.get(key));
  }

  write(key: string, value: T): Promise<void> {
    this.sessions.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.sessions.delete(key);
    return Promise.resolve();
  }
}

/**
 * Redis session storage adapter with TTL support
 */
class RedisAdapterWithTTL<T> implements StorageAdapter<T> {
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(private readonly redis: Redis) {}

  async read(key: string): Promise<T | undefined> {
    const data = await this.redis.get(key);
    if (!data) return undefined;
    try {
      return JSON.parse(data) as T;
    } catch {
      return undefined;
    }
  }

  async write(key: string, value: T): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', this.TTL_SECONDS);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

/**
 * Create session storage - Redis if configured, otherwise in-memory
 */
export function createSessionStorage(
  configService: ConfigService,
): { storage: StorageAdapter<SessionData>; type: 'redis' | 'memory' } {
  if (!isRedisConfigured(configService)) {
    logger.warn('Redis not configured, using in-memory session storage');
    return {
      storage: new MemorySessionStorage<SessionData>(),
      type: 'memory',
    };
  }

  try {
    const redis = new Redis({
      host: configService.get('redis.host'),
      port: configService.get('redis.port') || 6379,
      password: configService.get('redis.password'),
      keyPrefix: 'vendcash:session:',
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    // Handle connection errors gracefully
    redis.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });

    return {
      storage: new RedisAdapterWithTTL<SessionData>(redis),
      type: 'redis',
    };
  } catch (error) {
    logger.error(`Failed to create Redis adapter: ${error.message}`);
    logger.warn('Falling back to in-memory session storage');
    return {
      storage: new MemorySessionStorage<SessionData>(),
      type: 'memory',
    };
  }
}

/**
 * @deprecated Use createSessionStorage instead
 */
export function createRedisSessionStorage(configService: ConfigService) {
  return createSessionStorage(configService).storage;
}
