import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

const logger = new Logger('CacheModule');

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('redis.host');
        const redisPort = configService.get('redis.port');
        const redisPassword = configService.get('redis.password');
        const ttl = configService.get('redis.ttl') * 1000; // Convert to milliseconds

        // If Redis is not configured (localhost is the default), use in-memory cache
        if (!redisHost || redisHost === 'localhost') {
          logger.warn('Redis not configured, using in-memory cache');
          return {
            ttl,
            max: 100, // Maximum number of items in cache
          };
        }

        // Try to use Redis store with error handling
        try {
          const store = await redisStore({
            host: redisHost,
            port: redisPort,
            password: redisPassword,
            ttl,
            maxRetriesPerRequest: 3,
            retryStrategy(times: number) {
              if (times > 3) {
                logger.error('Redis connection failed after 3 retries');
                return null; // Stop retrying
              }
              return Math.min(times * 100, 3000);
            },
          });

          logger.log(`Cache connected to Redis at ${redisHost}:${redisPort}`);
          return { store };
        } catch (error) {
          logger.error(`Failed to connect to Redis: ${error.message}`);
          logger.warn('Falling back to in-memory cache');
          return {
            ttl,
            max: 100,
          };
        }
      },
      inject: [ConfigService],
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
