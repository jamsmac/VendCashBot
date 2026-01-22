import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard, session, Context, SessionFlavor } from 'grammy';
import { UsersService } from '../modules/users/users.service';
import { InvitesService } from '../modules/invites/invites.service';
import { MachinesService } from '../modules/machines/machines.service';
import { CollectionsService } from '../modules/collections/collections.service';
import { SettingsService, SETTING_KEYS } from '../modules/settings/settings.service';
import { User, UserRole } from '../modules/users/entities/user.entity';
import { Machine, MachineStatus } from '../modules/machines/entities/machine.entity';

interface SessionData {
  step:
    | 'idle'
    | 'registering'
    | 'selecting_machine'
    | 'confirming'
    | 'entering_amount'
    | 'searching_machine'
    | 'creating_machine_code'
    | 'creating_machine_name'
    | 'setting_welcome_image';
  inviteCode?: string;
  selectedMachineId?: string;
  collectionTime?: Date;
  pendingCollectionId?: string;
  searchQuery?: string;
  newMachineCode?: string;
}

type MyContext = Context & SessionFlavor<SessionData> & { user?: User };

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str: string): boolean => UUID_REGEX.test(str);

// Escape Markdown special characters in user-provided text
// For Telegram's Markdown mode (not MarkdownV2), only escape: _ * ` [
const escapeMarkdown = (text: string | undefined | null): string => {
  if (!text) return '';
  return text.replace(/([_*`\[])/g, '\\$1');
};

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot<MyContext>;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly invitesService: InvitesService,
    private readonly machinesService: MachinesService,
    private readonly collectionsService: CollectionsService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get('telegram.botToken');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set, bot disabled');
      return;
    }

    this.bot = new Bot<MyContext>(token);

    // Session middleware
    this.bot.use(
      session({
        initial: (): SessionData => ({ step: 'idle' }),
      }),
    );

    // User middleware
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        const user = await this.usersService.findByTelegramId(ctx.from.id);
        if (user) {
          ctx.user = user;
        }
      }
      await next();
    });

    // Block non-registered users (except /start with invite)
    this.bot.use(async (ctx, next) => {
      // Allow /start command (for registration flow)
      if (ctx.message?.text?.startsWith('/start')) {
        await next();
        return;
      }

      // Block all other interactions for non-registered users
      if (!ctx.user) {
        // Show welcome image for any interaction
        await this.showWelcomeScreen(ctx);
        return;
      }

      // Block deactivated users
      if (!ctx.user.isActive) {
        await ctx.reply('❌ Ваш аккаунт деактивирован. Обратитесь к администратору.');
        return;
      }

      await next();
    });

    this.setupHandlers();

    // Start bot in background (don't await - it blocks until bot stops)
    this.bot.start({
      drop_pending_updates: true,
      onStart: () => {
        this.logger.log('Telegram bot started successfully');
      },
    }).catch((error) => {
      this.logger.error('Failed to start Telegram bot:', error);
    });
  }

  async onModuleDestroy() {
    if (this.bot) {
      await this.bot.stop();
      this.logger.log('Telegram bot stopped');
    }
  }

  private setupHandlers() {
    // /start command with optional invite code
    this.bot.command('start', async (ctx) => {
      const payload = ctx.match;

      // Already registered user
      if (ctx.user) {
        if (!ctx.user.isActive) {
          await ctx.reply('❌ Ваш аккаунт деактивирован. Обратитесь к администратору.');
          return;
        }
        const roleName =
          ctx.user.role === UserRole.OPERATOR ? '👷 Оператор' :
          ctx.user.role === UserRole.MANAGER ? '📊 Менеджер' : '👑 Админ';

        await ctx.reply(
          `👋 *${escapeMarkdown(ctx.user.name)}*\n${roleName}\n\n` +
          `Выберите действие:`,
          {
            parse_mode: 'Markdown',
            reply_markup: this.getMainMenu(ctx.user),
          },
        );
        return;
      }

      // New user without invite - show welcome image only
      if (!payload || !payload.startsWith('invite_')) {
        await this.showWelcomeScreen(ctx);
        return;
      }

      // Validate invite
      const inviteCode = payload.replace('invite_', '');
      const validation = await this.invitesService.validateInvite(inviteCode);

      if (!validation.valid) {
        await ctx.reply(`❌ ${validation.error || 'Ссылка недействительна.'}`);
        return;
      }

      // Start registration
      ctx.session.step = 'registering';
      ctx.session.inviteCode = inviteCode;

      const roleName = validation.role === UserRole.OPERATOR ? 'Оператор' : 'Менеджер';

      await ctx.reply(
        `👋 Добро пожаловать в VendCash!\n\n` +
          `Вы приглашены как: *${roleName}*\n\n` +
          `Введите ваше имя:`,
        { parse_mode: 'Markdown' },
      );
    });

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      // Registration - name input
      if (ctx.session.step === 'registering' && ctx.session.inviteCode) {
        const name = ctx.message.text.trim();

        if (name.length < 2 || name.length > 50) {
          await ctx.reply('Имя должно быть от 2 до 50 символов. Попробуйте ещё раз:');
          return;
        }

        const invite = await this.invitesService.findByCode(ctx.session.inviteCode);
        if (!invite || invite.isUsed || invite.isExpired) {
          await ctx.reply('❌ Ошибка регистрации. Запросите новую ссылку.');
          ctx.session.step = 'idle';
          return;
        }

        try {
          // Create user
          const user = await this.usersService.create({
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            telegramFirstName: ctx.from.first_name,
            name: name,
            role: invite.role,
          });

          // Mark invite as used
          await this.invitesService.markAsUsed(invite.id, user.id);

          ctx.session.step = 'idle';
          ctx.session.inviteCode = undefined;
          ctx.user = user;

          const roleName = user.role === UserRole.OPERATOR ? 'Оператор' : 'Менеджер';

          await ctx.reply(
            `✅ Регистрация завершена!\n\n👤 Имя: ${user.name}\n🎭 Роль: ${roleName}`,
            { reply_markup: this.getMainMenu(user) },
          );
        } catch (error: any) {
          await ctx.reply(`❌ Ошибка регистрации: ${error.message}`);
        }
        return;
      }

      // Amount input for receiving collection
      if (ctx.session.step === 'entering_amount' && ctx.session.pendingCollectionId && ctx.user) {
        const amountStr = ctx.message.text.replace(/\s/g, '').replace(/,/g, '');
        const amount = parseInt(amountStr, 10);
        const MAX_AMOUNT = 1_000_000_000; // 1 billion max

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('Введите корректную сумму (число > 0):');
          return;
        }

        if (amount > MAX_AMOUNT) {
          await ctx.reply(`Сумма не может превышать ${MAX_AMOUNT.toLocaleString('ru-RU')} сум`);
          return;
        }

        try {
          await this.collectionsService.receive(ctx.session.pendingCollectionId, ctx.user.id, {
            amount,
          });

          ctx.session.step = 'idle';
          ctx.session.pendingCollectionId = undefined;

          await ctx.reply(
            `✅ Инкассация принята!\n💰 Сумма: ${amount.toLocaleString('ru-RU')} сум`,
            { reply_markup: this.getMainMenu(ctx.user) },
          );
        } catch (error: any) {
          await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
        return;
      }

      // Search machine - text input
      if (ctx.session.step === 'searching_machine' && ctx.user) {
        const query = ctx.message.text.trim();

        if (query.length < 2) {
          await ctx.reply('Введите минимум 2 символа для поиска:');
          return;
        }

        ctx.session.searchQuery = query;
        const machines = await this.machinesService.search(query, true);

        const keyboard = new InlineKeyboard();

        if (machines.length > 0) {
          machines.slice(0, 8).forEach((m) => {
            const statusIcon =
              m.status === MachineStatus.APPROVED
                ? '✅'
                : m.status === MachineStatus.PENDING
                  ? '⏳'
                  : '❌';
            keyboard.text(`${statusIcon} ${m.code} - ${m.name}`, `select_found_${m.id}`).row();
          });
          if (machines.length > 8) {
            keyboard.text(`... ещё ${machines.length - 8}`, 'noop').row();
          }
        }

        keyboard.text('➕ Создать новый', 'create_new_machine').row();
        keyboard.text('◀️ В меню', 'main_menu');

        const resultText =
          machines.length > 0
            ? `🔍 Найдено: ${machines.length}\n\n✅ = подтверждён\n⏳ = ожидает подтверждения`
            : `❌ Ничего не найдено по запросу "${query}"`;

        await ctx.reply(resultText, { reply_markup: keyboard });
        return;
      }

      // Creating machine - code input
      if (ctx.session.step === 'creating_machine_code' && ctx.user) {
        const code = ctx.message.text.trim().toUpperCase();

        if (code.length < 1 || code.length > 50) {
          await ctx.reply('Код должен быть от 1 до 50 символов. Попробуйте ещё раз:');
          return;
        }

        // Check existing
        const existing = await this.machinesService.findByCode(code);
        if (existing) {
          await ctx.reply(
            `⚠️ Автомат с кодом "${code}" уже существует:\n` +
              `${existing.name}\n\n` +
              'Введите другой код или вернитесь в меню:',
            { reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu') },
          );
          return;
        }

        ctx.session.newMachineCode = code;
        ctx.session.step = 'creating_machine_name';

        await ctx.reply(`✅ Код: *${escapeMarkdown(code)}*\n\nТеперь введите название автомата:`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      // Creating machine - name input
      if (ctx.session.step === 'creating_machine_name' && ctx.user && ctx.session.newMachineCode) {
        const name = ctx.message.text.trim();

        if (name.length < 1 || name.length > 255) {
          await ctx.reply('Название должно быть от 1 до 255 символов. Попробуйте ещё раз:');
          return;
        }

        try {
          const machine = await this.machinesService.createByOperator(
            { code: ctx.session.newMachineCode, name },
            ctx.user.id,
          );

          // Notify admin
          await this.notifyAdminNewMachine(machine, ctx.user);

          ctx.session.step = 'idle';
          ctx.session.newMachineCode = undefined;

          await ctx.reply(
            `✅ *Автомат создан!*\n\n` +
              `📟 Код: ${escapeMarkdown(machine.code)}\n` +
              `📝 Название: ${escapeMarkdown(machine.name)}\n\n` +
              `⏳ Статус: *Ожидает подтверждения*\n\n` +
              `Администратор получит уведомление и проверит данные.`,
            {
              parse_mode: 'Markdown',
              reply_markup: this.getMainMenu(ctx.user),
            },
          );
        } catch (error: any) {
          await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
        return;
      }

      // Admin: Setting welcome image URL
      if (ctx.session.step === 'setting_welcome_image' && ctx.user?.role === UserRole.ADMIN) {
        const url = ctx.message.text.trim();

        // Basic URL validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          await ctx.reply(
            '❌ Неверный формат\n\n' +
            'Отправьте:\n' +
            '• URL (https://...)\n' +
            '• Или загрузите картинку напрямую 📷',
            {
              reply_markup: new InlineKeyboard().text('◀️ Отмена', 'bot_settings'),
            },
          );
          return;
        }

        try {
          await this.settingsService.setWelcomeImage(url);

          ctx.session.step = 'idle';

          await ctx.reply(
            `✅ *Изображение обновлено!*`,
            {
              parse_mode: 'Markdown',
              reply_markup: new InlineKeyboard()
                .text('👁 Предпросмотр', 'preview_welcome')
                .row()
                .text('◀️ В настройки', 'bot_settings'),
            },
          );
        } catch (error: any) {
          await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
        return;
      }
    });

    // Handle photo uploads (for welcome image)
    this.bot.on('message:photo', async (ctx) => {
      // Admin: Setting welcome image via photo upload
      if (ctx.session.step === 'setting_welcome_image' && ctx.user?.role === UserRole.ADMIN) {
        // Get the largest photo (last in array)
        const photos = ctx.message.photo;
        const largestPhoto = photos[photos.length - 1];
        const fileId = largestPhoto.file_id;

        try {
          // Store file_id prefixed with 'tg:' to distinguish from URLs
          await this.settingsService.setWelcomeImage(`tg:${fileId}`);

          ctx.session.step = 'idle';

          await ctx.reply(
            `✅ *Картинка установлена!*\n\n` +
            `Изображение сохранено из Telegram.`,
            {
              parse_mode: 'Markdown',
              reply_markup: new InlineKeyboard()
                .text('👁 Предпросмотр', 'preview_welcome')
                .row()
                .text('◀️ В настройки', 'bot_settings'),
            },
          );
        } catch (error: any) {
          await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
        return;
      }
    });

    // Callback query handlers
    this.bot.callbackQuery('main_menu', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();
      ctx.session.step = 'idle';
      await ctx.editMessageText(`👋 ${ctx.user.name}\n\nВыберите действие:`, {
        reply_markup: this.getMainMenu(ctx.user),
      });
    });

    // Search machine
    this.bot.callbackQuery('search_machine', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      ctx.session.step = 'searching_machine';

      await ctx.editMessageText(
        '🔍 *Поиск автомата*\n\n' +
          'Введите код или название автомата:\n' +
          '(минимум 2 символа)',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('◀️ Назад', 'main_menu'),
        },
      );
    });

    // Create new machine
    this.bot.callbackQuery('create_new_machine', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      ctx.session.step = 'creating_machine_code';

      await ctx.editMessageText(
        '➕ *Создание нового автомата*\n\n' + 'Шаг 1/2: Введите код (серийный номер) автомата:',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('◀️ Отмена', 'main_menu'),
        },
      );
    });

    // Select found machine (from search results)
    this.bot.callbackQuery(/^select_found_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      if (!isValidUUID(machineId)) {
        await ctx.editMessageText('❌ Неверный ID автомата');
        return;
      }
      const machine = await this.machinesService.findById(machineId);

      if (!machine) {
        await ctx.editMessageText('❌ Автомат не найден', {
          reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
        });
        return;
      }

      if (machine.status !== MachineStatus.APPROVED) {
        await ctx.editMessageText(
          `⚠️ Автомат "${machine.name}" ещё не подтверждён администратором.\n\n` +
            'Дождитесь подтверждения или выберите другой автомат.',
          {
            reply_markup: new InlineKeyboard()
              .text('🔍 Новый поиск', 'search_machine')
              .row()
              .text('◀️ В меню', 'main_menu'),
          },
        );
        return;
      }

      // Proceed to collection confirmation
      const duplicate = await this.collectionsService.checkDuplicate(machineId, new Date());
      if (duplicate) {
        const time = this.formatTime(duplicate.collectedAt);
        await ctx.editMessageText(
          `⚠️ Внимание!\n\nДля этого автомата уже есть сбор в ${time}.\nВы уверены, что хотите создать ещё один?`,
          {
            reply_markup: new InlineKeyboard()
              .text('✅ Да, создать', `confirm_dup_${machineId}`)
              .text('❌ Отмена', 'main_menu'),
          },
        );
        return;
      }

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);

      await ctx.editMessageText(
        `🏧 *${escapeMarkdown(machine.name)}*\n📟 ${escapeMarkdown(machine.code)}\n📍 ${escapeMarkdown(machine.location) || '—'}\n\n⏰ Время: *${timeStr}*\n\nПодтвердить сбор?`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', 'confirm_collection')
            .text('❌ Отмена', 'main_menu'),
        },
      );
    });

    // Noop handler (for "... more items" button)
    this.bot.callbackQuery('noop', async (ctx) => {
      await ctx.answerCallbackQuery('Используйте поиск для уточнения');
    });

    // Admin: Approve machine
    this.bot.callbackQuery(/^admin_approve_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }

      const machineId = ctx.match[1];
      if (!isValidUUID(machineId)) {
        await ctx.answerCallbackQuery('Неверный ID');
        return;
      }

      try {
        const machine = await this.machinesService.approve(machineId, ctx.user.id);

        await ctx.answerCallbackQuery('Автомат подтверждён!');
        await ctx.editMessageText(
          `✅ *Автомат подтверждён*\n\n` +
            `📟 Код: \`${escapeMarkdown(machine.code)}\`\n` +
            `📝 Название: ${escapeMarkdown(machine.name)}\n` +
            `👤 Подтвердил: ${escapeMarkdown(ctx.user.name)}`,
          { parse_mode: 'Markdown' },
        );

        // Notify creator
        await this.notifyCreatorMachineApproved(machine);
      } catch (error: any) {
        await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
      }
    });

    // Admin: Reject machine
    this.bot.callbackQuery(/^admin_reject_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }

      const machineId = ctx.match[1];
      if (!isValidUUID(machineId)) {
        await ctx.answerCallbackQuery('Неверный ID');
        return;
      }

      try {
        const machine = await this.machinesService.reject(
          machineId,
          ctx.user.id,
          'Отклонено администратором',
        );

        await ctx.answerCallbackQuery('Автомат отклонён');
        await ctx.editMessageText(
          `❌ *Автомат отклонён*\n\n` +
            `📟 Код: \`${escapeMarkdown(machine.code)}\`\n` +
            `📝 Название: ${escapeMarkdown(machine.name)}`,
          { parse_mode: 'Markdown' },
        );

        // Notify creator
        await this.notifyCreatorMachineRejected(machine);
      } catch (error: any) {
        await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
      }
    });

    // Operator: Start collection
    this.bot.callbackQuery('collect', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machines = await this.machinesService.findAllActive();

      if (machines.length === 0) {
        await ctx.editMessageText(
          '❌ Нет доступных автоматов\n\n' + 'Вы можете создать новый автомат через поиск.',
          {
            reply_markup: new InlineKeyboard()
              .text('🔍 Поиск / Создать', 'search_machine')
              .row()
              .text('◀️ Назад', 'main_menu'),
          },
        );
        return;
      }

      const keyboard = new InlineKeyboard();

      // Add search button at top
      keyboard.text('🔍 Поиск', 'search_machine').row();

      machines.slice(0, 10).forEach((m) => {
        keyboard.text(`${m.code} - ${m.name}`, `machine_${m.id}`).row();
      });

      if (machines.length > 10) {
        keyboard.text(`... ещё ${machines.length - 10} (используйте поиск)`, 'search_machine').row();
      }

      keyboard.text('◀️ Назад', 'main_menu');

      await ctx.editMessageText('🏧 Выберите автомат:', { reply_markup: keyboard });
      ctx.session.step = 'selecting_machine';
    });

    // Machine selection
    this.bot.callbackQuery(/^machine_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      if (!isValidUUID(machineId)) {
        await ctx.editMessageText('❌ Неверный ID автомата');
        return;
      }
      const machine = await this.machinesService.findById(machineId);
      if (!machine) {
        await ctx.editMessageText('❌ Автомат не найден');
        return;
      }

      // Check for duplicates
      const duplicate = await this.collectionsService.checkDuplicate(machineId, new Date());
      if (duplicate) {
        const time = this.formatTime(duplicate.collectedAt);
        await ctx.editMessageText(
          `⚠️ Внимание!\n\nДля этого автомата уже есть сбор в ${time}.\nВы уверены, что хотите создать ещё один?`,
          {
            reply_markup: new InlineKeyboard()
              .text('✅ Да, создать', `confirm_dup_${machineId}`)
              .text('❌ Отмена', 'main_menu'),
          },
        );
        return;
      }

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);

      await ctx.editMessageText(
        `🏧 *${escapeMarkdown(machine.name)}*\n📟 ${escapeMarkdown(machine.code)}\n📍 ${escapeMarkdown(machine.location) || '—'}\n\n⏰ Время: *${timeStr}*\n\nПодтвердить сбор?`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', 'confirm_collection')
            .text('❌ Отмена', 'main_menu'),
        },
      );
    });

    // Confirm duplicate
    this.bot.callbackQuery(/^confirm_dup_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      if (!isValidUUID(machineId)) {
        await ctx.editMessageText('❌ Неверный ID автомата');
        return;
      }
      const machine = await this.machinesService.findById(machineId);
      if (!machine) {
        await ctx.editMessageText('❌ Автомат не найден');
        return;
      }

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);

      await ctx.editMessageText(
        `🏧 *${escapeMarkdown(machine.name)}*\n📟 ${escapeMarkdown(machine.code)}\n📍 ${escapeMarkdown(machine.location) || '—'}\n\n⏰ Время: *${timeStr}*\n\nПодтвердить сбор?`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', 'confirm_collection')
            .text('❌ Отмена', 'main_menu'),
        },
      );
    });

    // Confirm collection
    this.bot.callbackQuery('confirm_collection', async (ctx) => {
      if (!ctx.user || !ctx.session.selectedMachineId || !ctx.session.collectionTime) {
        await ctx.answerCallbackQuery('⚠️ Сессия истекла, начните заново');
        if (ctx.user) {
          await ctx.editMessageText('⚠️ Сессия истекла. Вернитесь в главное меню.', {
            reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
          });
        }
        return;
      }
      await ctx.answerCallbackQuery();

      try {
        const collection = await this.collectionsService.create(
          {
            machineId: ctx.session.selectedMachineId,
            collectedAt: ctx.session.collectionTime,
            skipDuplicateCheck: true,
          },
          ctx.user.id,
        );

        const machine = await this.machinesService.findById(ctx.session.selectedMachineId);

        ctx.session.step = 'idle';
        ctx.session.selectedMachineId = undefined;
        ctx.session.collectionTime = undefined;

        await ctx.editMessageText(
          `✅ *Сбор зарегистрирован!*\n\n🏧 ${escapeMarkdown(machine?.name)}\n🔢 #${collection.id.slice(0, 8)}`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
      }
    });

    // My collections today
    this.bot.callbackQuery('my_collections', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const collections = await this.collectionsService.findByOperator(ctx.user.id, new Date());

      if (collections.length === 0) {
        await ctx.editMessageText('📋 У вас нет сборов за сегодня', {
          reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
        });
        return;
      }

      const lines = collections.map((c) => {
        const time = this.formatTime(c.collectedAt);
        const status = c.status === 'collected' ? '⏳' : c.status === 'received' ? '✅' : '❌';
        return `${status} ${time} ${c.machine.name}`;
      });

      await ctx.editMessageText(`📋 Ваши сборы за сегодня:\n\n${lines.join('\n')}`, {
        reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
      });
    });

    // Manager: Pending collections
    this.bot.callbackQuery('pending_collections', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const pending = await this.collectionsService.findPending();

      if (pending.length === 0) {
        await ctx.editMessageText('✅ Нет ожидающих приёма', {
          reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      pending.slice(0, 10).forEach((c) => {
        const time = this.formatTime(c.collectedAt);
        keyboard.text(`${time} ${c.machine.name}`, `receive_${c.id}`).row();
      });
      keyboard.text('◀️ В меню', 'main_menu');

      await ctx.editMessageText(`📥 Ожидают приёма: ${pending.length}`, { reply_markup: keyboard });
    });

    // Receive collection
    this.bot.callbackQuery(/^receive_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const collectionId = ctx.match[1];
      if (!isValidUUID(collectionId)) {
        await ctx.editMessageText('❌ Неверный ID инкассации');
        return;
      }
      const collection = await this.collectionsService.findById(collectionId);
      if (!collection) {
        await ctx.editMessageText('❌ Инкассация не найдена');
        return;
      }

      ctx.session.step = 'entering_amount';
      ctx.session.pendingCollectionId = collection.id;

      const time = this.formatDateTime(collection.collectedAt);

      await ctx.editMessageText(
        `💰 *Введите сумму (сум):*\n\n🏧 ${escapeMarkdown(collection.machine.name)}\n⏰ ${time}\n👷 ${escapeMarkdown(collection.operator.name)}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Admin: Invite user
    this.bot.callbackQuery('invite_user', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      await ctx.editMessageText('Выберите роль:', {
        reply_markup: new InlineKeyboard()
          .text('👷 Оператор', 'create_invite_operator')
          .row()
          .text('📊 Менеджер', 'create_invite_manager')
          .row()
          .text('◀️ Назад', 'main_menu'),
      });
    });

    // Create invite
    this.bot.callbackQuery(/^create_invite_(operator|manager)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const role = ctx.match[1] === 'operator' ? UserRole.OPERATOR : UserRole.MANAGER;
      const roleName = role === UserRole.OPERATOR ? 'Оператор' : 'Менеджер';

      try {
        const invite = await this.invitesService.create(ctx.user.id, role);
        const botInfo = await this.bot.api.getMe();
        const link = `https://t.me/${botInfo.username}?start=invite_${invite.code}`;

        // Send as a new message (not edit) for easy forwarding
        await ctx.deleteMessage().catch(() => {});

        await ctx.reply(
          `📨 *Приглашение в VendCash*\n\n` +
          `👤 Роль: *${roleName}*\n` +
          `⏰ Действует: *24 часа*\n\n` +
          `👇 Нажмите на ссылку для регистрации:\n\n` +
          `${link}`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .url('🚀 Открыть бот', link)
              .row()
              .text('🔄 Новая ссылка', `create_invite_${ctx.match[1]}`)
              .text('◀️ В меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        await ctx.reply(`❌ Ошибка: ${error.message}`);
      }
    });

    // Admin: Pending machines
    this.bot.callbackQuery('pending_machines', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const pending = await this.machinesService.findPending();

      if (pending.length === 0) {
        await ctx.editMessageText('✅ Нет автоматов на модерации', {
          reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      pending.slice(0, 10).forEach((m) => {
        keyboard.text(`${m.code} - ${m.name}`, `review_machine_${m.id}`).row();
      });
      keyboard.text('◀️ В меню', 'main_menu');

      await ctx.editMessageText(`🔍 На модерации: ${pending.length}`, { reply_markup: keyboard });
    });

    // Admin: Review single machine
    this.bot.callbackQuery(/^review_machine_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      if (!isValidUUID(machineId)) {
        await ctx.editMessageText('❌ Неверный ID автомата');
        return;
      }
      const machine = await this.machinesService.findByIdWithCreator(machineId);

      if (!machine) {
        await ctx.editMessageText('❌ Автомат не найден');
        return;
      }

      const creatorInfo = machine.createdBy
        ? `👤 Создал: ${escapeMarkdown(machine.createdBy.name)} (@${escapeMarkdown(machine.createdBy.telegramUsername) || 'нет'})`
        : '👤 Создал: неизвестно';

      await ctx.editMessageText(
        `🔍 *Автомат на модерации*\n\n` +
          `📟 Код: \`${escapeMarkdown(machine.code)}\`\n` +
          `📝 Название: ${escapeMarkdown(machine.name)}\n` +
          `📍 Локация: ${escapeMarkdown(machine.location) || '—'}\n` +
          `${creatorInfo}\n` +
          `📅 Создан: ${this.formatDateTime(machine.createdAt)}`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', `admin_approve_${machine.id}`)
            .text('❌ Отклонить', `admin_reject_${machine.id}`)
            .row()
            .text('◀️ Назад', 'pending_machines'),
        },
      );
    });

    // Web panel link
    this.bot.callbackQuery('web_panel', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const webUrl = this.configService.get('frontendUrl');
      await ctx.editMessageText(`🌐 Веб-панель:\n${webUrl}`, {
        reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
      });
    });

    // Help
    this.bot.callbackQuery('help', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      let helpText = '❓ *Помощь*\n\n';

      if (ctx.user.role === UserRole.OPERATOR) {
        helpText +=
          '👷 *Оператор*\n' +
          '• "Отметить сбор" — регистрация инкассации\n' +
          '• "Поиск" — найти автомат по коду или названию\n' +
          '• Если автомат не найден — можно создать новый\n' +
          '• Новый автомат будет доступен после подтверждения админом';
      } else if (ctx.user.role === UserRole.MANAGER) {
        helpText +=
          '📊 *Менеджер*\n' +
          '• "Ожидают приёма" — список инкассаций для приёма\n' +
          '• Нажмите на инкассацию и введите сумму\n' +
          '• Используйте веб-панель для отчётов';
      } else {
        helpText +=
          '👑 *Администратор*\n' +
          '• "На модерации" — автоматы, ожидающие подтверждения\n' +
          '• "Пригласить" — создать ссылку для нового сотрудника\n' +
          '• Используйте веб-панель для полного управления';
      }

      await ctx.editMessageText(helpText, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('⚙️ Настройки', 'settings')
          .row()
          .text('◀️ В меню', 'main_menu'),
      });
    });

    // Settings
    this.bot.callbackQuery('settings', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      await ctx.editMessageText(
        `⚙️ *Настройки*\n\n` +
        `👤 ${escapeMarkdown(ctx.user.name)}\n` +
        `🎭 ${ctx.user.role === UserRole.OPERATOR ? 'Оператор' : ctx.user.role === UserRole.MANAGER ? 'Менеджер' : 'Администратор'}\n\n` +
        `⚠️ Деактивация аккаунта необратима.\n` +
        `Для восстановления потребуется\n` +
        `новое приглашение от админа.`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('🚫 Деактивировать аккаунт', 'confirm_deactivate')
            .row()
            .text('◀️ Назад', 'help'),
        },
      );
    });

    // Confirm deactivation
    this.bot.callbackQuery('confirm_deactivate', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      await ctx.editMessageText(
        `⚠️ *Вы уверены?*\n\n` +
        `После деактивации:\n` +
        `• Вы потеряете доступ к боту\n` +
        `• Потребуется новое приглашение\n` +
        `• Ваши данные сохранятся`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('❌ Да, деактивировать', 'do_deactivate')
            .row()
            .text('◀️ Отмена', 'settings'),
        },
      );
    });

    // Do deactivation
    this.bot.callbackQuery('do_deactivate', async (ctx) => {
      if (!ctx.user) return;

      try {
        await this.usersService.deactivate(ctx.user.id);
        await ctx.answerCallbackQuery('Аккаунт деактивирован');

        await ctx.editMessageText(
          `👋 *Аккаунт деактивирован*\n\n` +
          `Спасибо за использование VendCash!\n\n` +
          `Для восстановления доступа\n` +
          `обратитесь к администратору.`,
          { parse_mode: 'Markdown' },
        );
      } catch (error: any) {
        await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
      }
    });

    // Admin: Bot settings
    this.bot.callbackQuery('bot_settings', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery();

      const currentImage = await this.settingsService.getWelcomeImage();
      const imageType = currentImage
        ? currentImage.startsWith('tg:')
          ? '📷 Загружено'
          : '🔗 URL'
        : '❌ По умолчанию';

      await ctx.editMessageText(
        `⚙️ *Настройки бота*\n\n` +
        `━━━━━━━━━━━━━━━━━\n\n` +
        `🖼 *Приветственная картинка*\n` +
        `Статус: ${imageType}\n\n` +
        `Отображается пользователям\n` +
        `без приглашения`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('📷 Изменить картинку', 'change_welcome_image')
            .row()
            .text('👁 Предпросмотр', 'preview_welcome')
            .text('🗑 Сбросить', 'reset_welcome_image')
            .row()
            .text('◀️ В меню', 'main_menu'),
        },
      );
    });

    // Admin: Change welcome image
    this.bot.callbackQuery('change_welcome_image', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery();

      ctx.session.step = 'setting_welcome_image';

      await ctx.editMessageText(
        `🖼 *Изменение картинки*\n\n` +
        `Выберите способ:\n\n` +
        `📷 *Загрузить фото* — просто отправьте\n` +
        `изображение в этот чат\n\n` +
        `🔗 *URL* — отправьте ссылку на\n` +
        `изображение (https://...)`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('◀️ Отмена', 'bot_settings'),
        },
      );
    });

    // Admin: Preview welcome screen
    this.bot.callbackQuery('preview_welcome', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery('Показываю превью...');

      // Show the welcome screen as preview
      await this.showWelcomeScreen(ctx);

      await ctx.reply('👆 Так видят экран незарегистрированные пользователи', {
        reply_markup: new InlineKeyboard().text('◀️ В настройки', 'bot_settings'),
      });
    });

    // Admin: Reset welcome image to default
    this.bot.callbackQuery('reset_welcome_image', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }

      try {
        await this.settingsService.setWelcomeImage('');
        await ctx.answerCallbackQuery('Сброшено');

        await ctx.editMessageText(
          `✅ *Картинка сброшена*\n\n` +
          `Теперь используется картинка по умолчанию.`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('👁 Предпросмотр', 'preview_welcome')
              .row()
              .text('◀️ В настройки', 'bot_settings'),
          },
        );
      } catch (error: any) {
        await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
      }
    });
  }

  private getMainMenu(user: User): InlineKeyboard {
    const kb = new InlineKeyboard();

    if (user.role === UserRole.OPERATOR) {
      kb.text('🏧 Отметить сбор', 'collect').row();
      kb.text('🔍 Поиск автомата', 'search_machine').row();
      kb.text('📋 Мои сборы', 'my_collections').row();
      kb.text('❓ Помощь', 'help');
    } else if (user.role === UserRole.MANAGER) {
      kb.text('📥 Принять инкассацию', 'pending_collections').row();
      kb.text('🔍 Поиск автомата', 'search_machine').row();
      kb.text('🌐 Веб-панель', 'web_panel').row();
      kb.text('❓ Помощь', 'help');
    } else {
      // Admin - organized menu
      kb.text('📥 Принять инкассацию', 'pending_collections')
        .text('🔍 Модерация', 'pending_machines').row();
      kb.text('👥 Пригласить', 'invite_user')
        .text('⚙️ Настройки', 'bot_settings').row();
      kb.text('🌐 Веб-панель', 'web_panel')
        .text('❓ Помощь', 'help').row();
    }

    return kb;
  }

  private async notifyAdminNewMachine(machine: Machine, creator: User): Promise<void> {
    const adminTelegramId = this.configService.get<number>('admin.telegramId');

    if (!adminTelegramId || adminTelegramId === 0) {
      this.logger.warn('Admin Telegram ID not configured, skipping notification');
      return;
    }

    const message =
      `🆕 *Новый автомат ожидает подтверждения*\n\n` +
      `📟 Код: \`${escapeMarkdown(machine.code)}\`\n` +
      `📝 Название: ${escapeMarkdown(machine.name)}\n` +
      `👤 Создал: ${escapeMarkdown(creator.name)} (@${escapeMarkdown(creator.telegramUsername) || 'нет'})\n` +
      `📅 Дата: ${this.formatDateTime(machine.createdAt)}`;

    const keyboard = new InlineKeyboard()
      .text('✅ Подтвердить', `admin_approve_${machine.id}`)
      .text('❌ Отклонить', `admin_reject_${machine.id}`);

    try {
      await this.bot.api.sendMessage(adminTelegramId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      this.logger.error('Failed to send admin notification:', error);
    }
  }

  private async notifyCreatorMachineApproved(machine: Machine): Promise<void> {
    if (!machine.createdById) return;

    try {
      const creator = await this.usersService.findById(machine.createdById);
      if (!creator || !creator.telegramId) return;

      await this.bot.api.sendMessage(
        creator.telegramId,
        `✅ Ваш автомат подтверждён!\n\n` +
          `📟 Код: ${machine.code}\n` +
          `📝 Название: ${machine.name}\n\n` +
          `Теперь вы можете использовать его для инкассаций.`,
      );
    } catch (error) {
      this.logger.error('Failed to notify creator about approval:', error);
    }
  }

  private async notifyCreatorMachineRejected(machine: Machine): Promise<void> {
    if (!machine.createdById) return;

    try {
      const creator = await this.usersService.findById(machine.createdById);
      if (!creator || !creator.telegramId) return;

      await this.bot.api.sendMessage(
        creator.telegramId,
        `❌ Ваш автомат отклонён\n\n` +
          `📟 Код: ${machine.code}\n` +
          `📝 Название: ${machine.name}\n\n` +
          `Причина: ${machine.rejectionReason || 'не указана'}`,
      );
    } catch (error) {
      this.logger.error('Failed to notify creator about rejection:', error);
    }
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('ru-RU', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private async showWelcomeScreen(ctx: MyContext): Promise<void> {
    // Welcome image from DB settings, fallback to env, then default
    const welcomeImage =
      (await this.settingsService.getWelcomeImage()) ||
      this.configService.get<string>('telegram.welcomeImage') ||
      'https://i.imgur.com/JQvVqXh.png';

    const caption =
      `🏧 *VendCash*\n\n` +
      `Система учёта инкассации\n` +
      `вендинговых автоматов\n\n` +
      `━━━━━━━━━━━━━━━━━\n\n` +
      `🔐 Для доступа необходимо\n` +
      `получить приглашение от\n` +
      `администратора`;

    try {
      // Check if it's a Telegram file_id (prefixed with 'tg:')
      const imageSource = welcomeImage.startsWith('tg:')
        ? welcomeImage.slice(3) // Remove 'tg:' prefix
        : welcomeImage;

      await ctx.replyWithPhoto(imageSource, {
        caption,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      // Fallback to text if image fails
      await ctx.reply(caption, { parse_mode: 'Markdown' });
    }
  }
}
