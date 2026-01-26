# Промпт для исправления VendCashBot (FINAL)

## Контекст

Ты — опытный full-stack разработчик. Тебе нужно исправить все проблемы, найденные в аудите финансовой системы VendCashBot.

**Стек:** NestJS + TypeORM + PostgreSQL + grammY (backend), React + Zustand + Tailwind (frontend)
**Критичность:** 🔴 Финансовая система — требует повышенной надёжности

---

## SPRINT 0: КРИТИЧЕСКИЕ БЛОКЕРЫ (до релиза)

### 🔴 #1: Удалить exposed secrets из репозитория

**Проблема:** Реальный Telegram bot token находится в `.env` файлах в git history.

**Действия:**
```bash
# 1. Revoke старый токен через @BotFather в Telegram
# 2. Получить новый токен

# 3. Удалить .env из git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env backend/.env' \
  --prune-empty --tag-name-filter cat -- --all

# Или использовать BFG Repo-Cleaner (быстрее):
# bfg --delete-files .env

# 4. Force push (ОСТОРОЖНО!)
git push origin --force --all

# 5. Настроить environment variables в Railway/production
```

**Проверить `.gitignore`:**
```gitignore
# Secrets
.env
.env.local
.env.*.local
backend/.env
frontend/.env
```

---

### 🔴 #2: Добавить audit logging для receive()

**Проблема:** Метод `receive()` в `collections.service.ts` не создаёт запись в `collection_history`, хотя это ключевая финансовая операция.

**Файл:** `backend/src/modules/collections/collections.service.ts`

**Найти метод `receive()` (примерно строка 233) и добавить создание history записи:**

```typescript
async receive(id: string, managerId: string, dto: ReceiveCollectionDto): Promise<Collection> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const collection = await queryRunner.manager.findOne(Collection, {
      where: { id },
      relations: ['machine', 'operator', 'manager'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    if (collection.status !== CollectionStatus.COLLECTED) {
      throw new BadRequestException('Collection is not in collected status');
    }

    // Сохраняем старые значения для audit
    const oldStatus = collection.status;
    const oldAmount = collection.amount;

    // Обновляем коллекцию
    collection.managerId = managerId;
    collection.amount = dto.amount;
    collection.status = CollectionStatus.RECEIVED;
    collection.receivedAt = new Date();
    if (dto.notes) {
      collection.notes = dto.notes;
    }

    await queryRunner.manager.save(collection);

    // ✅ ДОБАВИТЬ: Создаём audit record для receive
    const historyStatus = queryRunner.manager.create(CollectionHistory, {
      collectionId: id,
      changedById: managerId,
      fieldName: 'status',
      oldValue: oldStatus,
      newValue: CollectionStatus.RECEIVED,
      reason: 'Collection received by manager',
    });
    await queryRunner.manager.save(historyStatus);

    const historyAmount = queryRunner.manager.create(CollectionHistory, {
      collectionId: id,
      changedById: managerId,
      fieldName: 'amount',
      oldValue: oldAmount?.toString() || null,
      newValue: dto.amount.toString(),
      reason: 'Initial amount set on receive',
    });
    await queryRunner.manager.save(historyAmount);

    await queryRunner.commitTransaction();

    // Загружаем полную коллекцию с relations
    return this.findByIdOrFail(id);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

---

## SPRINT 1: HIGH PRIORITY

### 🟠 #3: JWT secret length validation

**Файл:** `backend/src/config/configuration.ts`

**Найти секцию jwt и добавить валидацию:**

```typescript
// В функции validate() или в начале конфигурации:
const jwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long for security');
  }
}

// В конфигурации jwt:
jwt: {
  secret: jwtSecret || 'dev-only-secret-do-not-use-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
},
```

---

### 🟠 #4: Telegram bot rate limiting

**Файл:** `backend/src/telegram/telegram.service.ts`

**Установить пакет:**
```bash
cd backend && npm install @grammyjs/ratelimiter
```

**Добавить middleware:**

```typescript
import { limit } from '@grammyjs/ratelimiter';

// В методе onModuleInit() после создания бота:
async onModuleInit() {
  this.bot = new Bot(this.configService.get('telegram.botToken'));

  // ✅ ДОБАВИТЬ: Rate limiting
  this.bot.use(limit({
    // Максимум 3 сообщения за 2 секунды
    timeFrame: 2000,
    limit: 3,
    // Кастомный обработчик при превышении лимита
    onLimitExceeded: async (ctx) => {
      await ctx.reply('⏳ Слишком много запросов. Подождите немного.');
    },
    // Ключ для rate limiting (по пользователю)
    keyGenerator: (ctx) => ctx.from?.id.toString() || 'anonymous',
  }));

  // ... остальная инициализация
}
```

---

### 🟠 #5: Уведомления менеджерам о новых инкассациях

**Файл:** `backend/src/modules/collections/collections.service.ts`

**Добавить инъекцию TelegramService и отправку уведомлений:**

```typescript
// В конструкторе добавить:
constructor(
  // ... существующие зависимости
  @Inject(forwardRef(() => TelegramService))
  private readonly telegramService: TelegramService,
) {}

// В методе create() после сохранения коллекции добавить:
async create(dto: CreateCollectionDto, operatorId: string): Promise<Collection> {
  // ... существующий код создания ...

  const saved = await this.collectionRepository.save(collection);

  // ✅ ДОБАВИТЬ: Уведомить менеджеров
  try {
    await this.notifyManagersAboutNewCollection(saved);
  } catch (error) {
    // Логируем ошибку, но не прерываем операцию
    this.logger.warn(`Failed to notify managers: ${error.message}`);
  }

  return this.findByIdOrFail(saved.id);
}

// Новый приватный метод:
private async notifyManagersAboutNewCollection(collection: Collection): Promise<void> {
  // Получаем всех активных менеджеров и админов
  const managers = await this.dataSource.getRepository(User).find({
    where: [
      { role: UserRole.MANAGER, isActive: true },
      { role: UserRole.ADMIN, isActive: true },
    ],
  });

  const message = `🆕 Новая инкассация!\n\n` +
    `📍 Автомат: ${collection.machine?.name || 'N/A'}\n` +
    `👤 Оператор: ${collection.operator?.name || 'N/A'}\n` +
    `🕐 Время: ${collection.collectedAt.toLocaleString('ru-RU')}\n\n` +
    `Ожидает приёма в системе.`;

  for (const manager of managers) {
    if (manager.telegramId) {
      try {
        await this.telegramService.sendMessage(manager.telegramId, message);
      } catch (error) {
        this.logger.warn(`Failed to notify manager ${manager.id}: ${error.message}`);
      }
    }
  }
}
```

**В TelegramService добавить публичный метод:**

```typescript
// backend/src/telegram/telegram.service.ts
async sendMessage(telegramId: number | string, text: string): Promise<void> {
  try {
    await this.bot.api.sendMessage(telegramId, text, { parse_mode: 'HTML' });
  } catch (error) {
    this.logger.error(`Failed to send message to ${telegramId}: ${error.message}`);
    throw error;
  }
}
```

---

### 🟠 #6: Заменить xlsx на exceljs во frontend

**Проблема:** Библиотека `xlsx` имеет уязвимости (prototype pollution, ReDoS).

**Действия:**
```bash
cd frontend
npm uninstall xlsx
npm install exceljs
```

**Обновить `frontend/src/pages/ExcelImport.tsx`:**

```typescript
import ExcelJS from 'exceljs';

// Заменить функцию парсинга:
const parseExcelFile = async (file: File): Promise<any[]> => {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No worksheet found');
  }

  const data: any[] = [];
  const headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      // Заголовки
      row.eachCell((cell) => {
        headers.push(cell.value?.toString() || '');
      });
    } else {
      // Данные
      const rowData: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      data.push(rowData);
    }
  });

  return data;
};
```

---

### 🟠 #7: Добавить @Max валидацию для EditCollectionDto

**Файл:** `backend/src/modules/collections/dto/edit-collection.dto.ts`

```typescript
import { IsNumber, Min, Max, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditCollectionDto {
  @ApiProperty({ description: 'New amount' })
  @IsNumber()
  @Min(0)
  @Max(1000000000) // ✅ ДОБАВИТЬ
  amount: number;

  @ApiProperty({ description: 'Reason for edit', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}
```

**Также исправить `bulk-create-collection.dto.ts`:**

```typescript
// В классе BulkCollectionItemDto:
@ApiProperty({ description: 'Amount', required: false })
@IsNumber()
@Min(0)
@Max(1000000000) // ✅ ДОБАВИТЬ
@IsOptional()
amount?: number;
```

---

## SPRINT 2: MEDIUM PRIORITY

### 🟡 #8: Использовать string для DECIMAL в TypeScript

**Проблема:** PostgreSQL возвращает DECIMAL как string, но TypeScript ожидает number, что может привести к потере точности при parseFloat.

**Файл:** `backend/src/modules/collections/entities/collection.entity.ts`

```typescript
// Изменить тип amount:
@Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
amount: string | null; // Было: number
```

**Обновить DTOs для приёма number и конвертации:**

```typescript
// receive-collection.dto.ts
@IsNumber()
@Min(0)
@Max(1000000000)
@Transform(({ value }) => value.toString()) // Конвертируем в string
amount: string;
```

**Обновить reports.service.ts:**

```typescript
// Вместо parseFloat использовать безопасное сложение через библиотеку или BigInt
// Или оставить parseFloat но с проверкой:
const totalAmount = result.totalAmount ? parseFloat(result.totalAmount) : 0;
// Для отображения использовать toFixed(2)
```

---

### 🟡 #9: Добавить транзакцию в create() для atomic duplicate check

**Файл:** `backend/src/modules/collections/collections.service.ts`

```typescript
async create(dto: CreateCollectionDto, operatorId: string): Promise<Collection> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Проверка дубликатов внутри транзакции
    if (!dto.skipDuplicateCheck) {
      const windowMs = this.duplicateCheckMinutes * 60 * 1000;
      const windowBefore = new Date(dto.collectedAt.getTime() - windowMs);
      const windowAfter = new Date(dto.collectedAt.getTime() + windowMs);

      const duplicate = await queryRunner.manager.findOne(Collection, {
        where: {
          machineId: dto.machineId,
          collectedAt: Between(windowBefore, windowAfter),
          status: CollectionStatus.COLLECTED,
        },
        lock: { mode: 'pessimistic_read' }, // Блокировка для предотвращения race condition
      });

      if (duplicate) {
        throw new BadRequestException(
          `Duplicate collection found within ${this.duplicateCheckMinutes} minutes`,
        );
      }
    }

    // Создание коллекции
    const collection = queryRunner.manager.create(Collection, {
      machineId: dto.machineId,
      operatorId,
      collectedAt: dto.collectedAt,
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes,
      source: dto.source || CollectionSource.REALTIME,
      status: CollectionStatus.COLLECTED,
    });

    const saved = await queryRunner.manager.save(collection);
    await queryRunner.commitTransaction();

    // Уведомления вне транзакции
    try {
      await this.notifyManagersAboutNewCollection(saved);
    } catch (error) {
      this.logger.warn(`Failed to notify managers: ${error.message}`);
    }

    return this.findByIdOrFail(saved.id);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

---

### 🟡 #10: Ограничить health endpoint

**Файл:** `backend/src/health/health.controller.ts`

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  // Публичный liveness probe (для Kubernetes/Docker)
  @Get('live')
  @Public()
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Детальный health check только для админов
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ]);
  }
}
```

---

### 🟡 #11: IDOR защита для операторов

**Файл:** `backend/src/modules/collections/collections.controller.ts`

```typescript
@Get(':id')
@ApiOperation({ summary: 'Get collection by ID' })
async findOne(@Param('id') id: string, @CurrentUser() user: User) {
  const collection = await this.collectionsService.findByIdOrFail(id);

  // Операторы могут видеть только свои инкассации
  if (user.role === UserRole.OPERATOR && collection.operatorId !== user.id) {
    throw new ForbiddenException('You can only view your own collections');
  }

  return collection;
}

@Get(':id/history')
@Roles(UserRole.MANAGER, UserRole.ADMIN) // ✅ Добавить ограничение
@ApiOperation({ summary: 'Get collection change history' })
async getHistory(@Param('id') id: string) {
  return this.collectionsService.getHistory(id);
}
```

---

### 🟡 #12: React Error Boundaries

**Создать файл:** `frontend/src/components/ErrorBoundary.tsx`

```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // Здесь можно отправить ошибку в сервис мониторинга (Sentry, etc.)
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Что-то пошло не так
            </h1>
            <p className="text-gray-600 mb-4">
              Произошла непредвиденная ошибка. Пожалуйста, обновите страницу или попробуйте позже.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Обернуть приложение в `frontend/src/main.tsx`:**

```typescript
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

---

### 🟡 #13: Создать backend Dockerfile

**Файл:** `backend/Dockerfile`

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходники
COPY . .

# Собираем приложение
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Создаём non-root пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm ci --only=production && npm cache clean --force

# Копируем собранное приложение
COPY --from=builder /app/dist ./dist

# Меняем владельца файлов
RUN chown -R nestjs:nodejs /app

# Переключаемся на non-root пользователя
USER nestjs

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health/live || exit 1

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

**Создать `backend/.dockerignore`:**

```
node_modules
dist
.git
.env
.env.*
*.log
logs/
coverage/
.nyc_output/
test/
*.md
.eslintrc.js
.prettierrc
tsconfig.build.json
```

---

### 🟡 #14: Добавить request_id для трассировки

**Файл:** `backend/src/modules/collections/entities/collection-history.entity.ts`

```typescript
@Entity('collection_history')
export class CollectionHistory {
  // ... существующие поля ...

  @Column({ name: 'request_id', nullable: true })
  requestId: string;
}
```

**Создать middleware для генерации request_id:**

**Файл:** `backend/src/common/middleware/request-id.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req.requestId = req.headers['x-request-id'] as string || uuidv4();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}
```

**Зарегистрировать в `app.module.ts`:**

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
```

**Создать миграцию:**

```bash
cd backend
npx typeorm migration:create src/migrations/AddRequestIdToHistory
```

```typescript
// В файле миграции:
export class AddRequestIdToHistory1737900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "collection_history"
      ADD COLUMN "request_id" varchar(36)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "collection_history"
      DROP COLUMN "request_id"
    `);
  }
}
```

---

## SPRINT 3: LOW PRIORITY (Backlog)

### 🟢 #15: Создать .dockerignore файлы

**Файл:** `frontend/.dockerignore`

```
node_modules
dist
.git
.env
.env.*
*.log
coverage/
```

**Файл:** `.dockerignore` (root)

```
.git
.github
*.md
.env
.env.*
docs/
```

---

### 🟢 #16: Исправить seed.ts

**Файл:** `backend/src/seed.ts`

```typescript
// Изменить synchronize на false
const dataSource = new DataSource({
  // ... config ...
  synchronize: false, // ✅ Было true
});
```

---

### 🟢 #17: Защитить audit log от TRUNCATE

**Добавить в миграцию `1737700000000-ProtectAuditLog.ts`:**

```sql
-- Отзываем права на TRUNCATE
REVOKE TRUNCATE ON collection_history FROM PUBLIC;
REVOKE TRUNCATE ON collection_history FROM app_user;

-- Или создать trigger:
CREATE OR REPLACE FUNCTION prevent_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is not allowed on this table';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_truncate_collection_history
BEFORE TRUNCATE ON collection_history
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_truncate();
```

---

### 🟢 #18: Обновить зависимости

```bash
cd backend
npm update
npm audit fix

cd ../frontend
npm update
npm audit fix
```

---

## ТЕСТИРОВАНИЕ ПОСЛЕ ИСПРАВЛЕНИЙ

### Checklist

```bash
# 1. Проверить что .env не в репозитории
git status | grep -E "\.env"

# 2. Проверить JWT secret validation
NODE_ENV=production JWT_SECRET=short npm run start # Должна быть ошибка

# 3. Проверить audit logging
# Создать инкассацию -> Принять -> Проверить collection_history

# 4. Запустить тесты
cd backend && npm test
cd frontend && npm test

# 5. Проверить npm audit
cd backend && npm audit
cd frontend && npm audit

# 6. Проверить Docker build
docker build -t vendcash-backend ./backend
docker build -t vendcash-frontend ./frontend

# 7. Проверить rate limiting на боте
# Отправить 10 команд подряд - должно быть ограничение
```

---

## ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **Перед каждым изменением** — создавай backup базы данных
2. **Миграции** — всегда создавай миграции для изменений схемы, не используй synchronize
3. **Тестирование** — после каждого исправления запускай тесты
4. **Git commits** — делай атомарные коммиты с понятными сообщениями
5. **Code review** — критические изменения (auth, финансы) требуют review

---

## GIT COMMIT MESSAGES

```
feat(audit): add collection history for receive operation
fix(security): remove exposed telegram token from repository
fix(security): add JWT secret length validation
feat(telegram): add rate limiting middleware
feat(notifications): notify managers about new collections
fix(deps): replace vulnerable xlsx with exceljs
fix(validation): add @Max decorator to EditCollectionDto
fix(data): use string type for decimal amounts
fix(concurrency): add transaction to create() for atomic duplicate check
feat(security): restrict health endpoint to admins
fix(auth): add IDOR protection for operators
feat(frontend): add React ErrorBoundary component
feat(docker): add backend Dockerfile with non-root user
feat(audit): add request_id for request tracing
```

---

*Этот промпт содержит все исправления из аудита VendCashBot. Выполняй по порядку приоритетов.*
