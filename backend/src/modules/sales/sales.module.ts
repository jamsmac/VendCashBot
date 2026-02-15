import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { SalesOrder } from './entities/sales-order.entity';
import { ImportFile } from './entities/import-file.entity';
import { Machine } from '../machines/entities/machine.entity';
import { Collection } from '../collections/entities/collection.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { TelegramModule } from '../../telegram/telegram.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrder, ImportFile, Machine, Collection]),
    MulterModule.register({
      storage: undefined, // memory storage (default)
    }),
    TelegramModule,
    SettingsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
