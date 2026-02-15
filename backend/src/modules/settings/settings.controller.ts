import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService, AppSettingsDto } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('settings')
@Controller('settings')
@ApiBearerAuth()
@RequireModule('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('app')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get app settings (thresholds, distances, etc.)' })
  async getAppSettings(): Promise<AppSettingsDto> {
    return this.settingsService.getAppSettings();
  }

  @Put('app')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update app settings' })
  async updateAppSettings(
    @Body() body: Partial<AppSettingsDto>,
  ): Promise<AppSettingsDto> {
    return this.settingsService.updateAppSettings(body);
  }
}
