import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsService, SETTING_KEYS } from './settings.service';
import { Setting } from './entities/setting.entity';

describe('SettingsService', () => {
  let service: SettingsService;
  let repository: jest.Mocked<Repository<Setting>>;

  const mockSetting: Setting = {
    id: 'setting-123',
    key: 'test_key',
    value: 'test_value',
    description: 'Test description',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(Setting),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    repository = module.get(getRepositoryToken(Setting));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return value when setting exists', async () => {
      repository.findOne.mockResolvedValue(mockSetting);

      const result = await service.get('test_key');

      expect(result).toBe('test_value');
      expect(repository.findOne).toHaveBeenCalledWith({ where: { key: 'test_key' } });
    });

    it('should return null when setting does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.get('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should update existing setting', async () => {
      const existingSetting = { ...mockSetting };
      const updatedSetting = { ...mockSetting, value: 'new_value' };

      repository.findOne.mockResolvedValue(existingSetting);
      repository.save.mockResolvedValue(updatedSetting);

      const result = await service.set('test_key', 'new_value');

      expect(result.value).toBe('new_value');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should update description when provided', async () => {
      const existingSetting = { ...mockSetting };

      repository.findOne.mockResolvedValue(existingSetting);
      repository.save.mockResolvedValue({
        ...existingSetting,
        value: 'new_value',
        description: 'new description',
      });

      const result = await service.set('test_key', 'new_value', 'new description');

      expect(result.description).toBe('new description');
    });

    it('should create new setting when not exists', async () => {
      const newSetting = {
        key: 'new_key',
        value: 'new_value',
        description: 'new description',
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(newSetting as Setting);
      repository.save.mockResolvedValue({ ...newSetting, id: 'new-id' } as Setting);

      const result = await service.set('new_key', 'new_value', 'new description');

      expect(repository.create).toHaveBeenCalledWith(newSetting);
      expect(result).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete setting by key', async () => {
      repository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.delete('test_key');

      expect(repository.delete).toHaveBeenCalledWith({ key: 'test_key' });
    });
  });

  describe('getAll', () => {
    it('should return all settings', async () => {
      repository.find.mockResolvedValue([mockSetting]);

      const result = await service.getAll();

      expect(result).toEqual([mockSetting]);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('Welcome convenience methods', () => {
    it('getWelcomeImage should get welcome_image setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.WELCOME_IMAGE,
        value: 'https://example.com/image.png',
      });

      const result = await service.getWelcomeImage();

      expect(result).toBe('https://example.com/image.png');
    });

    it('setWelcomeImage should set welcome_image setting', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({} as Setting);
      repository.save.mockResolvedValue({
        key: SETTING_KEYS.WELCOME_IMAGE,
        value: 'https://new-image.com',
      } as Setting);

      await service.setWelcomeImage('https://new-image.com');

      expect(repository.save).toHaveBeenCalled();
    });

    it('getWelcomeTitle should get welcome_title setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.WELCOME_TITLE,
        value: 'Welcome!',
      });

      const result = await service.getWelcomeTitle();

      expect(result).toBe('Welcome!');
    });

    it('getWelcomeText should get welcome_text setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.WELCOME_TEXT,
        value: 'Welcome text',
      });

      const result = await service.getWelcomeText();

      expect(result).toBe('Welcome text');
    });
  });

  describe('Help convenience methods', () => {
    it('getHelpOperator should get help_operator setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.HELP_OPERATOR,
        value: 'Operator help',
      });

      const result = await service.getHelpOperator();

      expect(result).toBe('Operator help');
    });

    it('setHelpOperator should set help_operator setting', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({} as Setting);
      repository.save.mockResolvedValue({} as Setting);

      await service.setHelpOperator('New operator help');

      expect(repository.save).toHaveBeenCalled();
    });

    it('getHelpManager should get help_manager setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.HELP_MANAGER,
        value: 'Manager help',
      });

      const result = await service.getHelpManager();

      expect(result).toBe('Manager help');
    });

    it('getHelpAdmin should get help_admin setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.HELP_ADMIN,
        value: 'Admin help',
      });

      const result = await service.getHelpAdmin();

      expect(result).toBe('Admin help');
    });
  });

  describe('Other convenience methods', () => {
    it('getCollectionSuccess should get collection_success setting', async () => {
      repository.findOne.mockResolvedValue({
        ...mockSetting,
        key: SETTING_KEYS.COLLECTION_SUCCESS,
        value: 'Collection successful!',
      });

      const result = await service.getCollectionSuccess();

      expect(result).toBe('Collection successful!');
    });

    it('setCollectionSuccess should set collection_success setting', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({} as Setting);
      repository.save.mockResolvedValue({} as Setting);

      await service.setCollectionSuccess('New success message');

      expect(repository.save).toHaveBeenCalled();
    });
  });
});
