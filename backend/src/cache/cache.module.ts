import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

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

        // If Redis is not configured, use in-memory cache
        if (!redisHost || redisHost === 'localhost') {
          return {
            ttl,
            max: 100, // Maximum number of items in cache
          };
        }

        // Use Redis store
        return {
          store: await redisStore({
            host: redisHost,
            port: redisPort,
            password: redisPassword,
            ttl,
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
