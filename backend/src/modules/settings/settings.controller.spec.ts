import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService, AppSettingsDto } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  let settingsService: jest.Mocked<SettingsService>;

  const mockAppSettings: AppSettingsDto = {
    reconciliationTolerance: 5,
    shortageAlertThreshold: 10,
    collectionDistanceMeters: 50,
    defaultPageSize: 50,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: {
            getAppSettings: jest.fn().mockResolvedValue(mockAppSettings),
            updateAppSettings: jest.fn().mockResolvedValue(mockAppSettings),
          },
        },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
    settingsService = module.get(SettingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAppSettings', () => {
    it('should return app settings', async () => {
      const result = await controller.getAppSettings();

      expect(result).toEqual(mockAppSettings);
      expect(settingsService.getAppSettings).toHaveBeenCalled();
    });
  });

  describe('updateAppSettings', () => {
    it('should update and return new settings', async () => {
      const updated = { ...mockAppSettings, reconciliationTolerance: 10 };
      settingsService.updateAppSettings.mockResolvedValue(updated);

      const result = await controller.updateAppSettings({ reconciliationTolerance: 10 });

      expect(result.reconciliationTolerance).toBe(10);
      expect(settingsService.updateAppSettings).toHaveBeenCalledWith({
        reconciliationTolerance: 10,
      });
    });

    it('should handle partial updates', async () => {
      await controller.updateAppSettings({ shortageAlertThreshold: 20 });

      expect(settingsService.updateAppSettings).toHaveBeenCalledWith({
        shortageAlertThreshold: 20,
      });
    });
  });
});
