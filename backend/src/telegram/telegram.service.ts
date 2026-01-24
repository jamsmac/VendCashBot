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
import { createSessionStorage, SessionData } from './session-storage';

type MyContext = Context & SessionFlavor<SessionData> & { user?: User };

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str: string): boolean => UUID_REGEX.test(str);

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

    // Global error handler
    this.bot.catch((err) => {
      const ctx = err.ctx;
      const error = err.error;

      // Handle "bot was blocked by the user" errors silently
      if (error instanceof Error && error.message.includes('bot was blocked by the user')) {
        this.logger.debug(`User ${ctx.from?.id} has blocked the bot`);
        return;
      }

      // Handle other Telegram API errors
      if (error instanceof Error && error.message.includes('Forbidden')) {
        this.logger.debug(`Telegram API forbidden error for user ${ctx.from?.id}: ${error.message}`);
        return;
      }

      // Log other errors
      this.logger.error(`Error while handling update ${ctx.update.update_id}:`, error);
    });

    // Session middleware - use Redis if available, otherwise in-memory
    const { storage, type } = createSessionStorage(this.configService);
    this.bot.use(
      session({
        initial: (): SessionData => ({ step: 'idle' }),
        storage,
      }),
    );
    if (type === 'redis') {
      this.logger.log('Telegram sessions: Redis');
    } else {
      this.logger.warn('Telegram sessions: In-memory (not recommended for production)');
    }

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
        try {
          await ctx.reply('❌ Ваш аккаунт деактивирован. Обратитесь к администратору.');
        } catch {
          // User may have blocked the bot - ignore
        }
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
          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ⛔️  <b>ДОСТУП ЗАКРЫТ</b>\n` +
            `╰─────────────────────╯\n\n` +
            `Ваш аккаунт деактивирован.\n` +
            `Обратитесь к администратору.`,
            { parse_mode: 'HTML' },
          );
          return;
        }
        const roleBadge = this.getRoleBadge(ctx.user.role);
        const safeName = this.escapeHtml(ctx.user.name);

        await ctx.reply(
          `╭─────────────────────╮\n` +
          `│  🏧  <b>VendCash</b>\n` +
          `╰─────────────────────╯\n\n` +
          `👤  <b>${safeName}</b>\n` +
          `${roleBadge}\n\n` +
          `Выберите действие:`,
          {
            parse_mode: 'HTML',
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

      // Check for empty invite code
      if (!inviteCode || inviteCode.length === 0) {
        await ctx.reply('❌ Неверная ссылка приглашения.');
        return;
      }

      const validation = await this.invitesService.validateInvite(inviteCode);

      if (!validation.valid) {
        // Translate error messages to Russian
        let errorMsg = 'Ссылка недействительна.';
        if (validation.error === 'Invite not found') {
          errorMsg = 'Приглашение не найдено.';
        } else if (validation.error === 'Invite already used') {
          errorMsg = 'Приглашение уже использовано.';
        } else if (validation.error === 'Invite has expired') {
          errorMsg = 'Срок действия приглашения истёк.';
        }
        await ctx.reply(`❌ ${errorMsg}`);
        return;
      }

      // Auto-register with Telegram name
      if (!ctx.from) {
        await ctx.reply('❌ Ошибка: не удалось получить данные пользователя.');
        return;
      }

      const name = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
      const roleBadge = this.getRoleBadge(validation.role!);

      try {
        const invite = await this.invitesService.findByCode(inviteCode);
        if (!invite || invite.isUsed || invite.isExpired) {
          await ctx.reply('❌ Ошибка регистрации. Запросите новую ссылку.');
          return;
        }

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
        ctx.user = user;

        const safeName = this.escapeHtml(user.name);

        await ctx.reply(
          `╭─────────────────────╮\n` +
          `│  ✅  <b>ДОБРО ПОЖАЛОВАТЬ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `👤  <b>${safeName}</b>\n` +
          `${roleBadge}\n\n` +
          `Выберите действие:`,
          {
            parse_mode: 'HTML',
            reply_markup: this.getMainMenu(user),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.reply(`❌ Ошибка регистрации: ${safeError}`);
      }
    });

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      // Registration - name input
      // Amount input for receiving collection
      if (ctx.session.step === 'entering_amount' && ctx.session.pendingCollectionId && ctx.user) {
        const amountStr = ctx.message.text.replace(/\s/g, '').replace(/,/g, '');
        const amount = parseInt(amountStr, 10);
        const maxAmount = this.configService.get<number>('app.maxCollectionAmount') || 1_000_000_000;

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('Введите корректную сумму (число > 0):');
          return;
        }

        if (amount > maxAmount) {
          await ctx.reply(`Сумма не может превышать ${maxAmount.toLocaleString('ru-RU')} сум`);
          return;
        }

        try {
          await this.collectionsService.receive(ctx.session.pendingCollectionId, ctx.user.id, {
            amount,
          });

          ctx.session.step = 'idle';
          ctx.session.pendingCollectionId = undefined;

          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ✅  <b>ПРИНЯТО</b>\n` +
            `╰─────────────────────╯\n\n` +
            `💰  <b>${amount.toLocaleString('ru-RU')}</b> сум\n\n` +
            `Инкассация успешно принята!`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('📥 Ещё приём', 'pending_collections')
                .text('🏠 Меню', 'main_menu'),
            },
          );
        } catch (error: any) {
          const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
          await ctx.reply(`❌ Ошибка: ${safeError}`);
          ctx.session.step = 'idle';
          ctx.session.pendingCollectionId = undefined;
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

        const safeQuery = this.escapeHtml(query);
        const resultText =
          machines.length > 0
            ? `🔍 Найдено: ${machines.length}\n\n✅ = подтверждён\n⏳ = ожидает подтверждения`
            : `❌ Ничего не найдено по запросу "${safeQuery}"`;

        await ctx.reply(resultText, { parse_mode: 'HTML', reply_markup: keyboard });
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
          const safeExistingName = this.escapeHtml(existing.name);
          await ctx.reply(
            `⚠️ Автомат с кодом "${this.escapeHtml(code)}" уже существует:\n` +
              `${safeExistingName}\n\n` +
              'Введите другой код или вернитесь в меню:',
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
            },
          );
          return;
        }

        ctx.session.newMachineCode = code;
        ctx.session.step = 'creating_machine_name';

        await ctx.reply(
          `╭─────────────────────╮\n` +
          `│  ➕  <b>НОВЫЙ АВТОМАТ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `📍 Шаг <b>2</b> из 2\n\n` +
          `📟  Код: <code>${code}</code>\n\n` +
          `Введите название автомата:`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('✖️ Отмена', 'main_menu'),
          },
        );
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
          const safeMachineName = this.escapeHtml(machine.name);

          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ✅  <b>СОЗДАНО</b>\n` +
            `╰─────────────────────╯\n\n` +
            `📟  Код: <code>${machine.code}</code>\n` +
            `📝  Название: ${safeMachineName}\n\n` +
            `────────────────────\n` +
            `⏳  <b>Ожидает подтверждения</b>\n\n` +
            `Админ получит уведомление\n` +
            `и проверит данные.`,
            {
              parse_mode: 'HTML',
              reply_markup: this.getMainMenu(ctx.user),
            },
          );
        } catch (error: any) {
          const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
          await ctx.reply(`❌ Ошибка: ${safeError}`);
          ctx.session.step = 'idle';
          ctx.session.newMachineCode = undefined;
        }
        return;
      }

      // Custom date/time input for collection
      if (ctx.session.step === 'entering_custom_date' && ctx.user && ctx.session.selectedMachineId) {
        const input = ctx.message.text.trim();
        let parsedDate: Date | null = null;

        // Try to parse "HH:MM" (time only - for today)
        const timeOnlyMatch = input.match(/^(\d{1,2}):(\d{2})$/);
        if (timeOnlyMatch) {
          const hours = parseInt(timeOnlyMatch[1], 10);
          const minutes = parseInt(timeOnlyMatch[2], 10);

          if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            parsedDate = new Date();
            parsedDate.setHours(hours, minutes, 0, 0);
          }
        }

        // Try to parse "DD.MM.YYYY HH:MM"
        const fullMatch = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
        if (!parsedDate && fullMatch) {
          const day = parseInt(fullMatch[1], 10);
          const month = parseInt(fullMatch[2], 10) - 1;
          const year = parseInt(fullMatch[3], 10);
          const hours = parseInt(fullMatch[4], 10);
          const minutes = parseInt(fullMatch[5], 10);

          if (day >= 1 && day <= 31 && month >= 0 && month <= 11 &&
              year >= 2020 && year <= 2030 &&
              hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            parsedDate = new Date(year, month, day, hours, minutes, 0, 0);
          }
        }

        // Try to parse "DD.MM.YYYY" (date only - use current time)
        const dateOnlyMatch = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (!parsedDate && dateOnlyMatch) {
          const day = parseInt(dateOnlyMatch[1], 10);
          const month = parseInt(dateOnlyMatch[2], 10) - 1;
          const year = parseInt(dateOnlyMatch[3], 10);

          if (day >= 1 && day <= 31 && month >= 0 && month <= 11 &&
              year >= 2020 && year <= 2030) {
            const now = new Date();
            parsedDate = new Date(year, month, day, now.getHours(), now.getMinutes(), 0, 0);
          }
        }

        if (!parsedDate || isNaN(parsedDate.getTime())) {
          await ctx.reply(
            '❌ Неверный формат\n\n' +
            'Введите в формате:\n' +
            '• <b>ЧЧ:ММ</b> (время сегодня)\n' +
            '• <b>ДД.ММ.ГГГГ</b> (дата)\n' +
            '• <b>ДД.ММ.ГГГГ ЧЧ:ММ</b> (дата и время)',
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text('◀️ Отмена', 'main_menu'),
            },
          );
          return;
        }

        // Check if date is not in the future
        if (parsedDate > new Date()) {
          await ctx.reply(
            '❌ Нельзя указать дату в будущем',
            {
              reply_markup: new InlineKeyboard().text('◀️ Отмена', 'main_menu'),
            },
          );
          return;
        }

        const machine = await this.machinesService.findById(ctx.session.selectedMachineId);
        if (!machine) {
          await ctx.reply('❌ Автомат не найден');
          ctx.session.step = 'idle';
          return;
        }

        ctx.session.collectionTime = parsedDate;
        ctx.session.step = 'confirming';

        const timeStr = this.formatDateTime(parsedDate);
        const isHistorical = parsedDate.toDateString() !== new Date().toDateString();
        const safeMachineName = this.escapeHtml(machine.name);

        await ctx.reply(
          `🏧 <b>${safeMachineName}</b>\n📟 ${machine.code}\n📍 ${machine.location || '—'}\n\n` +
          `⏰ Время: <b>${timeStr}</b>\n` +
          `${isHistorical ? '📆 <i>(исторические данные)</i>\n' : ''}\n` +
          `Подтвердить сбор?`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('✅ Подтвердить', 'confirm_collection')
              .text('❌ Отмена', 'main_menu'),
          },
        );
        return;
      }

      // Admin: Editing text
      if (ctx.session.step === 'editing_text' && ctx.session.editingTextKey && ctx.user?.role === UserRole.ADMIN) {
        const newText = ctx.message.text.trim();

        if (newText.length > 500) {
          await ctx.reply(
            '❌ Текст слишком длинный\n\n' +
            'Максимум 500 символов',
            {
              reply_markup: new InlineKeyboard().text('✖️ Отмена', 'settings_texts'),
            },
          );
          return;
        }

        try {
          await this.settingsService.set(ctx.session.editingTextKey, newText);

          const textKey = ctx.session.editingTextKey;
          ctx.session.step = 'idle';
          ctx.session.editingTextKey = undefined;

          const textNames: Record<string, string> = {
            welcome_title: 'Заголовок',
            welcome_text: 'Описание',
          };

          const safeNewText = this.escapeHtml(newText.length > 100 ? newText.slice(0, 100) + '...' : newText);
          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ✅  <b>СОХРАНЕНО</b>\n` +
            `╰─────────────────────╯\n\n` +
            `📝  ${textNames[textKey] || textKey}\n\n` +
            `Новое значение:\n` +
            `<i>${safeNewText}</i>`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('👁 Превью', 'preview_welcome')
                .text('📝 К текстам', 'settings_texts'),
            },
          );
        } catch (error: any) {
          const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
          await ctx.reply(`❌ Ошибка: ${safeError}`);
          ctx.session.step = 'idle';
          ctx.session.editingTextKey = undefined;
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
            `✅ <b>Изображение обновлено!</b>`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('👁 Предпросмотр', 'preview_welcome')
                .row()
                .text('◀️ В настройки', 'bot_settings'),
            },
          );
        } catch (error: any) {
          const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
          await ctx.reply(`❌ Ошибка: ${safeError}`);
          ctx.session.step = 'idle';
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
            `✅ <b>Картинка установлена!</b>\n\n` +
            `Изображение сохранено из Telegram.`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('👁 Предпросмотр', 'preview_welcome')
                .row()
                .text('◀️ В настройки', 'bot_settings'),
            },
          );
        } catch (error: any) {
          const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
          await ctx.reply(`❌ Ошибка: ${safeError}`);
          ctx.session.step = 'idle';
        }
        return;
      }
    });

    // Callback query handlers
    this.bot.callbackQuery('main_menu', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();
      ctx.session.step = 'idle';
      const roleBadge = this.getRoleBadge(ctx.user.role);
      const safeName = this.escapeHtml(ctx.user.name);
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🏧  <b>VendCash</b>\n` +
        `╰─────────────────────╯\n\n` +
        `👤  <b>${safeName}</b>\n` +
        `${roleBadge}\n\n` +
        `Выберите действие:`,
        {
          parse_mode: 'HTML',
          reply_markup: this.getMainMenu(ctx.user),
        },
      );
    });

    // Search machine
    this.bot.callbackQuery('search_machine', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      ctx.session.step = 'searching_machine';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🔍  <b>ПОИСК</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Введите код или название\n` +
        `автомата <i>(мин. 2 символа)</i>`,
        {
          parse_mode: 'HTML',
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
        `╭─────────────────────╮\n` +
        `│  ➕  <b>НОВЫЙ АВТОМАТ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📍 Шаг <b>1</b> из 2\n\n` +
        `Введите код <i>(серийный номер)</i>\n` +
        `автомата:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('✖️ Отмена', 'main_menu'),
        },
      );
    });

    // Select found machine (from search results) - show date options
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
        const safeName = this.escapeHtml(machine.name);
        await ctx.editMessageText(
          `⚠️ Автомат "${safeName}" ещё не подтверждён администратором.\n\n` +
            'Дождитесь подтверждения или выберите другой автомат.',
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('🔍 Новый поиск', 'search_machine')
              .row()
              .text('◀️ В меню', 'main_menu'),
          },
        );
        return;
      }

      ctx.session.selectedMachineId = machine.id;
      ctx.session.step = 'selecting_date';
      const safeMachineName = this.escapeHtml(machine.name);

      // Show date selection options
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>НОВЫЙ СБОР</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `📟  <code>${machine.code}</code>\n\n` +
        `Выберите время:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🕐 Сейчас', `date_now_${machineId}`)
            .text('📅 Сегодня', `date_today_${machineId}`)
            .row()
            .text('📆 Вчера', `date_yesterday_${machineId}`)
            .text('✏️ Другая', `date_custom_${machineId}`)
            .row()
            .text('◀️ Назад', 'search_machine'),
        },
      );
    });

    // Noop handler (for "... more items" button)
    this.bot.callbackQuery('noop', async (ctx) => {
      if (!ctx.user) return;
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

        await ctx.answerCallbackQuery('Подтверждено ✓');
        const safeMachineName = this.escapeHtml(machine.name);
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  <b>ПОДТВЕРЖДЕНО</b>\n` +
          `╰─────────────────────╯\n\n` +
          `📟  <code>${machine.code}</code>\n` +
          `📝  ${safeMachineName}`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('🔍 Модерация', 'pending_machines'),
          },
        );

        // Notify creator
        await this.notifyCreatorMachineApproved(machine);
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.answerCallbackQuery(`Ошибка: ${safeError}`);
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

        await ctx.answerCallbackQuery('Отклонено ✗');
        const safeMachineName = this.escapeHtml(machine.name);
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ❌  <b>ОТКЛОНЕНО</b>\n` +
          `╰─────────────────────╯\n\n` +
          `📟  <code>${machine.code}</code>\n` +
          `📝  ${safeMachineName}`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('🔍 Модерация', 'pending_machines'),
          },
        );

        // Notify creator
        await this.notifyCreatorMachineRejected(machine);
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.answerCallbackQuery(`Ошибка: ${safeError}`);
      }
    });

    // Operator: Start collection
    this.bot.callbackQuery('collect', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machines = await this.machinesService.findAllActive();

      if (machines.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  📦  <b>НОВЫЙ СБОР</b>\n` +
          `╰─────────────────────╯\n\n` +
          `Нет доступных автоматов\n\n` +
          `Создайте через поиск`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('🔍 Поиск', 'search_machine')
              .text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const keyboard = new InlineKeyboard();

      // Add search button at top
      keyboard.text('🔍 Поиск', 'search_machine').row();

      machines.slice(0, 8).forEach((m) => {
        keyboard.text(`${m.code}  ${m.name}`, `machine_${m.id}`).row();
      });

      if (machines.length > 8) {
        keyboard.text(`⋯ ещё ${machines.length - 8}`, 'search_machine').row();
      }

      keyboard.text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>НОВЫЙ СБОР</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Выберите автомат:`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
      ctx.session.step = 'selecting_machine';
    });

    // Machine selection - show date options
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

      ctx.session.selectedMachineId = machine.id;
      ctx.session.step = 'selecting_date';
      const safeMachineName = this.escapeHtml(machine.name);

      // Show date selection options
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>НОВЫЙ СБОР</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `📟  <code>${machine.code}</code>\n\n` +
        `Выберите время:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🕐 Сейчас', `date_now_${machineId}`)
            .text('📅 Сегодня', `date_today_${machineId}`)
            .row()
            .text('📆 Вчера', `date_yesterday_${machineId}`)
            .text('✏️ Другая', `date_custom_${machineId}`)
            .row()
            .text('◀️ Назад', 'collect'),
        },
      );
    });

    // Date selection: Now
    this.bot.callbackQuery(/^date_now_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      const machine = await this.machinesService.findById(machineId);
      if (!machine) return;

      // Check for duplicates
      const duplicate = await this.collectionsService.checkDuplicate(machineId, new Date());
      if (duplicate) {
        const time = this.formatTime(duplicate.collectedAt);
        await ctx.editMessageText(
          `⚠️ Внимание!\n\nДля этого автомата уже есть сбор в ${time}.\nВы уверены, что хотите создать ещё один?`,
          {
            reply_markup: new InlineKeyboard()
              .text('✅ Да, создать', `confirm_dup_now_${machineId}`)
              .text('❌ Отмена', 'main_menu'),
          },
        );
        return;
      }

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);
      const safeMachineName = this.escapeHtml(machine.name);

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>ПОДТВЕРЖДЕНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `📟  <code>${machine.code}</code>\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ Да', 'confirm_collection')
            .text('✖️ Отмена', 'main_menu'),
        },
      );
    });

    // Date selection: Today (with time input)
    this.bot.callbackQuery(/^date_today_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      ctx.session.selectedMachineId = machineId;
      ctx.session.step = 'entering_custom_date';

      // Store that we're entering time for today
      const today = new Date();
      const dateStr = today.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' });

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ⏰  <b>ВРЕМЯ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📅  ${dateStr}\n\n` +
        `Введите время:\n` +
        `<i>Например: 14:30</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('✖️ Отмена', `machine_${machineId}`),
        },
      );
    });

    // Date selection: Yesterday
    this.bot.callbackQuery(/^date_yesterday_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      const machine = await this.machinesService.findById(machineId);
      if (!machine) return;

      // Set yesterday's date with current time
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = yesterday;
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);
      const safeMachineName = this.escapeHtml(machine.name);

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>ПОДТВЕРЖДЕНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `📟  <code>${machine.code}</code>\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n` +
        `📆  <i>вчера</i>\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ Да', 'confirm_collection')
            .text('✖️ Отмена', 'main_menu'),
        },
      );
    });

    // Date selection: Custom date
    this.bot.callbackQuery(/^date_custom_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      ctx.session.selectedMachineId = machineId;
      ctx.session.step = 'entering_custom_date';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📆  <b>ДАТА</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Введите дату и время:\n\n` +
        `<i>Примеры:</i>\n` +
        `• 15.01.2026 14:30\n` +
        `• 20.01.2026`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('✖️ Отмена', `machine_${machineId}`),
        },
      );
    });

    // Confirm duplicate with "now" time
    this.bot.callbackQuery(/^confirm_dup_now_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      const machine = await this.machinesService.findById(machineId);
      if (!machine) return;

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);
      const safeMachineName = this.escapeHtml(machine.name);

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>ПОДТВЕРЖДЕНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `📟  <code>${machine.code}</code>\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ Да', 'confirm_collection')
            .text('✖️ Отмена', 'main_menu'),
        },
      );
    });

    // Confirm duplicate (legacy handler for other flows)
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
      const safeMachineName = this.escapeHtml(machine.name);

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  <b>ПОДТВЕРЖДЕНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `📟  <code>${machine.code}</code>\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ Да', 'confirm_collection')
            .text('✖️ Отмена', 'main_menu'),
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

        const safeMachineName = machine ? this.escapeHtml(machine.name) : '';
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  <b>ГОТОВО</b>\n` +
          `╰─────────────────────╯\n\n` +
          `🏧  ${safeMachineName}\n` +
          `🔢  <code>#${collection.id.slice(0, 8)}</code>\n\n` +
          `Сбор успешно зарегистрирован!`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('📦 Ещё сбор', 'collect')
              .text('🏠 Меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.editMessageText(`❌ Ошибка: ${safeError}`);
      }
    });

    // My collections today with pagination
    this.bot.callbackQuery(/^my_collections(?:_(\d+))?$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const page = ctx.match[1] ? parseInt(ctx.match[1], 10) : 0;
      const pageSize = 10;

      const collections = await this.collectionsService.findByOperator(ctx.user.id, new Date());

      if (collections.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  📋  <b>МОИ СБОРЫ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `За сегодня нет сборов`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('📦 Новый сбор', 'collect')
              .text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const totalPages = Math.ceil(collections.length / pageSize);
      const pageItems = collections.slice(page * pageSize, (page + 1) * pageSize);

      const lines = pageItems.map((c) => {
        const time = this.formatTime(c.collectedAt);
        const status = c.status === 'collected' ? '⏳' : c.status === 'received' ? '✅' : '❌';
        const safeMachineName = this.escapeHtml(c.machine.name);
        return `${status}  ${time}  ${safeMachineName}`;
      });

      const keyboard = new InlineKeyboard();

      // Pagination buttons
      if (totalPages > 1) {
        if (page > 0) {
          keyboard.text('◀️', `my_collections_${page - 1}`);
        }
        keyboard.text(`${page + 1}/${totalPages}`, 'noop');
        if (page < totalPages - 1) {
          keyboard.text('▶️', `my_collections_${page + 1}`);
        }
        keyboard.row();
      }

      keyboard.text('📦 Ещё сбор', 'collect').text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📋  <b>МОИ СБОРЫ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📅 Сегодня: <b>${collections.length}</b>\n\n` +
        `${lines.join('\n')}\n\n` +
        `────────────────────\n` +
        `✅ принят  ⏳ ожидает`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
    });

    // Manager: Pending collections with pagination
    this.bot.callbackQuery(/^pending_collections(?:_(\d+))?$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const page = ctx.match[1] ? parseInt(ctx.match[1], 10) : 0;
      const pageSize = 8;

      const pending = await this.collectionsService.findPending();

      if (pending.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  📥  <b>ПРИЁМ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `✅ Нет ожидающих инкассаций`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const totalPages = Math.ceil(pending.length / pageSize);
      const pageItems = pending.slice(page * pageSize, (page + 1) * pageSize);

      const keyboard = new InlineKeyboard();
      pageItems.forEach((c) => {
        const time = this.formatTime(c.collectedAt);
        // Truncate long names for button text (no HTML escaping needed for buttons)
        const displayName = c.machine.name.length > 18 ? c.machine.name.slice(0, 16) + '..' : c.machine.name;
        keyboard.text(`⏳ ${time}  ${displayName}`, `receive_${c.id}_${page}`).row();
      });

      // Pagination buttons
      if (totalPages > 1) {
        if (page > 0) {
          keyboard.text('◀️', `pending_collections_${page - 1}`);
        }
        keyboard.text(`${page + 1}/${totalPages}`, 'noop');
        if (page < totalPages - 1) {
          keyboard.text('▶️', `pending_collections_${page + 1}`);
        }
        keyboard.row();
      }

      keyboard.text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📥  <b>ПРИЁМ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Ожидают: <b>${pending.length}</b>\n\n` +
        `Нажмите для приёма:`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
    });

    // Receive collection
    this.bot.callbackQuery(/^receive_([a-f0-9-]+)(?:_(\d+))?$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const collectionId = ctx.match[1];
      const returnPage = ctx.match[2] || '0';

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
      const safeMachineName = this.escapeHtml(collection.machine.name);
      const safeOperatorName = this.escapeHtml(collection.operator.name);

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  💰  <b>ПРИЁМ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  <b>${safeMachineName}</b>\n` +
        `⏰  ${time}\n` +
        `👤  ${safeOperatorName}\n\n` +
        `────────────────────\n` +
        `✏️ Введите сумму <i>(сум)</i>:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('✖️ Отмена', `pending_collections_${returnPage}`),
        },
      );
    });

    // Admin: Invite user
    this.bot.callbackQuery('invite_user', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  👥  <b>ПРИГЛАШЕНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Выберите роль нового\n` +
        `сотрудника:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🟢 Оператор', 'create_invite_operator')
            .text('🔵 Менеджер', 'create_invite_manager')
            .row()
            .text('◀️ Назад', 'main_menu'),
        },
      );
    });

    // Create invite
    this.bot.callbackQuery(/^create_invite_(operator|manager)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const role = ctx.match[1] === 'operator' ? UserRole.OPERATOR : UserRole.MANAGER;
      const roleBadge = role === UserRole.OPERATOR ? '🟢 Оператор' : '🔵 Менеджер';

      try {
        const invite = await this.invitesService.create(ctx.user.id, role);
        const botInfo = await this.bot.api.getMe();
        const link = `https://t.me/${botInfo.username}?start=invite_${invite.code}`;

        // Create share URL for easy forwarding
        const shareText = `Приглашение в VendCash (${roleBadge})`;
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  <b>ПРИГЛАШЕНИЕ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `${roleBadge}\n` +
          `⏰  Действует 24 часа\n\n` +
          `────────────────────\n` +
          `📋  <b>Ссылка:</b>\n` +
          `<code>${link}</code>`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .url('📤 Переслать', shareUrl)
              .row()
              .text('🔄 Ещё', `create_invite_${ctx.match[1]}`)
              .text('🏠 Меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.reply(`❌ Ошибка: ${safeError}`);
      }
    });

    // Admin: List invites
    this.bot.callbackQuery(/^list_invites(?:_(\d+))?$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const page = ctx.match[1] ? parseInt(ctx.match[1], 10) : 0;
      const pageSize = 8;

      const pending = await this.invitesService.findPending();
      const totalPages = Math.ceil(pending.length / pageSize);
      const pageItems = pending.slice(page * pageSize, (page + 1) * pageSize);

      if (pending.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  📋  <b>ПРИГЛАШЕНИЯ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `Нет активных приглашений.\n\n` +
          `<i>Создайте новое через\nкнопку "👥 Пригласить"</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('👥 Создать', 'invite_user')
              .text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const inv of pageItems) {
        const roleBadge = inv.role === UserRole.OPERATOR ? '🟢' : '🔵';
        const expiresIn = Math.max(0, Math.ceil((inv.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)));
        keyboard.text(`${roleBadge} ${inv.code} (${expiresIn}ч)`, `view_invite_${inv.id}`).row();
      }

      // Pagination buttons
      if (totalPages > 1) {
        if (page > 0) {
          keyboard.text('◀️', `list_invites_${page - 1}`);
        }
        keyboard.text(`${page + 1}/${totalPages}`, 'noop');
        if (page < totalPages - 1) {
          keyboard.text('▶️', `list_invites_${page + 1}`);
        }
        keyboard.row();
      }

      keyboard.text('👥 Создать', 'invite_user').text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📋  <b>ПРИГЛАШЕНИЯ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Активных: <b>${pending.length}</b>\n\n` +
        `🟢 Оператор  🔵 Менеджер\n` +
        `<i>(часов до истечения)</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
    });

    // Admin: View single invite
    this.bot.callbackQuery(/^view_invite_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const inviteId = ctx.match[1];
      if (!isValidUUID(inviteId)) {
        await ctx.editMessageText('❌ Неверный ID приглашения');
        return;
      }

      const invites = await this.invitesService.findAll();
      const invite = invites.find(i => i.id === inviteId);

      if (!invite) {
        await ctx.editMessageText('❌ Приглашение не найдено');
        return;
      }

      const roleBadge = this.getRoleBadge(invite.role);
      const status = invite.isUsed
        ? '✅ Использовано'
        : invite.isExpired
        ? '⏰ Истекло'
        : '🟡 Активно';

      const expiresIn = Math.max(0, Math.ceil((invite.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)));
      const creatorName = invite.createdBy ? this.escapeHtml(invite.createdBy.name) : 'Неизвестно';

      let message =
        `╭─────────────────────╮\n` +
        `│  📨  <b>ПРИГЛАШЕНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📋 Код: <code>${invite.code}</code>\n` +
        `${roleBadge}\n` +
        `${status}\n\n` +
        `────────────────────\n` +
        `👤 Создал: ${creatorName}\n` +
        `📅 ${this.formatDateTime(invite.createdAt)}\n`;

      if (!invite.isUsed && !invite.isExpired) {
        message += `⏰ Истекает через: <b>${expiresIn}ч</b>\n`;
      }

      if (invite.isUsed && invite.usedBy) {
        const usedByName = this.escapeHtml(invite.usedBy.name);
        message += `\n✅ Использовал: ${usedByName}\n`;
        message += `📅 ${this.formatDateTime(invite.usedAt!)}`;
      }

      const keyboard = new InlineKeyboard();
      if (!invite.isUsed) {
        keyboard.text('🗑️ Удалить', `delete_invite_${invite.id}`).row();
      }
      keyboard.text('◀️ Назад', 'list_invites').text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    });

    // Admin: Delete invite
    this.bot.callbackQuery(/^delete_invite_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const inviteId = ctx.match[1];
      if (!isValidUUID(inviteId)) {
        await ctx.editMessageText('❌ Неверный ID приглашения');
        return;
      }

      try {
        await this.invitesService.delete(inviteId);
        await ctx.editMessageText(
          `✅ Приглашение удалено`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('📋 К списку', 'list_invites')
              .text('🏠 Меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.editMessageText(`❌ Ошибка: ${safeError}`, {
          reply_markup: new InlineKeyboard()
            .text('◀️ Назад', 'list_invites'),
        });
      }
    });

    // Noop callback for pagination indicator
    this.bot.callbackQuery('noop', async (ctx) => {
      await ctx.answerCallbackQuery();
    });

    // Admin: Pending machines with pagination
    this.bot.callbackQuery(/^pending_machines(?:_(\d+))?$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const page = ctx.match[1] ? parseInt(ctx.match[1], 10) : 0;
      const pageSize = 8;

      const pending = await this.machinesService.findPending();

      if (pending.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  🔍  <b>МОДЕРАЦИЯ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `✅ Нет автоматов на проверке`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const totalPages = Math.ceil(pending.length / pageSize);
      const pageItems = pending.slice(page * pageSize, (page + 1) * pageSize);

      const keyboard = new InlineKeyboard();
      pageItems.forEach((m) => {
        // Truncate long names to prevent button overflow
        const displayName = m.name.length > 20 ? m.name.slice(0, 18) + '..' : m.name;
        keyboard.text(`⏳ ${m.code}  ${displayName}`, `review_machine_${m.id}_${page}`).row();
      });

      // Pagination buttons
      if (totalPages > 1) {
        if (page > 0) {
          keyboard.text('◀️', `pending_machines_${page - 1}`);
        }
        keyboard.text(`${page + 1}/${totalPages}`, 'noop');
        if (page < totalPages - 1) {
          keyboard.text('▶️', `pending_machines_${page + 1}`);
        }
        keyboard.row();
      }

      keyboard.text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🔍  <b>МОДЕРАЦИЯ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `На проверке: <b>${pending.length}</b>\n\n` +
        `Нажмите для просмотра:`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
    });

    // Admin: Review single machine
    this.bot.callbackQuery(/^review_machine_([a-f0-9-]+)(?:_(\d+))?$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
      const returnPage = ctx.match[2] || '0';

      if (!isValidUUID(machineId)) {
        await ctx.editMessageText('❌ Неверный ID автомата');
        return;
      }
      const machine = await this.machinesService.findByIdWithCreator(machineId);

      if (!machine) {
        await ctx.editMessageText('❌ Автомат не найден');
        return;
      }

      const safeCreatorName = machine.createdBy ? this.escapeHtml(machine.createdBy.name) : 'Неизвестно';
      const safeMachineName = this.escapeHtml(machine.name);
      const safeLocation = machine.location ? this.escapeHtml(machine.location) : '—';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🔍  <b>ПРОВЕРКА</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📟  Код: <code>${machine.code}</code>\n` +
        `📝  ${safeMachineName}\n` +
        `📍  ${safeLocation}\n\n` +
        `────────────────────\n` +
        `👤  ${safeCreatorName}\n` +
        `📅  ${this.formatDateTime(machine.createdAt)}`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', `admin_approve_${machine.id}`)
            .text('❌ Отклонить', `admin_reject_${machine.id}`)
            .row()
            .text('◀️ Назад', `pending_machines_${returnPage}`),
        },
      );
    });

    // Web panel link
    this.bot.callbackQuery('web_panel', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const webUrl = this.configService.get('frontendUrl');
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🌐  <b>ВЕБ-ПАНЕЛЬ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Откройте для просмотра\n` +
        `отчётов и аналитики:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .url('🚀 Открыть', webUrl)
            .row()
            .text('🏠 Меню', 'main_menu'),
        },
      );
    });

    // Help
    this.bot.callbackQuery('help', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      let helpContent = '';

      if (ctx.user.role === UserRole.OPERATOR) {
        helpContent =
          `🟢 <b>Оператор</b>\n\n` +
          `📦  <b>Новый сбор</b>\n` +
          `Регистрация инкассации\n\n` +
          `🔍  <b>Поиск</b>\n` +
          `Найти автомат по коду\n` +
          `или названию\n\n` +
          `📋  <b>Мои сборы</b>\n` +
          `История за сегодня\n\n` +
          `────────────────────\n` +
          `💡 Не нашли автомат?\n` +
          `Создайте новый через поиск`;
      } else if (ctx.user.role === UserRole.MANAGER) {
        helpContent =
          `🔵 <b>Менеджер</b>\n\n` +
          `📥  <b>Принять</b>\n` +
          `Приём инкассаций\n\n` +
          `🔍  <b>Поиск</b>\n` +
          `Найти автомат\n\n` +
          `🌐  <b>Веб-панель</b>\n` +
          `Отчёты и аналитика`;
      } else {
        helpContent =
          `🟣 <b>Администратор</b>\n\n` +
          `📥  <b>Принять</b>\n` +
          `Приём инкассаций\n\n` +
          `🔍  <b>Модерация</b>\n` +
          `Проверка новых автоматов\n\n` +
          `👥  <b>Пригласить</b>\n` +
          `Добавить сотрудника\n\n` +
          `⚙️  <b>Настройки</b>\n` +
          `Настройки бота`;
      }

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ❔  <b>ПОМОЩЬ</b>\n` +
        `╰─────────────────────╯\n\n` +
        helpContent,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('⚙️ Аккаунт', 'settings')
            .text('🏠 Меню', 'main_menu'),
        },
      );
    });

    // Settings
    this.bot.callbackQuery('settings', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const roleBadge = this.getRoleBadge(ctx.user.role);
      const safeName = this.escapeHtml(ctx.user.name);

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  👤  <b>АККАУНТ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📛  <b>${safeName}</b>\n` +
        `${roleBadge}\n\n` +
        `────────────────────\n` +
        `⚠️ Деактивация необратима`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🚫 Деактивировать', 'confirm_deactivate')
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
        `╭─────────────────────╮\n` +
        `│  ⚠️  <b>ВНИМАНИЕ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `После деактивации:\n\n` +
        `• Потеряете доступ\n` +
        `• Нужно новое приглашение\n` +
        `• Данные сохранятся`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🚫 Да, выйти', 'do_deactivate')
            .text('◀️ Отмена', 'settings'),
        },
      );
    });

    // Do deactivation
    this.bot.callbackQuery('do_deactivate', async (ctx) => {
      if (!ctx.user) return;

      try {
        await this.usersService.deactivate(ctx.user.id);
        await ctx.answerCallbackQuery('Деактивировано');

        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  👋  <b>ДО СВИДАНИЯ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `Аккаунт деактивирован\n\n` +
          `Для восстановления\n` +
          `обратитесь к админу`,
          { parse_mode: 'HTML' },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.answerCallbackQuery(`Ошибка: ${safeError}`);
      }
    });

    // Admin: Bot settings
    this.bot.callbackQuery('bot_settings', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery();

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ⚙️  <b>НАСТРОЙКИ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Управление ботом:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🖼 Картинка', 'settings_image')
            .text('📝 Тексты', 'settings_texts')
            .row()
            .text('👁 Превью', 'preview_welcome')
            .text('🏠 Меню', 'main_menu'),
        },
      );
    });

    // Admin: Image settings
    this.bot.callbackQuery('settings_image', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery();

      const currentImage = await this.settingsService.getWelcomeImage();
      const imageStatus = currentImage
        ? currentImage.startsWith('tg:')
          ? '✅ Загружено'
          : '✅ URL'
        : '⚪️ По умолчанию';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🖼  <b>КАРТИНКА</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Статус: ${imageStatus}\n\n` +
        `Показывается при входе\n` +
        `без приглашения`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('📷 Изменить', 'change_welcome_image')
            .text('🗑 Сброс', 'reset_welcome_image')
            .row()
            .text('◀️ Назад', 'bot_settings'),
        },
      );
    });

    // Admin: Texts settings menu
    this.bot.callbackQuery('settings_texts', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery();

      const welcomeTitle = await this.settingsService.getWelcomeTitle();
      const welcomeText = await this.settingsService.getWelcomeText();

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📝  <b>ТЕКСТЫ</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Редактирование текстов бота:\n\n` +
        `🏷  Заголовок: ${welcomeTitle ? '✅' : '⚪️'}\n` +
        `📄  Описание: ${welcomeText ? '✅' : '⚪️'}`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🏷 Заголовок', 'edit_text_welcome_title')
            .text('📄 Описание', 'edit_text_welcome_text')
            .row()
            .text('🔄 Сбросить всё', 'reset_all_texts')
            .row()
            .text('◀️ Назад', 'bot_settings'),
        },
      );
    });

    // Admin: Edit text handler
    this.bot.callbackQuery(/^edit_text_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }
      await ctx.answerCallbackQuery();

      const textKey = ctx.match[1];
      ctx.session.step = 'editing_text';
      ctx.session.editingTextKey = textKey;

      const textNames: Record<string, string> = {
        welcome_title: 'Заголовок приветствия',
        welcome_text: 'Текст приветствия',
      };

      const currentValue = await this.settingsService.get(textKey);
      const safePreview = currentValue
        ? this.escapeHtml(currentValue.length > 100 ? currentValue.slice(0, 100) + '...' : currentValue)
        : '<i>не задан</i>';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ✏️  <b>РЕДАКТОР</b>\n` +
        `╰─────────────────────╯\n\n` +
        `📝  <b>${textNames[textKey] || textKey}</b>\n\n` +
        `Текущее значение:\n${safePreview}\n\n` +
        `────────────────────\n` +
        `Введите новый текст:`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🗑 Очистить', `clear_text_${textKey}`)
            .row()
            .text('✖️ Отмена', 'settings_texts'),
        },
      );
    });

    // Admin: Clear text
    this.bot.callbackQuery(/^clear_text_(.+)$/, async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }

      const textKey = ctx.match[1];

      try {
        await this.settingsService.delete(textKey);
        await ctx.answerCallbackQuery('Очищено');

        ctx.session.step = 'idle';
        ctx.session.editingTextKey = undefined;

        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  <b>ОЧИЩЕНО</b>\n` +
          `╰─────────────────────╯\n\n` +
          `Текст сброшен на значение\n` +
          `по умолчанию`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('◀️ К текстам', 'settings_texts'),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.answerCallbackQuery(`Ошибка: ${safeError}`);
      }
    });

    // Admin: Reset all texts
    this.bot.callbackQuery('reset_all_texts', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) {
        await ctx.answerCallbackQuery('Недостаточно прав');
        return;
      }

      try {
        await this.settingsService.delete(SETTING_KEYS.WELCOME_TITLE);
        await this.settingsService.delete(SETTING_KEYS.WELCOME_TEXT);
        await ctx.answerCallbackQuery('Все тексты сброшены');

        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  <b>СБРОШЕНО</b>\n` +
          `╰─────────────────────╯\n\n` +
          `Все тексты сброшены\n` +
          `на значения по умолчанию`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('◀️ К текстам', 'settings_texts'),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.answerCallbackQuery(`Ошибка: ${safeError}`);
      }
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
        `╭─────────────────────╮\n` +
        `│  🖼  <b>КАРТИНКА</b>\n` +
        `╰─────────────────────╯\n\n` +
        `Выберите способ:\n\n` +
        `📷  Отправьте фото\n` +
        `🔗  Или ссылку (https://...)`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('✖️ Отмена', 'bot_settings'),
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
          `✅ <b>Картинка сброшена</b>\n\n` +
          `Теперь используется картинка по умолчанию.`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('👁 Предпросмотр', 'preview_welcome')
              .row()
              .text('◀️ В настройки', 'bot_settings'),
          },
        );
      } catch (error: any) {
        const safeError = this.escapeHtml(error.message || 'Неизвестная ошибка');
        await ctx.answerCallbackQuery(`Ошибка: ${safeError}`);
      }
    });
  }

  private getMainMenu(user: User): InlineKeyboard {
    const kb = new InlineKeyboard();

    if (user.role === UserRole.OPERATOR) {
      // Operator - clean 2-column layout
      kb.text('📦 Новый сбор', 'collect')
        .text('🔍 Поиск', 'search_machine').row();
      kb.text('📋 Мои сборы', 'my_collections')
        .text('❔ Помощь', 'help').row();
    } else if (user.role === UserRole.MANAGER) {
      // Manager - 2-column layout
      kb.text('📥 Принять', 'pending_collections')
        .text('🔍 Поиск', 'search_machine').row();
      kb.text('🌐 Веб-панель', 'web_panel')
        .text('❔ Помощь', 'help').row();
    } else {
      // Admin - comprehensive 2-column layout
      kb.text('📥 Принять', 'pending_collections')
        .text('🔍 Модерация', 'pending_machines').row();
      kb.text('👥 Пригласить', 'invite_user')
        .text('📋 Приглашения', 'list_invites').row();
      kb.text('⚙️ Настройки', 'bot_settings')
        .text('🌐 Веб-панель', 'web_panel').row();
      kb.text('❔ Помощь', 'help').row();
    }

    return kb;
  }

  private async notifyAdminNewMachine(machine: Machine, creator: User): Promise<void> {
    const adminTelegramId = this.configService.get<number>('admin.telegramId');

    if (!adminTelegramId || adminTelegramId === 0) {
      this.logger.warn('Admin Telegram ID not configured, skipping notification');
      return;
    }

    const safeMachineName = this.escapeHtml(machine.name);
    const safeCreatorName = this.escapeHtml(creator.name);
    const safeUsername = creator.telegramUsername ? this.escapeHtml(creator.telegramUsername) : 'нет';

    const message =
      `🆕 <b>Новый автомат ожидает подтверждения</b>\n\n` +
      `📟 Код: <code>${machine.code}</code>\n` +
      `📝 Название: ${safeMachineName}\n` +
      `👤 Создал: ${safeCreatorName} (@${safeUsername})\n` +
      `📅 Дата: ${this.formatDateTime(machine.createdAt)}`;

    const keyboard = new InlineKeyboard()
      .text('✅ Подтвердить', `admin_approve_${machine.id}`)
      .text('❌ Отклонить', `admin_reject_${machine.id}`);

    try {
      await this.bot.api.sendMessage(adminTelegramId, message, {
        parse_mode: 'HTML',
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

      const safeMachineName = this.escapeHtml(machine.name);
      await this.bot.api.sendMessage(
        creator.telegramId,
        `✅ Ваш автомат подтверждён!\n\n` +
          `📟 Код: <code>${machine.code}</code>\n` +
          `📝 Название: ${safeMachineName}\n\n` +
          `Теперь вы можете использовать его для инкассаций.`,
        { parse_mode: 'HTML' },
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

      const safeMachineName = this.escapeHtml(machine.name);
      const safeReason = machine.rejectionReason
        ? this.escapeHtml(machine.rejectionReason)
        : 'не указана';
      await this.bot.api.sendMessage(
        creator.telegramId,
        `❌ Ваш автомат отклонён\n\n` +
          `📟 Код: <code>${machine.code}</code>\n` +
          `📝 Название: ${safeMachineName}\n\n` +
          `Причина: ${safeReason}`,
        { parse_mode: 'HTML' },
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

  private getRoleBadge(role: UserRole): string {
    switch (role) {
      case UserRole.OPERATOR:
        return '🟢 Оператор';
      case UserRole.MANAGER:
        return '🔵 Менеджер';
      case UserRole.ADMIN:
        return '🟣 Администратор';
      default:
        return '⚪️ Пользователь';
    }
  }

  private escapeHtml(text: string): string {
    // Escape special HTML characters
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async showWelcomeScreen(ctx: MyContext): Promise<void> {
    // Welcome image from DB settings, fallback to env, then default
    const welcomeImage =
      (await this.settingsService.getWelcomeImage()) ||
      this.configService.get<string>('telegram.welcomeImage') ||
      'https://i.imgur.com/JQvVqXh.png';

    // Dynamic texts from DB settings (escaped for HTML)
    const welcomeTitle = this.escapeHtml(
      (await this.settingsService.getWelcomeTitle()) || 'VendCash'
    );
    const welcomeText = this.escapeHtml(
      (await this.settingsService.getWelcomeText()) ||
      'Система учёта инкассации\nвендинговых автоматов'
    );

    const caption =
      `╭─────────────────────╮\n` +
      `│  🏧  <b>${welcomeTitle}</b>\n` +
      `╰─────────────────────╯\n\n` +
      `${welcomeText}\n\n` +
      `────────────────────\n\n` +
      `🔐 Для доступа необходимо\n` +
      `получить приглашение`;

    try {
      // Check if it's a Telegram file_id (prefixed with 'tg:')
      const imageSource = welcomeImage.startsWith('tg:')
        ? welcomeImage.slice(3) // Remove 'tg:' prefix
        : welcomeImage;

      await ctx.replyWithPhoto(imageSource, {
        caption,
        parse_mode: 'HTML',
      });
    } catch (error) {
      // Fallback to text if image fails
      await ctx.reply(caption, { parse_mode: 'HTML' });
    }
  }
}
