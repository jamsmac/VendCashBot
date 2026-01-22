import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard, session, Context, SessionFlavor } from 'grammy';
import { UsersService } from '../modules/users/users.service';
import { InvitesService } from '../modules/invites/invites.service';
import { MachinesService } from '../modules/machines/machines.service';
import { CollectionsService } from '../modules/collections/collections.service';
import { User, UserRole } from '../modules/users/entities/user.entity';

interface SessionData {
  step: 'idle' | 'registering' | 'selecting_machine' | 'confirming' | 'entering_amount';
  inviteCode?: string;
  selectedMachineId?: string;
  collectionTime?: Date;
  pendingCollectionId?: string;
}

type MyContext = Context & SessionFlavor<SessionData> & { user?: User };

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

    this.setupHandlers();

    try {
      await this.bot.start();
      this.logger.log('Telegram bot started successfully');
    } catch (error) {
      this.logger.error('Failed to start Telegram bot:', error);
    }
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
        await ctx.reply(`👋 С возвращением, ${ctx.user.name}!`, {
          reply_markup: this.getMainMenu(ctx.user),
        });
        return;
      }

      // New user without invite
      if (!payload || !payload.startsWith('invite_')) {
        await ctx.reply(
          '👋 Добро пожаловать в VendCash!\n\n' +
            'Для регистрации нужна ссылка-приглашение от администратора.',
        );
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

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('Введите корректную сумму (число > 0):');
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
    });

    // Callback query handlers
    this.bot.callbackQuery('main_menu', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(`👋 ${ctx.user.name}\n\nВыберите действие:`, {
        reply_markup: this.getMainMenu(ctx.user),
      });
    });

    // Operator: Start collection
    this.bot.callbackQuery('collect', async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machines = await this.machinesService.findAllActive();

      if (machines.length === 0) {
        await ctx.editMessageText('❌ Нет доступных автоматов', {
          reply_markup: new InlineKeyboard().text('◀️ Назад', 'main_menu'),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      machines.forEach((m) => {
        keyboard.text(`${m.name}`, `machine_${m.id}`).row();
      });
      keyboard.text('◀️ Назад', 'main_menu');

      await ctx.editMessageText('🏧 Выберите автомат:', { reply_markup: keyboard });
      ctx.session.step = 'selecting_machine';
    });

    // Machine selection
    this.bot.callbackQuery(/^machine_(.+)$/, async (ctx) => {
      if (!ctx.user) return;
      await ctx.answerCallbackQuery();

      const machineId = ctx.match[1];
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
        `🏧 *${machine.name}*\n📍 ${machine.location || '—'}\n\n⏰ Время: *${timeStr}*\n\nПодтвердить сбор?`,
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
      const machine = await this.machinesService.findById(machineId);
      if (!machine) return;

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = this.formatDateTime(ctx.session.collectionTime);

      await ctx.editMessageText(
        `🏧 *${machine.name}*\n📍 ${machine.location || '—'}\n\n⏰ Время: *${timeStr}*\n\nПодтвердить сбор?`,
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
      if (!ctx.user || !ctx.session.selectedMachineId || !ctx.session.collectionTime) return;
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
          `✅ *Сбор зарегистрирован!*\n\n🏧 ${machine?.name}\n🔢 #${collection.id.slice(0, 8)}`,
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

      const collection = await this.collectionsService.findById(ctx.match[1]);
      if (!collection) {
        await ctx.editMessageText('❌ Инкассация не найдена');
        return;
      }

      ctx.session.step = 'entering_amount';
      ctx.session.pendingCollectionId = collection.id;

      const time = this.formatDateTime(collection.collectedAt);

      await ctx.editMessageText(
        `💰 *Введите сумму (сум):*\n\n🏧 ${collection.machine.name}\n⏰ ${time}\n👷 ${collection.operator.name}`,
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

      try {
        const invite = await this.invitesService.create(ctx.user.id, role);
        const botInfo = await this.bot.api.getMe();
        const link = `https://t.me/${botInfo.username}?start=invite_${invite.code}`;

        await ctx.editMessageText(
          `✅ Ссылка для приглашения:\n\n\`${link}\`\n\n⏰ Действует 24 часа`,
          {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('🔄 Новая ссылка', `create_invite_${ctx.match[1]}`)
              .row()
              .text('◀️ В меню', 'main_menu'),
          },
        );
      } catch (error: any) {
        await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
      }
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
          '• Выберите "Отметить сбор" для регистрации инкассации\n' +
          '• Выберите автомат из списка\n' +
          '• Подтвердите время сбора\n' +
          '• Менеджер примет инкассацию и введёт сумму';
      } else {
        helpText +=
          '📊 *Менеджер*\n' +
          '• "Ожидают приёма" — список инкассаций для приёма\n' +
          '• Нажмите на инкассацию и введите сумму\n' +
          '• Используйте веб-панель для отчётов и управления';
      }

      await ctx.editMessageText(helpText, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu'),
      });
    });
  }

  private getMainMenu(user: User): InlineKeyboard {
    const kb = new InlineKeyboard();

    if (user.role === UserRole.OPERATOR) {
      kb.text('🏧 Отметить сбор', 'collect').row();
      kb.text('📋 Мои сборы', 'my_collections').row();
    } else {
      kb.text('📥 Ожидают приёма', 'pending_collections').row();
      kb.text('🌐 Веб-панель', 'web_panel').row();

      if (user.role === UserRole.ADMIN) {
        kb.text('👥 Пригласить', 'invite_user').row();
      }
    }

    kb.text('❓ Помощь', 'help');
    return kb;
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
}
