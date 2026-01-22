# VendCash — Система учёта инкассации

## 1. Обзор системы

### 1.1 Назначение
VendCash — инструмент для учёта инкассации вендинговых автоматов с двухэтапным процессом: фиксация сбора оператором и ввод суммы менеджером.

### 1.2 Ключевые особенности
- **Telegram бот** для операторов (мобильный сбор)
- **Веб-интерфейс** для менеджеров (приём, пересчёт, отчёты)
- **Автономная работа** с подготовкой к интеграции VHM24
- **Простота** — минимум действий для каждой роли
- **Точное время сбора** — фиксация до секунды для точного учёта

### 1.3 Точность времени сбора

⚠️ **Время сбора (`collected_at`) фиксируется с точностью до секунды** — это необходимо для точного учёта и будущей интеграции.

| Где | Формат отображения | Пример |
|-----|-------------------|--------|
| Telegram бот (подтверждение) | ДД.ММ.ГГГГ ЧЧ:ММ:СС | 22.01.2026 14:35:47 |
| Веб: список ожидающих | ЧЧ:ММ:СС | 14:35:47 |
| Веб: детали инкассации | ДД.ММ.ГГГГ ЧЧ:ММ:СС | 22.01.2026 14:35:47 |
| Веб: отчёты/экспорт | ISO 8601 + локальный | 2026-01-22T14:35:47+05:00 |
| API | ISO 8601 UTC | 2026-01-22T09:35:47.000Z |

### 1.4 Роли пользователей

| Роль | Платформа | Возможности |
|------|-----------|-------------|
| Оператор | Telegram бот | Выбор автомата, отметка времени сбора |
| Менеджер | Telegram бот + Web | Приём инкассации, ввод суммы, отчёты, ввод истории |
| Admin | Telegram бот + Web | Всё + управление автоматами, приглашение сотрудников |

### 1.5 Регистрация по приглашению

Простая регистрация через одноразовые ссылки:

```
1. Админ в веб-интерфейсе нажимает "Пригласить"
2. Выбирает роль: Оператор или Менеджер
3. Система генерирует ссылку: t.me/VendCashBot?start=invite_abc123
4. Админ отправляет ссылку сотруднику (WhatsApp, SMS, лично)
5. Сотрудник переходит по ссылке → открывается бот
6. Нажимает Start → автоматически зарегистрирован с нужной ролью
7. Видит меню в соответствии с ролью
```

**Преимущества:**
- Не нужно вводить Telegram ID вручную
- Не нужны логины/пароли
- Авторизация в Web через Telegram Login Widget

---

## 2. Архитектура

### 2.1 Компоненты системы

```
┌─────────────────┐     ┌─────────────────┐
│  Telegram Bot   │     │   Web Frontend  │
│   (grammY)      │     │    (React)      │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │   Backend   │
              │  (NestJS)   │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │ PostgreSQL  │
              └─────────────┘
```

### 2.2 Технологический стек

| Компонент | Технология |
|-----------|------------|
| Backend | NestJS + TypeORM |
| Database | PostgreSQL |
| Telegram Bot | grammY |
| Web Frontend | React + Tailwind CSS |
| Deployment | Docker + Hetzner VPS |

### 2.3 Структура проекта

```
vendcash/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── machines/
│   │   │   ├── collections/
│   │   │   └── reports/
│   │   ├── telegram/
│   │   │   ├── telegram.module.ts
│   │   │   ├── telegram.service.ts
│   │   │   └── handlers/
│   │   └── common/
│   └── docker-compose.yml
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── api/
│   └── package.json
└── docs/
```

---

## 3. База данных

### 3.1 ER-диаграмма

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    users     │       │   collections    │       │   machines   │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id           │       │ id               │       │ id           │
│ telegram_id  │       │ machine_id ──────┼──────►│ code         │
│ telegram_user│◄──────┼─ operator_id     │       │ name         │
│ name         │◄──────┼─ manager_id      │       │ location     │
│ phone        │       │ collected_at     │       │ is_active    │
│ role         │       │ received_at      │       │ vhm24_id     │
│ is_active    │       │ amount           │       │ created_at   │
│ created_at   │       │ status           │       └──────────────┘
└──────┬───────┘       │ source           │
       │               │ notes            │
       │               │ created_at       │
       │               └──────────────────┘
       │
       │         ┌──────────────┐
       │         │   invites    │
       │         ├──────────────┤
       └────────►│ id           │
                 │ code         │
                 │ role         │
                 │ created_by   │
                 │ used_by      │
                 │ expires_at   │
                 └──────────────┘
```

### 3.2 Таблицы

#### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(100),        -- @username для отображения
    telegram_first_name VARCHAR(255),
    name VARCHAR(255) NOT NULL,            -- Может редактировать сам или админ
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'manager', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_role ON users(role);
```

#### invites (приглашения)
```sql
CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,      -- Короткий код для ссылки
    role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'manager')),
    created_by UUID NOT NULL REFERENCES users(id),
    used_by UUID REFERENCES users(id),     -- Кто использовал
    used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,         -- Срок действия (24 часа)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invites_code ON invites(code);
```

#### machines
```sql
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,  -- Короткий код для быстрого выбора: "A01", "B12"
    name VARCHAR(255) NOT NULL,         -- "Автомат у метро Чиланзар"
    location VARCHAR(500),              -- Адрес/описание локации
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Поля для будущей интеграции с VHM24
    vhm24_id UUID,
    vhm24_synced_at TIMESTAMP
);

-- Индексы
CREATE INDEX idx_machines_code ON machines(code);
CREATE INDEX idx_machines_active ON machines(is_active);
```

#### collections (инкассации)
```sql
CREATE TYPE collection_status AS ENUM ('collected', 'received', 'cancelled');
CREATE TYPE collection_source AS ENUM ('realtime', 'manual_history', 'excel_import');

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Связи
    machine_id UUID NOT NULL REFERENCES machines(id),
    operator_id UUID NOT NULL REFERENCES users(id),
    manager_id UUID REFERENCES users(id),
    
    -- Этап 1: Сбор (оператор)
    collected_at TIMESTAMP NOT NULL,  -- Время сбора денег (до секунды!)
    
    -- Этап 2: Приём (менеджер)
    received_at TIMESTAMP,            -- Время приёма/пересчёта
    amount DECIMAL(15, 2),            -- Сумма в сумах
    
    -- Статус и источник
    status collection_status NOT NULL DEFAULT 'collected',
    source collection_source NOT NULL DEFAULT 'realtime',
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для отчётов
CREATE INDEX idx_collections_machine ON collections(machine_id);
CREATE INDEX idx_collections_operator ON collections(operator_id);
CREATE INDEX idx_collections_status ON collections(status);
CREATE INDEX idx_collections_source ON collections(source);
CREATE INDEX idx_collections_collected_at ON collections(collected_at);
CREATE INDEX idx_collections_received_at ON collections(received_at);

-- Составной индекс для отчётов по периодам
CREATE INDEX idx_collections_machine_date ON collections(machine_id, collected_at);

-- Индекс для поиска дубликатов при импорте
CREATE INDEX idx_collections_machine_collected ON collections(machine_id, collected_at);
```

### 3.3 TypeORM Entities

#### user.entity.ts
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Collection } from './collection.entity';

export enum UserRole {
  OPERATOR = 'operator',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'telegram_id', type: 'bigint', unique: true })
  telegramId: number;

  @Column({ name: 'telegram_username', nullable: true })
  telegramUsername: string;  // @username

  @Column({ name: 'telegram_first_name', nullable: true })
  telegramFirstName: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Collection, (collection) => collection.operator)
  operatedCollections: Collection[];

  @OneToMany(() => Collection, (collection) => collection.manager)
  managedCollections: Collection[];
}
```

#### invite.entity.ts
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { UserRole } from './user.entity';

@Entity('invites')
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;  // Короткий код: "abc123"

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'used_by' })
  usedBy: User;

  @Column({ name: 'used_at', nullable: true })
  usedAt: Date;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get isUsed(): boolean {
    return !!this.usedBy;
  }
}
```

#### machine.entity.ts
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Collection } from './collection.entity';

@Entity('machines')
export class Machine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  location: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Для интеграции с VHM24
  @Column({ name: 'vhm24_id', type: 'uuid', nullable: true })
  vhm24Id: string;

  @Column({ name: 'vhm24_synced_at', nullable: true })
  vhm24SyncedAt: Date;

  @OneToMany(() => Collection, (collection) => collection.machine)
  collections: Collection[];
}
```

#### collection.entity.ts
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Machine } from './machine.entity';

export enum CollectionStatus {
  COLLECTED = 'collected',  // Оператор собрал
  RECEIVED = 'received',    // Менеджер принял и пересчитал
  CANCELLED = 'cancelled',  // Отменено
}

export enum CollectionSource {
  REALTIME = 'realtime',           // Обычный сбор через бота
  MANUAL_HISTORY = 'manual_history', // Ручной ввод исторических данных
  EXCEL_IMPORT = 'excel_import',   // Импорт из Excel
}

@Entity('collections')
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Machine, (machine) => machine.collections)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'machine_id' })
  machineId: string;

  @ManyToOne(() => User, (user) => user.operatedCollections)
  @JoinColumn({ name: 'operator_id' })
  operator: User;

  @Column({ name: 'operator_id' })
  operatorId: string;

  @ManyToOne(() => User, (user) => user.managedCollections, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  @Column({ name: 'manager_id', nullable: true })
  managerId: string;

  @Column({ name: 'collected_at', type: 'timestamp' })
  collectedAt: Date;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'enum', enum: CollectionStatus, default: CollectionStatus.COLLECTED })
  status: CollectionStatus;

  @Column({ type: 'enum', enum: CollectionSource, default: CollectionSource.REALTIME })
  source: CollectionSource;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

## 4. Telegram Bot

### 4.1 Регистрация по приглашению

```
Пользователь переходит по ссылке:
t.me/VendCashBot?start=invite_abc123
           │
           ▼
┌──────────────────────────────────┐
│  👋 Добро пожаловать в VendCash! │
│                                  │
│  Вы приглашены как: Оператор     │
│                                  │
│  Введите ваше имя:               │
└──────────────────────────────────┘
           │
    Пользователь вводит: "Алишер"
           │
           ▼
┌──────────────────────────────────┐
│  ✅ Регистрация завершена!       │
│                                  │
│  Имя: Алишер                     │
│  Роль: Оператор                  │
│                                  │
│  [🏧 Начать работу]              │
└──────────────────────────────────┘
```

### 4.2 Меню по ролям

#### Оператор
```
┌──────────────────────────────────┐
│  👷 Меню оператора               │
│                                  │
│  [🏧 Отметить сбор]              │
│  [📋 Мои сборы за сегодня]       │
│  [❓ Помощь]                     │
└──────────────────────────────────┘
```

#### Менеджер
```
┌──────────────────────────────────┐
│  📊 Меню менеджера               │
│                                  │
│  [📥 Ожидают приёма (5)]         │
│  [📋 Все инкассации]             │
│  [📊 Отчёты]                     │
│  [🌐 Открыть веб-панель]         │
│  [❓ Помощь]                     │
└──────────────────────────────────┘
```

#### Админ
```
┌──────────────────────────────────┐
│  👑 Меню администратора          │
│                                  │
│  [📥 Ожидают приёма (5)]         │
│  [📋 Все инкассации]             │
│  [📊 Отчёты]                     │
│  [👥 Пригласить сотрудника]      │
│  [🌐 Открыть веб-панель]         │
│  [❓ Помощь]                     │
└──────────────────────────────────┘
```

### 4.3 Приглашение через бота (для админа)

```
Админ нажимает "Пригласить сотрудника"
           │
           ▼
┌──────────────────────────────────┐
│  Выберите роль:                  │
│                                  │
│  [👷 Оператор]                   │
│  [📊 Менеджер]                   │
└──────────────────────────────────┘
           │
    Выбирает "Оператор"
           │
           ▼
┌──────────────────────────────────┐
│  ✅ Ссылка для приглашения:      │
│                                  │
│  t.me/VendCashBot?start=inv_x7k9 │
│                                  │
│  ⏰ Действует 24 часа            │
│                                  │
│  [📋 Копировать] [🔄 Новая]      │
└──────────────────────────────────┘
```

### 4.4 Быстрый приём инкассации (для менеджера в боте)

```
Менеджер нажимает "Ожидают приёма"
           │
           ▼
┌──────────────────────────────────┐
│  📥 Ожидают приёма: 3            │
│                                  │
│  14:35 [5b7b...] Кардиология     │
│        Оператор: Алишер          │
│        [✅ Принять]              │
│  ─────────────────────────────── │
│  15:20 [a7ca...] KIUT CLINIC     │
│        Оператор: Бахром          │
│        [✅ Принять]              │
│                                  │
│  [◀️ Назад]                      │
└──────────────────────────────────┘
           │
    Нажимает "Принять"
           │
           ▼
┌──────────────────────────────────┐
│  💰 Введите сумму (сум):         │
│                                  │
│  🏧 5b7b181f0000 - Кардиология   │
│  ⏰ Сбор: 22.01.2026 14:35:47    │
│  👷 Оператор: Алишер             │
└──────────────────────────────────┘
           │
    Вводит: 850000
           │
           ▼
┌──────────────────────────────────┐
│  ✅ Инкассация принята!          │
│                                  │
│  🏧 Кардиология КПП              │
│  💰 850,000 сум                  │
│                                  │
│  [◀️ К списку] [🏠 В меню]       │
└──────────────────────────────────┘
```

### 4.5 Код бота

```typescript
// telegram/telegram.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, InlineKeyboard, session } from 'grammy';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../modules/users/users.service';
import { InvitesService } from '../modules/invites/invites.service';
import { MachinesService } from '../modules/machines/machines.service';
import { CollectionsService } from '../modules/collections/collections.service';
import { UserRole } from '../modules/users/entities/user.entity';

interface SessionData {
  step: 'idle' | 'registering' | 'selecting_machine' | 'confirming' | 'entering_amount';
  inviteCode?: string;
  selectedMachineId?: string;
  collectionTime?: Date;
  pendingCollectionId?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Bot;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private invitesService: InvitesService,
    private machinesService: MachinesService,
    private collectionsService: CollectionsService,
  ) {
    this.bot = new Bot(this.configService.get('TELEGRAM_BOT_TOKEN'));
  }

  async onModuleInit() {
    this.bot.use(session({ initial: (): SessionData => ({ step: 'idle' }) }));
    
    // Middleware для получения пользователя
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        ctx.user = await this.usersService.findByTelegramId(ctx.from.id);
      }
      await next();
    });

    this.setupHandlers();
    this.bot.start();
  }

  private setupHandlers() {
    // /start с возможным invite кодом (deep link)
    this.bot.command('start', async (ctx) => {
      const payload = ctx.match; // invite_abc123

      // Уже зарегистрирован - показываем меню
      if (ctx.user) {
        if (!ctx.user.isActive) {
          await ctx.reply('❌ Ваш аккаунт деактивирован. Обратитесь к администратору.');
          return;
        }
        await ctx.reply(
          `👋 С возвращением, ${ctx.user.name}!`,
          { reply_markup: this.getMainMenu(ctx.user) }
        );
        return;
      }

      // Новый пользователь без приглашения
      if (!payload || !payload.startsWith('invite_')) {
        await ctx.reply(
          '👋 Добро пожаловать в VendCash!\n\n' +
          'Для регистрации нужна ссылка-приглашение от администратора.'
        );
        return;
      }

      // Проверяем приглашение
      const inviteCode = payload.replace('invite_', '');
      const invite = await this.invitesService.findByCode(inviteCode);

      if (!invite || invite.isUsed || invite.isExpired) {
        await ctx.reply('❌ Ссылка недействительна или истёк срок действия.');
        return;
      }

      // Начинаем регистрацию
      ctx.session.step = 'registering';
      ctx.session.inviteCode = inviteCode;

      const roleName = invite.role === UserRole.OPERATOR ? 'Оператор' : 'Менеджер';
      
      await ctx.reply(
        `👋 Добро пожаловать в VendCash!\n\n` +
        `Вы приглашены как: *${roleName}*\n\n` +
        `Введите ваше имя:`,
        { parse_mode: 'Markdown' }
      );
    });

    // Обработка ввода имени при регистрации
    this.bot.on('message:text', async (ctx, next) => {
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

        // Создаём пользователя
        const user = await this.usersService.create({
          telegramId: ctx.from.id,
          telegramUsername: ctx.from.username,
          telegramFirstName: ctx.from.first_name,
          name: name,
          role: invite.role,
        });

        // Помечаем приглашение как использованное
        await this.invitesService.markAsUsed(invite.id, user.id);

        ctx.session.step = 'idle';
        ctx.session.inviteCode = undefined;
        ctx.user = user;

        const roleName = user.role === UserRole.OPERATOR ? 'Оператор' : 'Менеджер';

        await ctx.reply(
          `✅ Регистрация завершена!\n\n` +
          `👤 Имя: ${user.name}\n` +
          `🎭 Роль: ${roleName}`,
          { reply_markup: this.getMainMenu(user) }
        );
        return;
      }

      // Ввод суммы при приёме инкассации (для менеджера)
      if (ctx.session.step === 'entering_amount' && ctx.session.pendingCollectionId) {
        const amountStr = ctx.message.text.replace(/\s/g, '');
        const amount = parseInt(amountStr, 10);

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('Введите корректную сумму (число > 0):');
          return;
        }

        await this.collectionsService.receive(
          ctx.session.pendingCollectionId,
          ctx.user.id,
          amount
        );

        ctx.session.step = 'idle';
        ctx.session.pendingCollectionId = undefined;

        await ctx.reply(
          `✅ Инкассация принята!\n💰 Сумма: ${amount.toLocaleString()} сум`,
          { reply_markup: this.getMainMenu(ctx.user) }
        );
        return;
      }

      await next();
    });

    // Главное меню
    this.bot.callbackQuery('main_menu', async (ctx) => {
      if (!ctx.user) return;
      await ctx.editMessageText(
        `👋 ${ctx.user.name}\n\nВыберите действие:`,
        { reply_markup: this.getMainMenu(ctx.user) }
      );
    });

    // === ОПЕРАТОР: Отметить сбор ===
    this.bot.callbackQuery('collect', async (ctx) => {
      const machines = await this.machinesService.findAllActive();
      
      const keyboard = new InlineKeyboard();
      machines.forEach((m) => {
        keyboard.text(`${m.name}`, `machine_${m.id}`).row();
      });
      keyboard.text('◀️ Назад', 'main_menu');

      await ctx.editMessageText('🏧 Выберите автомат:', { reply_markup: keyboard });
      ctx.session.step = 'selecting_machine';
    });

    this.bot.callbackQuery(/^machine_(.+)$/, async (ctx) => {
      const machine = await this.machinesService.findById(ctx.match[1]);
      if (!machine) return;

      ctx.session.selectedMachineId = machine.id;
      ctx.session.collectionTime = new Date();
      ctx.session.step = 'confirming';

      const timeStr = ctx.session.collectionTime.toLocaleString('ru-RU', { 
        timeZone: 'Asia/Tashkent',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      await ctx.editMessageText(
        `🏧 *${machine.name}*\n📍 ${machine.location || '—'}\n\n⏰ Время: *${timeStr}*\n\nПодтвердить сбор?`,
        { 
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', 'confirm_collection')
            .text('❌ Отмена', 'main_menu')
        }
      );
    });

    this.bot.callbackQuery('confirm_collection', async (ctx) => {
      if (!ctx.session.selectedMachineId || !ctx.session.collectionTime) return;

      const collection = await this.collectionsService.create({
        machineId: ctx.session.selectedMachineId,
        operatorId: ctx.user.id,
        collectedAt: ctx.session.collectionTime,
      });

      const machine = await this.machinesService.findById(ctx.session.selectedMachineId);
      ctx.session.step = 'idle';
      ctx.session.selectedMachineId = undefined;

      await ctx.editMessageText(
        `✅ *Сбор зарегистрирован!*\n\n🏧 ${machine.name}\n🔢 #${collection.id.slice(0, 8)}`,
        { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu') }
      );
    });

    // === МЕНЕДЖЕР: Ожидающие приёма ===
    this.bot.callbackQuery('pending_collections', async (ctx) => {
      const pending = await this.collectionsService.findPending();
      
      if (pending.length === 0) {
        await ctx.editMessageText('✅ Нет ожидающих приёма', {
          reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu')
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      pending.slice(0, 10).forEach((c) => {
        const time = c.collectedAt.toLocaleTimeString('ru-RU', { 
          timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' 
        });
        keyboard.text(`${time} ${c.machine.name}`, `receive_${c.id}`).row();
      });
      keyboard.text('◀️ В меню', 'main_menu');

      await ctx.editMessageText(`📥 Ожидают приёма: ${pending.length}`, { reply_markup: keyboard });
    });

    this.bot.callbackQuery(/^receive_(.+)$/, async (ctx) => {
      const collection = await this.collectionsService.findById(ctx.match[1]);
      if (!collection) return;

      ctx.session.step = 'entering_amount';
      ctx.session.pendingCollectionId = collection.id;

      const time = collection.collectedAt.toLocaleString('ru-RU', { 
        timeZone: 'Asia/Tashkent',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      await ctx.editMessageText(
        `💰 *Введите сумму (сум):*\n\n` +
        `🏧 ${collection.machine.name}\n` +
        `⏰ ${time}\n` +
        `👷 ${collection.operator.name}`,
        { parse_mode: 'Markdown' }
      );
    });

    // === АДМИН: Приглашение ===
    this.bot.callbackQuery('invite_user', async (ctx) => {
      await ctx.editMessageText('Выберите роль:', {
        reply_markup: new InlineKeyboard()
          .text('👷 Оператор', 'create_invite_operator').row()
          .text('📊 Менеджер', 'create_invite_manager').row()
          .text('◀️ Назад', 'main_menu')
      });
    });

    this.bot.callbackQuery(/^create_invite_(operator|manager)$/, async (ctx) => {
      const role = ctx.match[1] === 'operator' ? UserRole.OPERATOR : UserRole.MANAGER;
      const invite = await this.invitesService.create(ctx.user.id, role);
      
      const botUsername = this.bot.botInfo.username;
      const link = `https://t.me/${botUsername}?start=invite_${invite.code}`;

      await ctx.editMessageText(
        `✅ Ссылка для приглашения:\n\n\`${link}\`\n\n⏰ Действует 24 часа`,
        { 
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('🔄 Новая ссылка', `create_invite_${ctx.match[1]}`).row()
            .text('◀️ В меню', 'main_menu')
        }
      );
    });

    // Веб-панель
    this.bot.callbackQuery('web_panel', async (ctx) => {
      const webUrl = this.configService.get('FRONTEND_URL');
      await ctx.editMessageText(
        `🌐 Веб-панель:\n${webUrl}`,
        { reply_markup: new InlineKeyboard().text('◀️ В меню', 'main_menu') }
      );
    });
  }

  private getMainMenu(user: any): InlineKeyboard {
    const kb = new InlineKeyboard();

    if (user.role === UserRole.OPERATOR) {
      kb.text('🏧 Отметить сбор', 'collect').row()
        .text('📋 Мои сборы', 'my_collections').row();
    } else {
      kb.text('📥 Ожидают приёма', 'pending_collections').row()
        .text('📋 Все инкассации', 'all_collections').row()
        .text('📊 Отчёты', 'reports').row();
      
      if (user.role === UserRole.ADMIN) {
        kb.text('👥 Пригласить', 'invite_user').row();
      }
      
      kb.text('🌐 Веб-панель', 'web_panel').row();
    }

    kb.text('❓ Помощь', 'help');
    return kb;
  }
}
```

---

## 5. REST API

### 5.1 Endpoints

#### Auth (через Telegram Login Widget)
```
POST   /api/auth/telegram       # Авторизация через Telegram { initData }
GET    /api/auth/me             # Текущий пользователь
POST   /api/auth/refresh        # Обновление токена
```

#### Invites (приглашения)
```
GET    /api/invites             # Список приглашений (admin)
POST   /api/invites             # Создать приглашение { role }
DELETE /api/invites/:id         # Отменить приглашение
```

#### Users
```
GET    /api/users               # Список пользователей (admin)
GET    /api/users/:id           # Получить пользователя
PATCH  /api/users/:id           # Обновить (имя, телефон, статус)
DELETE /api/users/:id           # Деактивировать (soft delete)
```

#### Machines
```
GET    /api/machines            # Список автоматов
POST   /api/machines            # Создать автомат (admin)
GET    /api/machines/:id        # Получить автомат
PATCH  /api/machines/:id        # Обновить автомат (admin)
DELETE /api/machines/:id        # Удалить автомат (admin)
```

#### Создать автомат
```http
POST /api/machines
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "abc123f0000",
  "name": "Новый автомат",
  "location": "ул. Навои, 10"
}
```

**Ответ:**
```json
{
  "id": "uuid",
  "code": "abc123f0000",
  "name": "Новый автомат",
  "location": "ул. Навои, 10",
  "isActive": true,
  "createdAt": "2026-01-22T10:00:00Z"
}
```

#### Обновить автомат
```http
PATCH /api/machines/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Обновлённое название",
  "location": "Новый адрес",
  "isActive": false
}
```

#### Collections
```
GET    /api/collections                    # Список инкассаций (с фильтрами)
GET    /api/collections/pending            # Ожидающие приёма
POST   /api/collections                    # Создать (для бота)
POST   /api/collections/bulk               # Массовое создание (исторические данные)
POST   /api/collections/import             # Импорт из Excel
GET    /api/collections/:id                # Получить инкассацию
GET    /api/collections/:id/history        # История изменений
PATCH  /api/collections/:id/receive        # Принять и ввести сумму (менеджер)
PATCH  /api/collections/:id/edit           # Редактировать принятую (исправление ошибок)
PATCH  /api/collections/:id/cancel         # Отменить
```

#### Reports
```
GET    /api/reports/summary                # Общая сводка
GET    /api/reports/by-machine             # По автоматам
GET    /api/reports/by-date                # По датам
GET    /api/reports/by-operator            # По операторам
GET    /api/reports/export                 # Экспорт в Excel
```

### 5.2 Примеры запросов/ответов

#### Получить ожидающие приёма
```http
GET /api/collections/pending
Authorization: Bearer <token>
```

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "machine": {
        "id": "...",
        "code": "5b7b181f0000",
        "name": "Кардиология КПП"
      },
      "operator": {
        "id": "...",
        "name": "Алишер"
      },
      "collectedAt": "2026-01-22T09:35:47.000Z",
      "collectedAtLocal": "2026-01-22T14:35:47+05:00",
      "status": "collected"
    }
  ],
  "total": 5
}
```

#### Принять инкассацию
```http
PATCH /api/collections/550e8400-e29b-41d4-a716-446655440000/receive
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 850000,
  "notes": "Всё в порядке"
}
```

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "machine": {
    "code": "5b7b181f0000",
    "name": "Кардиология КПП"
  },
  "operator": {
    "name": "Алишер"
  },
  "manager": {
    "name": "Менеджер"
  },
  "collectedAt": "2026-01-22T14:35:00Z",
  "receivedAt": "2026-01-22T16:20:00Z",
  "amount": 850000,
  "status": "received"
}
```

#### Отчёт по автоматам
```http
GET /api/reports/by-machine?from=2026-01-01&to=2026-01-31
Authorization: Bearer <token>
```

```json
{
  "period": {
    "from": "2026-01-01",
    "to": "2026-01-31"
  },
  "data": [
    {
      "machine": {
        "code": "5b7b181f0000",
        "name": "Кардиология КПП"
      },
      "collectionsCount": 12,
      "totalAmount": 4250000,
      "averageAmount": 354166.67
    },
    {
      "machine": {
        "code": "a7ca181f0000",
        "name": "KIUT CLINIC"
      },
      "collectionsCount": 8,
      "totalAmount": 2100000,
      "averageAmount": 262500
    }
  ],
  "totals": {
    "collectionsCount": 20,
    "totalAmount": 6350000
  }
}
```

---

## 6. Web Frontend (Менеджер/Admin)

### 6.1 Страницы

```
/login                    # Авторизация
/dashboard                # Главная с виджетами
/collections              # Список всех инкассаций
/collections/pending      # Ожидающие приёма
/collections/history      # Ввод исторических данных (выбор режима)
/collections/history/by-machine   # Ввод по машине
/collections/history/by-date      # Ввод по дате
/reports                  # Отчёты
/reports/by-machine       # Отчёт по автоматам
/reports/by-date          # Отчёт по датам
/machines                 # Справочник автоматов (admin)
/users                    # Пользователи (admin)
```

### 6.2 Главный экран (Dashboard)

```
┌─────────────────────────────────────────────────────────────────┐
│  VendCash                                    👤 Менеджер  [⚙️]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ⏳ Ожидают  │  │ 💰 Сегодня  │  │ 📅 Месяц    │             │
│  │     5       │  │ 1,250,000   │  │ 18,500,000  │             │
│  │   приёма    │  │    сум      │  │    сум      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ⏳ Ожидают приёма                          [Принять все]│   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  14:35:47  [5b7b...] Кардиология КПП  Алишер [Принять]  │   │
│  │  15:20:12  [a7ca...] KIUT CLINIC      Бахром [Принять]  │   │
│  │  15:45:03  [1dce...] KIMYO            Алишер [Принять]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📊 Последние инкассации                                │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  22.01 13:10:22  [3266...] American Hosp. ✅ 450,000    │   │
│  │  22.01 11:30:45  [5b7b...] Кардиология    ✅ 380,000    │   │
│  │  21.01 17:45:08  [c7a6...] DUNYO          ✅ 520,000    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Модальное окно приёма инкассации

```
┌───────────────────────────────────────┐
│  Приём инкассации              [✕]   │
├───────────────────────────────────────┤
│                                       │
│  🏧 Автомат: 5b7b181f0000             │
│     Кардиология КПП                   │
│  👷 Оператор: Алишер                  │
│  ⏰ Время сбора: 22.01.2026 14:35:47  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ Сумма (сум):                    │  │
│  │ ┌─────────────────────────────┐ │  │
│  │ │ 850000                      │ │  │
│  │ └─────────────────────────────┘ │  │
│  │ = 850 000 сум                   │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ Примечание (опционально):       │  │
│  │ ┌─────────────────────────────┐ │  │
│  │ │                             │ │  │
│  │ └─────────────────────────────┘ │  │
│  └─────────────────────────────────┘  │
│                                       │
│         [Отмена]    [✅ Принять]      │
│                                       │
└───────────────────────────────────────┘
```

### 6.4 Страница отчётов

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Отчёты                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Период: [01.01.2026] — [31.01.2026]  [Применить]  [📥 Excel]   │
│                                                                 │
│  ┌───────────┬───────────┬───────────┐                         │
│  │ По автом. │ По датам  │ По операт.│                         │
│  └───────────┴───────────┴───────────┘                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Код          │ Название         │ Кол-во │ Сумма  │Сред.│   │
│  ├──────────────┼──────────────────┼────────┼────────┼─────┤   │
│  │ 5b7b181f0000 │ Кардиология КПП  │   12   │ 4,250K │354K │   │
│  │ a7ca181f0000 │ KIUT CLINIC      │    8   │ 2,100K │262K │   │
│  │ 3266181f0000 │ American Hosp.   │   10   │ 3,800K │380K │   │
│  │ 1dce181f0000 │ KIMYO            │    6   │ 1,450K │241K │   │
│  ├──────────────┼──────────────────┼────────┼────────┼─────┤   │
│  │              │ ИТОГО            │   36   │11,600K │322K │   │
│  └──────────────┴──────────────────┴────────┴────────┴─────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.5 Страница управления автоматами (Admin)

```
┌─────────────────────────────────────────────────────────────────┐
│  🏧 Автоматы                                   [+ Добавить]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Поиск: [________________]     Статус: [Все ▼]                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Код          │ Название         │ Адрес      │ Статус │ │   │
│  ├──────────────┼──────────────────┼────────────┼────────┼─┤   │
│  │ 5b7b181f0000 │ Кардиология КПП  │ ул. Осиё..│ ✅ Акт │✏️│   │
│  │ 6620191f0000 │ Кардиология 2    │ ул. Осиё..│ ✅ Акт │✏️│   │
│  │ a7ca181f0000 │ KIUT CLINIC      │ ул. Лабз..│ ✅ Акт │✏️│   │
│  │ 3266181f0000 │ American Hospital│ ул. Афро..│ ✅ Акт │✏️│   │
│  │ 4f9c181f0000 │ Grand clinic     │ —         │ ✅ Акт │✏️│   │
│  │ ...          │ ...              │ ...       │ ...    │✏️│   │
│  └──────────────┴──────────────────┴────────────┴────────┴─┘   │
│                                                                 │
│  Показано 13 из 13                          [<] 1 [>]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.6 Модальное окно добавления/редактирования автомата

```
┌───────────────────────────────────────┐
│  🏧 Добавить автомат           [✕]   │
│  🏧 Редактировать автомат      [✕]   │  ← заголовок меняется
├───────────────────────────────────────┤
│                                       │
│  Серийный номер (код): *              │
│  ┌─────────────────────────────────┐  │
│  │ 5b7b181f0000                    │  │
│  └─────────────────────────────────┘  │
│  💡 Уникальный идентификатор автомата │
│                                       │
│  Название: *                          │
│  ┌─────────────────────────────────┐  │
│  │ Кардиология КПП                 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Адрес/Локация:                       │
│  ┌─────────────────────────────────┐  │
│  │ ул. Осиё, 4. Вход с торца       │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Статус:                              │
│  ┌─────────────────────────────────┐  │
│  │ ● Активен  ○ Неактивен          │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ───────────────────────────────────  │
│                                       │
│       [Отмена]    [💾 Сохранить]      │
│                                       │
└───────────────────────────────────────┘
```

---

### 6.7 Страница управления пользователями (Admin)

```
┌─────────────────────────────────────────────────────────────────┐
│  👥 Сотрудники                                 [+ Пригласить]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Поиск: [________________]     Роль: [Все ▼]                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Имя          │ Роль      │ Telegram  │ Статус  │        │   │
│  ├──────────────┼───────────┼───────────┼─────────┼────────┤   │
│  │ Администратор│ 👑 Admin  │ @admin    │ ✅ Акт  │ [✏️]   │   │
│  │ Алишер       │ 👷 Операт.│ @alisher  │ ✅ Акт  │ [✏️]   │   │
│  │ Бахром       │ 👷 Операт.│ @bakhrom  │ ✅ Акт  │ [✏️]   │   │
│  │ Менеджер     │ 📊 Менедж.│ @manager  │ ✅ Акт  │ [✏️]   │   │
│  └──────────────┴───────────┴───────────┴─────────┴────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📨 Ожидающие приглашения:                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Роль       │ Создано     │ Истекает    │                │   │
│  ├────────────┼─────────────┼─────────────┼────────────────┤   │
│  │ 👷 Оператор│ 22.01 10:30 │ 23.01 10:30 │ [📋] [🗑️]     │   │
│  └────────────┴─────────────┴─────────────┴────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.8 Модальное окно приглашения

```
┌───────────────────────────────────────┐
│  📨 Пригласить сотрудника      [✕]   │
├───────────────────────────────────────┤
│                                       │
│  Выберите роль:                       │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ○ 👷 Оператор                   │  │
│  │   Отмечает сбор в Telegram      │  │
│  │                                 │  │
│  │ ● 📊 Менеджер                   │  │
│  │   Принимает инкассации,         │  │
│  │   просматривает отчёты          │  │
│  └─────────────────────────────────┘  │
│                                       │
│       [Отмена]    [📨 Создать ссылку] │
│                                       │
└───────────────────────────────────────┘

           ↓ После нажатия

┌───────────────────────────────────────┐
│  ✅ Ссылка создана!            [✕]   │
├───────────────────────────────────────┤
│                                       │
│  Отправьте эту ссылку сотруднику:     │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ t.me/VendCashBot?start=inv_x7k9 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  [📋 Копировать]                      │
│                                       │
│  ⏰ Ссылка действует 24 часа          │
│                                       │
│  После перехода по ссылке сотрудник   │
│  автоматически зарегистрируется       │
│  с ролью: Менеджер                    │
│                                       │
│                        [Готово]       │
│                                       │
└───────────────────────────────────────┘
```

### 6.9 Модальное окно редактирования пользователя

```
┌───────────────────────────────────────┐
│  ✏️ Редактировать сотрудника   [✕]   │
├───────────────────────────────────────┤
│                                       │
│  👤 Telegram: @alisher                │
│  🎭 Роль: Оператор (изменить нельзя)  │
│                                       │
│  Имя:                                 │
│  ┌─────────────────────────────────┐  │
│  │ Алишер Каримов                  │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Телефон:                             │
│  ┌─────────────────────────────────┐  │
│  │ +998 90 123 45 67               │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Статус:                              │
│  ┌─────────────────────────────────┐  │
│  │ ● Активен  ○ Деактивирован      │  │
│  └─────────────────────────────────┘  │
│                                       │
│       [Отмена]    [💾 Сохранить]      │
│                                       │
└───────────────────────────────────────┘
```

---

---

## 7. Ввод исторических данных

### 7.1 Назначение

Функционал для удобного ввода данных за прошлые периоды:
- Миграция из Excel/бумажных журналов
- Ввод пропущенных записей
- Корректировка данных

### 7.2 Два режима ввода

#### Режим A: По машине (вертикальный ввод)
> *"Выбрал автомат — ввожу все его инкассации"*

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Ввод истории: по машине                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🏧 Автомат: [5b7b181f0000 - Кардиология КПП    ▼]             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Дата и время          │  Сумма (сум)   │  Действие     │   │
│  ├────────────────────────┼────────────────┼───────────────┤   │
│  │  [15.01.2026] [14:30]  │  [450,000    ] │  [🗑️]         │   │
│  │  [18.01.2026] [11:15]  │  [380,000    ] │  [🗑️]         │   │
│  │  [21.01.2026] [16:45]  │  [520,000    ] │  [🗑️]         │   │
│  │  [__.__.____] [__:__]  │  [           ] │               │   │  ← auto-focus
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Добавить строку]                                           │
│                                                                 │
│  💡 Enter — перейти к следующему полю / добавить строку        │
│  💡 Tab — навигация между полями                                │
│                                                                 │
│  ──────────────────────────────────────────────────────────    │
│  Итого: 3 записи на сумму 1,350,000 сум                        │
│                                                                 │
│            [Отмена]    [💾 Сохранить всё]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**UX-особенности:**
- После ввода суммы и Enter → автоматически добавляется новая строка
- Дата по умолчанию = предыдущая дата (часто инкассации идут подряд по дням)
- Время по умолчанию = 12:00:00 (можно изменить)
- Валидация: нельзя ввести будущую дату
- Можно вставить данные из Excel (Ctrl+V парсит таблицу)

---

#### Режим B: По дате (горизонтальный ввод)
> *"Выбрал дату — ввожу все машины за этот день"*

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Ввод истории: по дате                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📅 Дата: [15.01.2026]    ⏰ Время по умолчанию: [14:00]        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Автомат                    │  Время   │  Сумма (сум)   │   │
│  ├─────────────────────────────┼──────────┼────────────────┤   │
│  │  [5b7b... Кардиология   ▼]  │  [14:30] │  [450,000    ] │   │
│  │  [a7ca... KIUT CLINIC   ▼]  │  [14:35] │  [380,000    ] │   │
│  │  [1dce... KIMYO         ▼]  │  [15:10] │  [290,000    ] │   │
│  │  [Выберите автомат      ▼]  │  [     ] │  [           ] │   │  ← auto-focus
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Добавить строку]                                           │
│                                                                 │
│  💡 Уже введённые автоматы скрыты из списка                    │
│  💡 Время автоинкремент: +5 минут от предыдущего               │
│                                                                 │
│  ──────────────────────────────────────────────────────────    │
│  Итого: 3 записи на сумму 1,120,000 сум                        │
│                                                                 │
│            [Отмена]    [💾 Сохранить всё]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**UX-особенности:**
- Автомат, уже добавленный на эту дату, скрывается из dropdown
- Время автоматически +5 минут от предыдущей строки
- Можно задать "время по умолчанию" для всех строк
- Быстрый выбор автомата по коду (набрал "A01" → выбран)

---

### 7.3 Страница выбора режима

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Ввод исторических данных                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Выберите удобный режим ввода:                                  │
│                                                                 │
│  ┌───────────────────────────┐  ┌───────────────────────────┐  │
│  │                           │  │                           │  │
│  │  🏧 ПО МАШИНЕ             │  │  📅 ПО ДАТЕ               │  │
│  │                           │  │                           │  │
│  │  Выбираете автомат,       │  │  Выбираете дату,          │  │
│  │  вводите даты и суммы     │  │  вводите автоматы и суммы │  │
│  │                           │  │                           │  │
│  │  Удобно когда:            │  │  Удобно когда:            │  │
│  │  • Вводите историю        │  │  • Вводите данные         │  │
│  │    одного автомата        │  │    за конкретный день     │  │
│  │  • Данные сгруппированы   │  │  • Есть ежедневный        │  │
│  │    по автоматам           │  │    журнал инкассаций      │  │
│  │                           │  │                           │  │
│  │        [Выбрать]          │  │        [Выбрать]          │  │
│  └───────────────────────────┘  └───────────────────────────┘  │
│                                                                 │
│  ──────────────────────────────────────────────────────────    │
│                                                                 │
│  📋 Импорт из Excel                                            │
│  Загрузите файл с колонками: Код автомата, Дата, Время, Сумма  │
│  [📁 Выбрать файл...]                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7.4 API для исторических данных

#### Массовое создание инкассаций
```http
POST /api/collections/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "collections": [
    {
      "machineId": "uuid-1",
      "collectedAt": "2026-01-15T09:30:00.000Z",
      "amount": 450000,
      "notes": "Исторические данные"
    },
    {
      "machineId": "uuid-1",
      "collectedAt": "2026-01-18T06:15:00.000Z",
      "amount": 380000
    },
    {
      "machineId": "uuid-2",
      "collectedAt": "2026-01-15T09:35:00.000Z",
      "amount": 290000
    }
  ],
  "source": "manual_history"  // или "excel_import"
}
```

**Ответ:**
```json
{
  "created": 3,
  "failed": 0,
  "errors": [],
  "collections": [
    { "id": "uuid-new-1", "machineCode": "A01", "collectedAt": "...", "amount": 450000 },
    { "id": "uuid-new-2", "machineCode": "A01", "collectedAt": "...", "amount": 380000 },
    { "id": "uuid-new-3", "machineCode": "A02", "collectedAt": "...", "amount": 290000 }
  ]
}
```

#### Импорт из Excel
```http
POST /api/collections/import
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: [Excel файл]
```

**Формат Excel:**
| Код автомата | Дата | Время | Сумма | Примечание |
|--------------|------|-------|-------|------------|
| 5b7b181f0000 | 15.01.2026 | 14:30 | 450000 | |
| a7ca181f0000 | 15.01.2026 | 14:35 | 380000 | |
| 5b7b181f0000 | 18.01.2026 | 11:15 | 520000 | Праздничный день |

---

### 7.5 Валидация исторических данных

| Правило | Действие |
|---------|----------|
| Дата в будущем | ❌ Ошибка |
| Дата > 2 лет назад | ⚠️ Предупреждение |
| Дубликат (машина + дата ± 1 час) | ⚠️ Предупреждение с возможностью продолжить |
| Сумма = 0 | ⚠️ Предупреждение |
| Сумма отрицательная | ❌ Ошибка |
| Несуществующий код автомата | ❌ Ошибка |

---

## 8. Дополнительные функции

### 8.1 Защита от дублей

При создании инкассации через бота — проверка:
- Если для этого автомата уже есть сбор за последние 30 минут → предупреждение

```
⚠️ Внимание!
Для этого автомата уже есть сбор в 14:05.
Вы уверены, что хотите создать ещё один?

[Да, создать] [Отмена]
```

### 8.2 Редактирование принятой инкассации

Менеджер/Admin может исправить сумму уже принятой инкассации (ошибка при вводе):

```
┌───────────────────────────────────────┐
│  ✏️ Редактировать инкассацию   [✕]   │
├───────────────────────────────────────┤
│                                       │
│  🏧 5b7b181f0000 - Кардиология КПП    │
│  ⏰ Сбор: 22.01.2026 14:35:47         │
│  👷 Оператор: Алишер                  │
│  ✅ Принято: 22.01.2026 16:20:00      │
│                                       │
│  Текущая сумма: 850,000 сум           │
│                                       │
│  Новая сумма: *                       │
│  ┌─────────────────────────────────┐  │
│  │ 805000                          │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Причина изменения: *                 │
│  ┌─────────────────────────────────┐  │
│  │ Ошибка при вводе, было 805 тыс  │  │
│  └─────────────────────────────────┘  │
│                                       │
│       [Отмена]    [💾 Сохранить]      │
│                                       │
└───────────────────────────────────────┘
```

### 8.3 История изменений (Audit Log)

Добавить таблицу для отслеживания изменений:

```sql
CREATE TABLE collection_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id),
    changed_by UUID NOT NULL REFERENCES users(id),
    field_name VARCHAR(50) NOT NULL,      -- 'amount', 'status', etc.
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.4 Пагинация и фильтры

**Все списки поддерживают:**
- Пагинация: `?page=1&limit=20`
- Сортировка: `?sortBy=collectedAt&sortOrder=desc`

**Фильтры для инкассаций:**
- По статусу: `?status=collected|received|cancelled`
- По автомату: `?machineId=uuid`
- По оператору: `?operatorId=uuid`
- По периоду: `?from=2026-01-01&to=2026-01-31`
- По источнику: `?source=realtime|manual_history|excel_import`

### 8.5 Смена пароля

Для менеджеров и админов в настройках профиля:

```
GET  /api/auth/me                    # Текущий профиль
PATCH /api/auth/change-password      # { currentPassword, newPassword }
```

### 8.6 Soft Delete

Автоматы и пользователи не удаляются физически:
- `is_active = false` вместо DELETE
- В списках по умолчанию показываются только активные
- Admin может видеть неактивные через фильтр

### 8.7 Подтверждение опасных действий

Перед удалением/деактивацией показывать:

```
⚠️ Деактивировать автомат?

Автомат "Кардиология КПП" будет скрыт из списка выбора.
Существующие инкассации сохранятся.

[Отмена] [Деактивировать]
```

### 8.8 Уведомления в боте

После приёма инкассации менеджером — уведомление оператору (опционально):

```
✅ Ваш сбор принят!

🏧 Кардиология КПП
⏰ Сбор: 14:35:47
💰 Сумма: 850,000 сум
👔 Принял: Менеджер
```

---

## 9. Подготовка к интеграции с VHM24

### 9.1 Поля для синхронизации

В таблицах уже заложены поля:
- `machines.vhm24_id` — ID автомата в VHM24
- `machines.vhm24_synced_at` — дата последней синхронизации

### 9.2 Будущий API для интеграции

```
POST   /api/integration/vhm24/sync-machines    # Синхронизация автоматов
POST   /api/integration/vhm24/export           # Экспорт инкассаций в VHM24
GET    /api/integration/vhm24/status           # Статус интеграции
```

### 9.3 Сценарии интеграции

1. **Импорт автоматов** — подтянуть справочник из VHM24
2. **Экспорт инкассаций** — отправлять данные в VHM24 для финансового учёта
3. **Сверка с продажами** — будет добавлена позже, когда появится функция ввода продаж

---

## 10. Начальные данные (Seed)

### 10.1 Первый администратор

Создаётся при первом запуске через переменную окружения:

```env
# Telegram ID первого админа (обязательно!)
ADMIN_TELEGRAM_ID=123456789
ADMIN_NAME=Администратор
```

```typescript
// seed.ts
const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
if (!adminTelegramId) {
  throw new Error('ADMIN_TELEGRAM_ID is required for first run');
}

await usersRepository.save({
  telegramId: parseInt(adminTelegramId),
  name: process.env.ADMIN_NAME || 'Администратор',
  role: UserRole.ADMIN,
  isActive: true,
});
```

> 💡 Чтобы узнать свой Telegram ID, напишите боту @userinfobot

### 10.2 Автоматы
```typescript
[
  { code: '5b7b181f0000', name: 'Кардиология КПП' },
  { code: '6620191f0000', name: 'Кардиология 2 корпус' },
  { code: 'a7ca181f0000', name: 'KIUT CLINIC' },
  { code: '3266181f0000', name: 'American Hospital' },
  { code: '4f9c181f0000', name: 'Grand clinic' },
  { code: '72ac181f0000', name: 'Soliq Yashnobod' },
  { code: '9457181f0000', name: 'KIUT M corp' },
  { code: '2c67181f0000', name: 'SOLIQ OLMAZOR' },
  { code: '1dce181f0000', name: 'KIMYO' },
  { code: '24a8181f0000', name: 'Parus F4' },
  { code: '4eaf181f0000', name: 'Parus F1' },
  { code: 'c7a6181f0000', name: 'DUNYO Supermarket' },
  { code: '17b7181f0000', name: 'ZIYO market' },
]
```

---

## 11. План реализации

### Фаза 1: Backend (4-5 дней)
| Задача | Время |
|--------|-------|
| Инициализация проекта, Docker setup | 2ч |
| База данных, миграции, seed | 3ч |
| Модуль Users + Auth (включая смену пароля) | 4ч |
| Модуль Machines (CRUD + soft delete) | 3ч |
| Модуль Collections (CRUD + receive + edit) | 5ч |
| Collection History (audit log) | 2ч |
| API для bulk/import (исторические данные) | 3ч |
| Модуль Reports | 4ч |
| Пагинация и фильтры | 2ч |
| Тестирование API | 3ч |

### Фаза 2: Telegram Bot (2 дня)
| Задача | Время |
|--------|-------|
| Базовая структура бота | 2ч |
| Авторизация операторов | 2ч |
| Flow выбора автомата | 3ч |
| Подтверждение сбора + защита от дублей | 3ч |
| Просмотр своих сборов | 2ч |
| Уведомления о приёме (опционально) | 2ч |
| Тестирование | 2ч |

### Фаза 3: Web Frontend (5-6 дней)
| Задача | Время |
|--------|-------|
| Инициализация React + Tailwind | 1ч |
| Авторизация + смена пароля | 3ч |
| Dashboard | 4ч |
| Страница приёма инкассаций | 4ч |
| Редактирование принятых инкассаций | 2ч |
| Страницы отчётов с экспортом | 6ч |
| Ввод истории: по машине | 4ч |
| Ввод истории: по дате | 4ч |
| Импорт из Excel | 3ч |
| Admin: автоматы (CRUD) | 4ч |
| Admin: пользователи (CRUD) | 4ч |
| Подтверждения опасных действий | 1ч |
| Тестирование | 3ч |

### Фаза 4: Deploy & Testing (1-2 дня)
| Задача | Время |
|--------|-------|
| Docker compose для production | 2ч |
| Deploy на Hetzner | 2ч |
| Настройка домена и HTTPS | 2ч |
| Интеграционное тестирование | 3ч |
| Документация | 2ч |

**Итого: ~14-16 дней**

---

## 12. Конфигурация

### .env пример
```env
# App
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=vendcash
DB_PASSWORD=secure_password
DB_DATABASE=vendcash

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# First Admin (required for first run!)
ADMIN_TELEGRAM_ID=123456789
ADMIN_NAME=Администратор

# Frontend URL (для CORS и Telegram Login Widget)
FRONTEND_URL=https://cash.example.com
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: vendcash
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: vendcash
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
    depends_on:
      - postgres
    ports:
      - "3000:3000"

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
```

---

## 13. Следующие шаги

1. ✅ Утвердить спецификацию
2. ⏳ Создать репозиторий `vendcash`
3. ⏳ Начать с Фазы 1 (Backend)
4. ⏳ Параллельно — дизайн UI в Figma (опционально)

---

*Документ создан: 22.01.2026*
*Версия: 1.0*
