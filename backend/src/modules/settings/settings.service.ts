import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';

// Setting keys
export const SETTING_KEYS = {
  WELCOME_IMAGE: 'welcome_image',
  WELCOME_TEXT: 'welcome_text',
  WELCOME_TITLE: 'welcome_title',
  HELP_OPERATOR: 'help_operator',
  HELP_MANAGER: 'help_manager',
  HELP_ADMIN: 'help_admin',
  COLLECTION_SUCCESS: 'collection_success',
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

  // Convenience methods - Welcome
  async getWelcomeImage(): Promise<string | null> {
    return this.get(SETTING_KEYS.WELCOME_IMAGE);
  }

  async setWelcomeImage(url: string): Promise<Setting> {
    return this.set(SETTING_KEYS.WELCOME_IMAGE, url, 'Welcome screen image URL');
  }

  async getWelcomeTitle(): Promise<string | null> {
    return this.get(SETTING_KEYS.WELCOME_TITLE);
  }

  async setWelcomeTitle(text: string): Promise<Setting> {
    return this.set(SETTING_KEYS.WELCOME_TITLE, text, 'Welcome screen title');
  }

  async getWelcomeText(): Promise<string | null> {
    return this.get(SETTING_KEYS.WELCOME_TEXT);
  }

  async setWelcomeText(text: string): Promise<Setting> {
    return this.set(SETTING_KEYS.WELCOME_TEXT, text, 'Welcome screen description');
  }

  // Convenience methods - Help texts
  async getHelpOperator(): Promise<string | null> {
    return this.get(SETTING_KEYS.HELP_OPERATOR);
  }

  async setHelpOperator(text: string): Promise<Setting> {
    return this.set(SETTING_KEYS.HELP_OPERATOR, text, 'Help text for operators');
  }

  async getHelpManager(): Promise<string | null> {
    return this.get(SETTING_KEYS.HELP_MANAGER);
  }

  async setHelpManager(text: string): Promise<Setting> {
    return this.set(SETTING_KEYS.HELP_MANAGER, text, 'Help text for managers');
  }

  async getHelpAdmin(): Promise<string | null> {
    return this.get(SETTING_KEYS.HELP_ADMIN);
  }

  async setHelpAdmin(text: string): Promise<Setting> {
    return this.set(SETTING_KEYS.HELP_ADMIN, text, 'Help text for admins');
  }

  // Convenience methods - Other texts
  async getCollectionSuccess(): Promise<string | null> {
    return this.get(SETTING_KEYS.COLLECTION_SUCCESS);
  }

  async setCollectionSuccess(text: string): Promise<Setting> {
    return this.set(SETTING_KEYS.COLLECTION_SUCCESS, text, 'Collection success message');
  }
}
