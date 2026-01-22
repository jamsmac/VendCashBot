import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { UsersModule } from '../modules/users/users.module';
import { InvitesModule } from '../modules/invites/invites.module';
import { MachinesModule } from '../modules/machines/machines.module';
import { CollectionsModule } from '../modules/collections/collections.module';
import { SettingsModule } from '../modules/settings/settings.module';

@Module({
  imports: [UsersModule, InvitesModule, MachinesModule, CollectionsModule, SettingsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
