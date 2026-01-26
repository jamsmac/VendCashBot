import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Collection } from './entities/collection.entity';
import { CollectionHistory } from './entities/collection-history.entity';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { MachinesModule } from '../machines/machines.module';
import { UsersModule } from '../users/users.module';
import { TelegramModule } from '../../telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Collection, CollectionHistory]),
    MachinesModule,
    UsersModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
