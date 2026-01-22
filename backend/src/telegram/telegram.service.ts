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
    | 'selecting_date'
    | 'entering_custom_date'
    | 'confirming'
    | 'entering_amount'
    | 'searching_machine'
    | 'creating_machine_code'
    | 'creating_machine_name'
    | 'setting_welcome_image'
    | 'editing_text';
  inviteCode?: string;
  selectedMachineId?: string;
  collectionTime?: Date;
  pendingCollectionId?: string;
  searchQuery?: string;
  newMachineCode?: string;
  editingTextKey?: string;
}

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
          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ⛔️  *ДОСТУП ЗАКРЫТ*\n` +
            `╰─────────────────────╯\n\n` +
            `Ваш аккаунт деактивирован.\n` +
            `Обратитесь к администратору.`,
            { parse_mode: 'Markdown' },
          );
          return;
        }
        const roleBadge = this.getRoleBadge(ctx.user.role);

        await ctx.reply(
          `╭─────────────────────╮\n` +
          `│  🏧  *VendCash*\n` +
          `╰─────────────────────╯\n\n` +
          `👤  *${ctx.user.name}*\n` +
          `${roleBadge}\n\n` +
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

      const roleBadge = validation.role === UserRole.OPERATOR ? '🟢 Оператор' : '🔵 Менеджер';

      await ctx.reply(
        `╭─────────────────────╮\n` +
        `│  🎉  *РЕГИСТРАЦИЯ*\n` +
        `╰─────────────────────╯\n\n` +
        `Добро пожаловать в *VendCash*!\n\n` +
        `📋  Ваша роль: ${roleBadge}\n\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `✏️  Введите ваше имя:`,
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

          const roleBadge = this.getRoleBadge(user.role);

          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ✅  *УСПЕШНО*\n` +
            `╰─────────────────────╯\n\n` +
            `Добро пожаловать!\n\n` +
            `👤  *${user.name}*\n` +
            `${roleBadge}\n\n` +
            `Выберите действие:`,
            {
              parse_mode: 'Markdown',
              reply_markup: this.getMainMenu(user),
            },
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
            `╭─────────────────────╮\n` +
            `│  ✅  *ПРИНЯТО*\n` +
            `╰─────────────────────╯\n\n` +
            `💰  *${amount.toLocaleString('ru-RU')}* сум\n\n` +
            `Инкассация успешно принята!`,
            {
              parse_mode: 'Markdown',
              reply_markup: new InlineKeyboard()
                .text('📥 Ещё приём', 'pending_collections')
                .text('🏠 Меню', 'main_menu'),
            },
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

        await ctx.reply(
          `╭─────────────────────╮\n` +
          `│  ➕  *НОВЫЙ АВТОМАТ*\n` +
          `╰─────────────────────╯\n\n` +
          `📍 Шаг *2* из 2\n\n` +
          `📟  Код: \`${code}\`\n\n` +
          `Введите название автомата:`,
          {
            parse_mode: 'Markdown',
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

          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ✅  *СОЗДАНО*\n` +
            `╰─────────────────────╯\n\n` +
            `📟  Код: \`${machine.code}\`\n` +
            `📝  Название: ${machine.name}\n\n` +
            `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
            `⏳  *Ожидает подтверждения*\n\n` +
            `Админ получит уведомление\n` +
            `и проверит данные.`,
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
            '• *ЧЧ:ММ* (время сегодня)\n' +
            '• *ДД.ММ.ГГГГ* (дата)\n' +
            '• *ДД.ММ.ГГГГ ЧЧ:ММ* (дата и время)',
            {
              parse_mode: 'Markdown',
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

        await ctx.reply(
          `🏧 *${machine.name}*\n📟 ${machine.code}\n📍 ${machine.location || '—'}\n\n` +
          `⏰ Время: *${timeStr}*\n` +
          `${isHistorical ? '📆 _(исторические данные)_\n' : ''}\n` +
          `Подтвердить сбор?`,
          {
            parse_mode: 'Markdown',
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

          await ctx.reply(
            `╭─────────────────────╮\n` +
            `│  ✅  *СОХРАНЕНО*\n` +
            `╰─────────────────────╯\n\n` +
            `📝  ${textNames[textKey] || textKey}\n\n` +
            `Новое значение:\n` +
            `_${newText.length > 100 ? newText.slice(0, 100) + '...' : newText}_`,
            {
              parse_mode: 'Markdown',
              reply_markup: new InlineKeyboard()
                .text('👁 Превью', 'preview_welcome')
                .text('📝 К текстам', 'settings_texts'),
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
      const roleBadge = this.getRoleBadge(ctx.user.role);
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🏧  *VendCash*\n` +
        `╰─────────────────────╯\n\n` +
        `👤  *${ctx.user.name}*\n` +
        `${roleBadge}\n\n` +
        `Выберите действие:`,
        {
          parse_mode: 'Markdown',
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
        `│  🔍  *ПОИСК*\n` +
        `╰─────────────────────╯\n\n` +
        `Введите код или название\n` +
        `автомата _(мин. 2 символа)_`,
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
        `╭─────────────────────╮\n` +
        `│  ➕  *НОВЫЙ АВТОМАТ*\n` +
        `╰─────────────────────╯\n\n` +
        `📍 Шаг *1* из 2\n\n` +
        `Введите код _(серийный номер)_\n` +
        `автомата:`,
        {
          parse_mode: 'Markdown',
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

      ctx.session.selectedMachineId = machine.id;
      ctx.session.step = 'selecting_date';

      // Show date selection options
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  *НОВЫЙ СБОР*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${machine.name}*\n` +
        `📟  \`${machine.code}\`\n\n` +
        `Выберите время:`,
        {
          parse_mode: 'Markdown',
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
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  *ПОДТВЕРЖДЕНО*\n` +
          `╰─────────────────────╯\n\n` +
          `📟  \`${machine.code}\`\n` +
          `📝  ${machine.name}`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('🔍 Модерация', 'pending_machines'),
          },
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

        await ctx.answerCallbackQuery('Отклонено ✗');
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ❌  *ОТКЛОНЕНО*\n` +
          `╰─────────────────────╯\n\n` +
          `📟  \`${machine.code}\`\n` +
          `📝  ${machine.name}`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('🔍 Модерация', 'pending_machines'),
          },
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
          `╭─────────────────────╮\n` +
          `│  📦  *НОВЫЙ СБОР*\n` +
          `╰─────────────────────╯\n\n` +
          `Нет доступных автоматов\n\n` +
          `Создайте через поиск`,
          {
            parse_mode: 'Markdown',
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
        `│  📦  *НОВЫЙ СБОР*\n` +
        `╰─────────────────────╯\n\n` +
        `Выберите автомат:`,
        {
          parse_mode: 'Markdown',
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

      // Show date selection options
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  *НОВЫЙ СБОР*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${machine.name}*\n` +
        `📟  \`${machine.code}\`\n\n` +
        `Выберите время:`,
        {
          parse_mode: 'Markdown',
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

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  *ПОДТВЕРЖДЕНИЕ*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${machine.name}*\n` +
        `📟  \`${machine.code}\`\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'Markdown',
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
        `│  ⏰  *ВРЕМЯ*\n` +
        `╰─────────────────────╯\n\n` +
        `📅  ${dateStr}\n\n` +
        `Введите время:\n` +
        `_Например: 14:30_`,
        {
          parse_mode: 'Markdown',
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

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  *ПОДТВЕРЖДЕНИЕ*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${machine.name}*\n` +
        `📟  \`${machine.code}\`\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n` +
        `📆  _вчера_\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'Markdown',
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
        `│  📆  *ДАТА*\n` +
        `╰─────────────────────╯\n\n` +
        `Введите дату и время:\n\n` +
        `_Примеры:_\n` +
        `• 15.01.2026 14:30\n` +
        `• 20.01.2026`,
        {
          parse_mode: 'Markdown',
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

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  *ПОДТВЕРЖДЕНИЕ*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${machine.name}*\n` +
        `📟  \`${machine.code}\`\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'Markdown',
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

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📦  *ПОДТВЕРЖДЕНИЕ*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${machine.name}*\n` +
        `📟  \`${machine.code}\`\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `⏰  ${timeStr}\n\n` +
        `Подтвердить сбор?`,
        {
          parse_mode: 'Markdown',
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

        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  ✅  *ГОТОВО*\n` +
          `╰─────────────────────╯\n\n` +
          `🏧  ${machine?.name}\n` +
          `🔢  \`#${collection.id.slice(0, 8)}\`\n\n` +
          `Сбор успешно зарегистрирован!`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('📦 Ещё сбор', 'collect')
              .text('🏠 Меню', 'main_menu'),
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
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  📋  *МОИ СБОРЫ*\n` +
          `╰─────────────────────╯\n\n` +
          `За сегодня нет сборов`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('📦 Новый сбор', 'collect')
              .text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const lines = collections.map((c) => {
        const time = this.formatTime(c.collectedAt);
        const status = c.status === 'collected' ? '⏳' : c.status === 'received' ? '✅' : '❌';
        return `${status}  ${time}  ${c.machine.name}`;
      });

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📋  *МОИ СБОРЫ*\n` +
        `╰─────────────────────╯\n\n` +
        `📅 Сегодня: *${collections.length}*\n\n` +
        `${lines.join('\n')}\n\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `✅ принят  ⏳ ожидает`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('📦 Ещё сбор', 'collect')
            .text('🏠 Меню', 'main_menu'),
        },
      );
    });

    // Manager: Pending collections
    this.bot.callbackQuery('pending_collections', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const pending = await this.collectionsService.findPending();

      if (pending.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  📥  *ПРИЁМ*\n` +
          `╰─────────────────────╯\n\n` +
          `✅ Нет ожидающих инкассаций`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const keyboard = new InlineKeyboard();
      pending.slice(0, 10).forEach((c) => {
        const time = this.formatTime(c.collectedAt);
        keyboard.text(`⏳ ${time}  ${c.machine.name}`, `receive_${c.id}`).row();
      });
      keyboard.text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  📥  *ПРИЁМ*\n` +
        `╰─────────────────────╯\n\n` +
        `Ожидают: *${pending.length}*\n\n` +
        `Нажмите для приёма:`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        },
      );
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
        `╭─────────────────────╮\n` +
        `│  💰  *ПРИЁМ*\n` +
        `╰─────────────────────╯\n\n` +
        `🏧  *${collection.machine.name}*\n` +
        `⏰  ${time}\n` +
        `👤  ${collection.operator.name}\n\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `✏️ Введите сумму _(сум)_:`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('✖️ Отмена', 'pending_collections'),
        },
      );
    });

    // Admin: Invite user
    this.bot.callbackQuery('invite_user', async (ctx) => {
      if (!ctx.user) return;
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
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const role = ctx.match[1] === 'operator' ? UserRole.OPERATOR : UserRole.MANAGER;
      const roleBadge = role === UserRole.OPERATOR ? '🟢 Оператор' : '🔵 Менеджер';

      try {
        const invite = await this.invitesService.create(ctx.user.id, role);
        const botInfo = await this.bot.api.getMe();
        const link = `https://t.me/${botInfo.username}?start=invite_${invite.code}`;

        // Send as a new message (not edit) for easy forwarding
        await ctx.deleteMessage().catch(() => {});

        await ctx.reply(
          `╭─────────────────────╮\n` +
          `│  📨  <b>ПРИГЛАШЕНИЕ</b>\n` +
          `╰─────────────────────╯\n\n` +
          `${roleBadge}\n` +
          `⏰  Действует <b>24 часа</b>\n\n` +
          `────────────────────\n` +
          `👇 Перешлите это сообщение\n` +
          `или нажмите кнопку:`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .url('🚀 Открыть', link)
              .row()
              .text('🔄 Новая', `create_invite_${ctx.match[1]}`)
              .text('🏠 Меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        // Escape error message to prevent Markdown issues
        const safeError = this.escapeMarkdown(error.message || 'Неизвестная ошибка');
        await ctx.reply(`❌ Ошибка: ${safeError}`);
      }
    });

    // Admin: Pending machines
    this.bot.callbackQuery('pending_machines', async (ctx) => {
      if (!ctx.user || ctx.user.role !== UserRole.ADMIN) return;
      await ctx.answerCallbackQuery();

      const pending = await this.machinesService.findPending();

      if (pending.length === 0) {
        await ctx.editMessageText(
          `╭─────────────────────╮\n` +
          `│  🔍  *МОДЕРАЦИЯ*\n` +
          `╰─────────────────────╯\n\n` +
          `✅ Нет автоматов на проверке`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('🏠 Меню', 'main_menu'),
          },
        );
        return;
      }

      const keyboard = new InlineKeyboard();
      pending.slice(0, 10).forEach((m) => {
        keyboard.text(`⏳ ${m.code}  ${m.name}`, `review_machine_${m.id}`).row();
      });
      keyboard.text('🏠 Меню', 'main_menu');

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🔍  *МОДЕРАЦИЯ*\n` +
        `╰─────────────────────╯\n\n` +
        `На проверке: *${pending.length}*\n\n` +
        `Нажмите для просмотра:`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        },
      );
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
        ? `👤  ${machine.createdBy.name}`
        : '👤  Неизвестно';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🔍  *ПРОВЕРКА*\n` +
        `╰─────────────────────╯\n\n` +
        `📟  Код: \`${machine.code}\`\n` +
        `📝  ${machine.name}\n` +
        `📍  ${machine.location || '—'}\n\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `${creatorInfo}\n` +
        `📅  ${this.formatDateTime(machine.createdAt)}`,
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
      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  🌐  *ВЕБ-ПАНЕЛЬ*\n` +
        `╰─────────────────────╯\n\n` +
        `Откройте для просмотра\n` +
        `отчётов и аналитики:`,
        {
          parse_mode: 'Markdown',
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
          `🟢 *Оператор*\n\n` +
          `📦  *Новый сбор*\n` +
          `Регистрация инкассации\n\n` +
          `🔍  *Поиск*\n` +
          `Найти автомат по коду\n` +
          `или названию\n\n` +
          `📋  *Мои сборы*\n` +
          `История за сегодня\n\n` +
          `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
          `💡 Не нашли автомат?\n` +
          `Создайте новый через поиск`;
      } else if (ctx.user.role === UserRole.MANAGER) {
        helpContent =
          `🔵 *Менеджер*\n\n` +
          `📥  *Принять*\n` +
          `Приём инкассаций\n\n` +
          `🔍  *Поиск*\n` +
          `Найти автомат\n\n` +
          `🌐  *Веб-панель*\n` +
          `Отчёты и аналитика`;
      } else {
        helpContent =
          `🟣 *Администратор*\n\n` +
          `📥  *Принять*\n` +
          `Приём инкассаций\n\n` +
          `🔍  *Модерация*\n` +
          `Проверка новых автоматов\n\n` +
          `👥  *Пригласить*\n` +
          `Добавить сотрудника\n\n` +
          `⚙️  *Настройки*\n` +
          `Настройки бота`;
      }

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ❔  *ПОМОЩЬ*\n` +
        `╰─────────────────────╯\n\n` +
        helpContent,
        {
          parse_mode: 'Markdown',
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

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  👤  *АККАУНТ*\n` +
        `╰─────────────────────╯\n\n` +
        `📛  *${ctx.user.name}*\n` +
        `${roleBadge}\n\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `⚠️ Деактивация необратима`,
        {
          parse_mode: 'Markdown',
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
        `│  ⚠️  *ВНИМАНИЕ*\n` +
        `╰─────────────────────╯\n\n` +
        `После деактивации:\n\n` +
        `• Потеряете доступ\n` +
        `• Нужно новое приглашение\n` +
        `• Данные сохранятся`,
        {
          parse_mode: 'Markdown',
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
          `│  👋  *ДО СВИДАНИЯ*\n` +
          `╰─────────────────────╯\n\n` +
          `Аккаунт деактивирован\n\n` +
          `Для восстановления\n` +
          `обратитесь к админу`,
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

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ⚙️  *НАСТРОЙКИ*\n` +
        `╰─────────────────────╯\n\n` +
        `Управление ботом:`,
        {
          parse_mode: 'Markdown',
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
        `│  🖼  *КАРТИНКА*\n` +
        `╰─────────────────────╯\n\n` +
        `Статус: ${imageStatus}\n\n` +
        `Показывается при входе\n` +
        `без приглашения`,
        {
          parse_mode: 'Markdown',
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
        `│  📝  *ТЕКСТЫ*\n` +
        `╰─────────────────────╯\n\n` +
        `Редактирование текстов бота:\n\n` +
        `🏷  Заголовок: ${welcomeTitle ? '✅' : '⚪️'}\n` +
        `📄  Описание: ${welcomeText ? '✅' : '⚪️'}`,
        {
          parse_mode: 'Markdown',
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
      const preview = currentValue
        ? currentValue.length > 100
          ? currentValue.slice(0, 100) + '...'
          : currentValue
        : '_не задан_';

      await ctx.editMessageText(
        `╭─────────────────────╮\n` +
        `│  ✏️  *РЕДАКТОР*\n` +
        `╰─────────────────────╯\n\n` +
        `📝  *${textNames[textKey] || textKey}*\n\n` +
        `Текущее значение:\n${preview}\n\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `Введите новый текст:`,
        {
          parse_mode: 'Markdown',
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
          `│  ✅  *ОЧИЩЕНО*\n` +
          `╰─────────────────────╯\n\n` +
          `Текст сброшен на значение\n` +
          `по умолчанию`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('◀️ К текстам', 'settings_texts'),
          },
        );
      } catch (error: any) {
        await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
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
          `│  ✅  *СБРОШЕНО*\n` +
          `╰─────────────────────╯\n\n` +
          `Все тексты сброшены\n` +
          `на значения по умолчанию`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('◀️ К текстам', 'settings_texts'),
          },
        );
      } catch (error: any) {
        await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
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
        `│  🖼  *КАРТИНКА*\n` +
        `╰─────────────────────╯\n\n` +
        `Выберите способ:\n\n` +
        `📷  Отправьте фото\n` +
        `🔗  Или ссылку (https://...)`,
        {
          parse_mode: 'Markdown',
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
        .text('⚙️ Настройки', 'bot_settings').row();
      kb.text('🌐 Веб-панель', 'web_panel')
        .text('❔ Помощь', 'help').row();
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
      `📟 Код: \`${machine.code}\`\n` +
      `📝 Название: ${machine.name}\n` +
      `👤 Создал: ${creator.name} (@${creator.telegramUsername || 'нет'})\n` +
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

  private formatCard(title: string, content: string, footer?: string): string {
    let card = `╭─────────────────────╮\n│  ${title}\n╰─────────────────────╯\n\n${content}`;
    if (footer) {
      card += `\n\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n${footer}`;
    }
    return card;
  }

  private escapeMarkdown(text: string): string {
    // Escape special Markdown characters: _ * ` [
    return text.replace(/([_*`\[])/g, '\\$1');
  }

  private async showWelcomeScreen(ctx: MyContext): Promise<void> {
    // Welcome image from DB settings, fallback to env, then default
    const welcomeImage =
      (await this.settingsService.getWelcomeImage()) ||
      this.configService.get<string>('telegram.welcomeImage') ||
      'https://i.imgur.com/JQvVqXh.png';

    // Dynamic texts from DB settings (escaped for Markdown)
    const welcomeTitle = this.escapeMarkdown(
      (await this.settingsService.getWelcomeTitle()) || 'VendCash'
    );
    const welcomeText = this.escapeMarkdown(
      (await this.settingsService.getWelcomeText()) ||
      'Система учёта инкассации\nвендинговых автоматов'
    );

    const caption =
      `╭─────────────────────╮\n` +
      `│  🏧  *${welcomeTitle}*\n` +
      `╰─────────────────────╯\n\n` +
      `${welcomeText}\n\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n\n` +
      `🔐 Для доступа необходимо\n` +
      `получить приглашение`;

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
