import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';

// Setting keys
export const SETTING_KEYS = {
  WELCOME_IMAGE: 'welcome_image',
  WELCOME_TEXT: 'welcome_text',
} as const;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingsRepository: Repository<Setting>,
  ) {}

  async get(key: string): Promise<string | null> {
    const setting = await this.settingsRepository.findOne({ where: { key } });
    return setting?.value || null;
  }

  async set(key: string, value: string, description?: string): Promise<Setting> {
    let setting = await this.settingsRepository.findOne({ where: { key } });

    if (setting) {
      setting.value = value;
      if (description) {
        setting.description = description;
      }
    } else {
      setting = this.settingsRepository.create({
        key,
        value,
        description,
      });
    }

    return this.settingsRepository.save(setting);
  }

  async delete(key: string): Promise<void> {
    await this.settingsRepository.delete({ key });
  }

  async getAll(): Promise<Setting[]> {
    return this.settingsRepository.find();
  }

  // Convenience methods
  async getWelcomeImage(): Promise<string | null> {
    return this.get(SETTING_KEYS.WELCOME_IMAGE);
  }

  async setWelcomeImage(url: string): Promise<Setting> {
    return this.set(SETTING_KEYS.WELCOME_IMAGE, url, 'Welcome screen image URL');
  }
}
