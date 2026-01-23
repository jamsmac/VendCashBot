import { RedisAdapter } from '@grammyjs/storage-redis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export interface SessionData {
  step:
    | 'idle'
    | 'registering'
    | 'selecting_machine'
    | 'selecting_date'
    | 'entering_custom_date'
    | 'confirming'
    | 'entering_amount'
    | 'searching_machine'
    | 'creating_machine_code'
    | 'creating_machine_name'
    | 'setting_welcome_image'
    | 'editing_text';
  inviteCode?: string;
  selectedMachineId?: string;
  collectionTime?: Date;
  pendingCollectionId?: string;
  searchQuery?: string;
  newMachineCode?: string;
  editingTextKey?: string;
}

export function createRedisSessionStorage(configService: ConfigService) {
  const redis = new Redis({
    host: configService.get('redis.host') || 'localhost',
    port: configService.get('redis.port') || 6379,
    password: configService.get('redis.password'),
    keyPrefix: 'vendcash:session:',
  });

  return new RedisAdapter<SessionData>({ instance: redis });
}
