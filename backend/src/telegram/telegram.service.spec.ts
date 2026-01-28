import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { UsersService } from '../modules/users/users.service';
import { InvitesService } from '../modules/invites/invites.service';
import { MachinesService } from '../modules/machines/machines.service';
import { CollectionsService } from '../modules/collections/collections.service';
import { SettingsService } from '../modules/settings/settings.service';
import { User, UserRole } from '../modules/users/entities/user.entity';

// Mock grammy Bot
jest.mock('grammy', () => ({
  Bot: jest.fn().mockImplementation(() => ({
    api: {
      sendMessage: jest.fn(),
    },
    use: jest.fn(),
    command: jest.fn(),
    on: jest.fn(),
    callbackQuery: jest.fn(),
    catch: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
  InlineKeyboard: jest.fn().mockImplementation(() => ({
    text: jest.fn().mockReturnThis(),
    row: jest.fn().mockReturnThis(),
  })),
  session: jest.fn().mockReturnValue(jest.fn()),
  Context: jest.fn(),
}));

jest.mock('@grammyjs/ratelimiter', () => ({
  limit: jest.fn().mockReturnValue(jest.fn()),
}));

describe('TelegramService', () => {
  let service: TelegramService;
  let usersService: jest.Mocked<UsersService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: User = {
    id: 'user-123',
    telegramId: 123456789,
    telegramUsername: 'testuser',
    telegramFirstName: 'Test',
    name: 'Test User',
    phone: '+1234567890',
    role: UserRole.OPERATOR,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const mockManager: User = {
    id: 'manager-123',
    telegramId: 987654321,
    telegramUsername: 'manager',
    telegramFirstName: 'Manager',
    name: 'Manager User',
    role: UserRole.MANAGER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'telegram.botToken') return 'test-bot-token';
              if (key === 'telegram.welcomeImage') return 'https://example.com/image.png';
              return null;
            }),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByTelegramId: jest.fn(),
            findById: jest.fn(),
            findAllActive: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: InvitesService,
          useValue: {
            findByCode: jest.fn(),
            markAsUsed: jest.fn(),
          },
        },
        {
          provide: MachinesService,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: CollectionsService,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findPending: jest.fn(),
            receive: jest.fn(),
            cancel: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getWelcomeImage: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    usersService = module.get(UsersService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should not initialize bot when token is missing', async () => {
      configService.get.mockReturnValue(null);

      // Create a new service instance without token
      const moduleWithoutToken = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(null) },
          },
          { provide: UsersService, useValue: {} },
          { provide: InvitesService, useValue: {} },
          { provide: MachinesService, useValue: {} },
          { provide: CollectionsService, useValue: {} },
          { provide: SettingsService, useValue: {} },
        ],
      }).compile();

      const serviceWithoutToken = moduleWithoutToken.get<TelegramService>(TelegramService);

      // Should not throw
      await expect(serviceWithoutToken.onModuleInit()).resolves.not.toThrow();
    });

    it('should initialize bot when token is provided', async () => {
      await service.onModuleInit();
      // Bot should be initialized (we can't check private property directly)
      expect(configService.get).toHaveBeenCalledWith('telegram.botToken');
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return false when bot is not initialized', async () => {
      // Create service without initializing bot
      const moduleWithoutBot = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(null) },
          },
          { provide: UsersService, useValue: {} },
          { provide: InvitesService, useValue: {} },
          { provide: MachinesService, useValue: {} },
          { provide: CollectionsService, useValue: {} },
          { provide: SettingsService, useValue: {} },
        ],
      }).compile();

      const serviceWithoutBot = moduleWithoutBot.get<TelegramService>(TelegramService);

      const result = await serviceWithoutBot.sendMessage(123456789, 'Test message');
      expect(result).toBe(false);
    });

    it('should return true on successful message send', async () => {
      const result = await service.sendMessage(123456789, 'Test message');
      expect(result).toBe(true);
    });

    it('should return false when user has blocked the bot', async () => {
      // Get the mock bot
      const bot = (service as any).bot;
      bot.api.sendMessage.mockRejectedValueOnce(new Error('Forbidden: bot was blocked by the user'));

      const result = await service.sendMessage(123456789, 'Test message');
      expect(result).toBe(false);
    });

    it('should return false when chat not found', async () => {
      const bot = (service as any).bot;
      bot.api.sendMessage.mockRejectedValueOnce(new Error('Bad Request: chat not found'));

      const result = await service.sendMessage(123456789, 'Test message');
      expect(result).toBe(false);
    });

    it('should retry on transient errors', async () => {
      const bot = (service as any).bot;
      // First attempt fails with transient error, second succeeds
      bot.api.sendMessage
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockResolvedValueOnce({ message_id: 1 });

      const result = await service.sendMessage(123456789, 'Test message');
      expect(result).toBe(true);
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries on persistent transient errors', async () => {
      const bot = (service as any).bot;
      bot.api.sendMessage.mockRejectedValue(new Error('Request timeout'));

      const result = await service.sendMessage(123456789, 'Test message', 'HTML', 3);
      expect(result).toBe(false);
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe('notifyManagersAboutNewCollection', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send notifications to all active managers', async () => {
      usersService.findAllActive.mockResolvedValue([mockManager]);

      const bot = (service as any).bot;
      bot.api.sendMessage.mockResolvedValue({ message_id: 1 });

      await service.notifyManagersAboutNewCollection(
        'Machine-001',
        'Operator Name',
        new Date('2024-01-15T10:30:00Z'),
      );

      expect(usersService.findAllActive).toHaveBeenCalledWith([UserRole.MANAGER, UserRole.ADMIN]);
      expect(bot.api.sendMessage).toHaveBeenCalledWith(
        mockManager.telegramId,
        expect.stringContaining('Новая инкассация'),
        expect.any(Object),
      );
    });

    it('should handle failed sends gracefully', async () => {
      usersService.findAllActive.mockResolvedValue([mockManager, mockUser]);

      const bot = (service as any).bot;
      // First manager fails, second succeeds
      bot.api.sendMessage
        .mockRejectedValueOnce(new Error('Forbidden: bot was blocked'))
        .mockResolvedValueOnce({ message_id: 1 });

      // Should not throw
      await expect(
        service.notifyManagersAboutNewCollection(
          'Machine-001',
          'Operator Name',
          new Date(),
        ),
      ).resolves.not.toThrow();
    });

    it('should not throw when no managers found', async () => {
      usersService.findAllActive.mockResolvedValue([]);

      await expect(
        service.notifyManagersAboutNewCollection(
          'Machine-001',
          'Operator Name',
          new Date(),
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('escapeHtml (via message formatting)', () => {
    // escapeHtml is private, but we can test it indirectly
    // by checking that HTML special characters don't break message sending
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle messages with special HTML characters', async () => {
      const bot = (service as any).bot;
      bot.api.sendMessage.mockResolvedValue({ message_id: 1 });

      // Message with HTML special characters
      const result = await service.sendMessage(
        123456789,
        'Test <script>alert("xss")</script> & "quotes"',
      );

      expect(result).toBe(true);
    });
  });

  describe('getErrorMessage helper', () => {
    it('should handle Error objects as permanent errors', async () => {
      await service.onModuleInit();
      const bot = (service as any).bot;

      // Use a permanent error that won't retry
      const testError = new Error('Forbidden: user is deactivated');
      bot.api.sendMessage.mockRejectedValueOnce(testError);

      const result = await service.sendMessage(123456789, 'Test');
      expect(result).toBe(false);
      // Should only be called once (no retry for permanent errors)
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle string errors as transient', async () => {
      await service.onModuleInit();
      const bot = (service as any).bot;

      // String errors are transient and will retry
      bot.api.sendMessage
        .mockRejectedValueOnce('String error')
        .mockResolvedValueOnce({ message_id: 1 });

      const result = await service.sendMessage(123456789, 'Test');
      expect(result).toBe(true);
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle unknown error types as transient', async () => {
      await service.onModuleInit();
      const bot = (service as any).bot;

      // Unknown errors are transient and will retry
      bot.api.sendMessage
        .mockRejectedValueOnce({ unknown: 'error' })
        .mockResolvedValueOnce({ message_id: 1 });

      const result = await service.sendMessage(123456789, 'Test');
      expect(result).toBe(true);
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    });
  });
});
