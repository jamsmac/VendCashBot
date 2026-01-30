# ПРОМТ: Комплексный аудит и исправление VendCash

## Контекст проекта

VendCash — корпоративная система учёта инкассаций вендинговых автоматов. Telegram-бот + веб-панель.

- **Backend:** NestJS 10 + TypeORM 0.3 + PostgreSQL 15 + Redis 7
- **Frontend:** React 18 + Vite + Zustand + Tailwind + React Query
- **Telegram:** grammY 1.21
- **Инфра:** Docker Compose, Railway, Nginx
- **Роли:** operator (сбор денег), manager (приём + ввод суммы), admin (управление)
- **Пользователи:** 10-50 сотрудников, финансовые данные

---

## Инструкции

Выполни **поэтапный, исчерпывающий аудит** каждого модуля, файла и функции проекта VendCash. Для каждой найденной проблемы — **немедленно исправь** её в коде. Не создавай отчёты без исправлений.

**Принципы работы:**
- Читай каждый файл целиком перед анализом
- Исправляй сразу, не откладывай
- Не добавляй лишнего — только то, что решает конкретную проблему
- Сохраняй существующий стиль кода
- После каждого блока исправлений — проверяй компиляцию (`npm run build`)
- Отмечай каждый пункт как выполненный в todo-листе

---

## ЭТАП 1: БЕЗОПАСНОСТЬ (Security Audit)

### 1.1 Аутентификация и авторизация
Проверь и исправь в файлах:
- `backend/src/modules/auth/auth.service.ts` — верификация Telegram hash, генерация JWT, refresh-токены
- `backend/src/modules/auth/auth.controller.ts` — эндпоинты логина/логаута
- `backend/src/modules/auth/jwt.strategy.ts` — JWT стратегия, извлечение токена
- `backend/src/modules/auth/auth-cleanup.service.ts` — очистка протухших токенов
- `backend/src/modules/auth/entities/refresh-token.entity.ts` — модель refresh-токена
- `backend/src/common/guards/jwt-auth.guard.ts` — guard авторизации
- `backend/src/common/guards/roles.guard.ts` — guard ролей
- `backend/src/common/decorators/` — все декораторы (roles, current-user, public)
- `frontend/src/contexts/AuthContext.ts` — хранение токена, логика логина
- `frontend/src/api/client.ts` — axios interceptor, refresh flow

**Что искать:**
- JWT хранится в localStorage? Перевести на httpOnly cookies
- JWT secret валидируется на минимальную длину (>=32)?
- Refresh token rotation работает корректно?
- Все защищённые эндпоинты имеют JwtAuthGuard?
- RolesGuard правильно проверяет роли?
- Dev-login отключён в production?
- Нет утечки sensitive data в ответах API?
- CORS настроен строго (конкретный origin, не `*`)?

### 1.2 IDOR и контроль доступа
Проверь каждый контроллер и сервис:
- `backend/src/modules/collections/collections.controller.ts` — все эндпоинты коллекций
- `backend/src/modules/collections/collections.service.ts` — бизнес-логика коллекций
- `backend/src/modules/machines/machines.controller.ts` — управление автоматами
- `backend/src/modules/users/users.controller.ts` — управление пользователями
- `backend/src/modules/invites/invites.controller.ts` — инвайты
- `backend/src/modules/finance/finance.controller.ts` — финансы
- `backend/src/modules/reports/reports.controller.ts` — отчёты

**Что искать:**
- Оператор может видеть/изменять чужие инкассации?
- Оператор может получить данные другого оператора?
- Менеджер может изменить роль пользователя?
- Неавторизованный доступ к отчётам?
- Прямой доступ к объектам по ID без проверки владельца?

### 1.3 Входные данные и инъекции
Проверь все DTO и валидацию:
- `backend/src/modules/collections/dto/` — все DTO коллекций (create, receive, edit, cancel, bulk, query)
- `backend/src/modules/machines/dto/` — все DTO автоматов
- `backend/src/modules/users/dto/` — DTO пользователей
- `backend/src/modules/invites/dto/` — DTO инвайтов
- `backend/src/modules/reports/dto/` — DTO отчётов
- `backend/src/modules/auth/dto/` — DTO авторизации

**Что искать:**
- Все числовые поля имеют @Min/@Max?
- Строковые поля имеют @MaxLength?
- SQL injection через сортировку (sortBy/sortOrder whitelist)?
- XSS через notes/reason/name поля?
- Enum валидация (@IsEnum) на всех enum-полях?
- Decimal precision для финансовых сумм?
- Отсутствующая валидация UUID?

### 1.4 Конфигурация безопасности
- `backend/src/main.ts` — Helmet, CORS, ValidationPipe настройки
- `backend/src/config/configuration.ts` — env-переменные, секреты
- `frontend/nginx.conf` — CSP заголовки, proxy, security headers
- `.env.example` — нет ли real secrets?
- `docker-compose.yml` / `docker-compose.dev.yml` — exposed ports, volumes

**Что искать:**
- CSP содержит `unsafe-eval`? Убрать
- Helmet настроен с правильным CSP?
- Rate limiting настроен на всех уровнях?
- Swagger отключён в production?
- Health endpoint не раскрывает sensitive info?
- Docker использует non-root user?

---

## ЭТАП 2: ЦЕЛОСТНОСТЬ ДАННЫХ (Data Integrity)

### 2.1 Финансовые операции
Проверь каждый метод в:
- `backend/src/modules/collections/collections.service.ts`:
  - `create()` — создание инкассации, проверка дубликатов
  - `receive()` — приём менеджером, ввод суммы
  - `edit()` — редактирование суммы
  - `cancel()` — отмена инкассации
  - `bulkCreate()` — массовое создание
  - `findAll()` / `findPending()` / `findMy()` — запросы с фильтрацией

**Что искать:**
- Pessimistic locking (`FOR UPDATE`) используется для receive/edit/cancel?
- Транзакции (`queryRunner`) на всех мульти-step операциях?
- Race condition в create() при duplicate check?
- Decimal precision — `amount` не теряет точность при parseFloat?
- Нельзя receive уже received/cancelled коллекцию?
- Нельзя cancel уже cancelled коллекцию?
- Нельзя edit cancelled коллекцию?
- bulkCreate валидирует каждую запись?
- Amount >= 0 проверяется всегда?

### 2.2 Аудит-лог
- `backend/src/modules/collections/entities/collection-history.entity.ts` — модель истории
- `backend/src/migrations/1737700000000-ProtectAuditLog.ts` — trigger иммутабельности

**Что искать:**
- receive() создаёт запись в CollectionHistory?
- edit() логирует старое и новое значение?
- cancel() логирует причину?
- Trigger защищает от UPDATE и DELETE аудит-лога?
- Trigger защищает от TRUNCATE?
- Есть request_id для трассировки?

### 2.3 Модели данных
Проверь каждую entity:
- `backend/src/modules/users/entities/user.entity.ts`
- `backend/src/modules/machines/entities/machine.entity.ts`
- `backend/src/modules/machines/entities/machine-location.entity.ts`
- `backend/src/modules/collections/entities/collection.entity.ts`
- `backend/src/modules/collections/entities/collection-history.entity.ts`
- `backend/src/modules/invites/entities/invite.entity.ts`
- `backend/src/modules/finance/entities/bank-deposit.entity.ts`
- `backend/src/modules/settings/entities/setting.entity.ts`
- `backend/src/modules/auth/entities/refresh-token.entity.ts`

**Что искать:**
- Правильные типы колонок (decimal для денег, bigint для telegramId)?
- Индексы на часто запрашиваемых полях?
- Каскадные удаления настроены корректно?
- Nullable поля корректны?
- Unique constraints где нужно?
- createdAt/updatedAt на всех сущностях?

### 2.4 Миграции
Проверь все файлы в `backend/src/migrations/`:
- Миграции идемпотентны?
- Порядок выполнения корректен?
- down() методы реализованы?
- Нет потери данных при миграции?

---

## ЭТАП 3: TELEGRAM БОТ (Bot Audit)

### 3.1 Логика бота
Проверь полностью `backend/src/telegram/telegram.service.ts` (основной файл ~47KB):

**Жизненный цикл:**
- `onModuleInit()` / `onModuleDestroy()` — init/shutdown бота
- Регистрация handlers и middleware

**Команды:**
- `/start` — регистрация, инвайт-коды, welcome
- `/collect` — flow сбора инкассации (выбор автомата → подтверждение)
- `/pending` — список ожидающих инкассаций
- `/web` — ссылка на веб-панель
- `/invite` — генерация инвайт-кода

**Что искать:**
- Все callback_query обработаны?
- Session state machine не имеет deadlock/unreachable states?
- Ошибки при отправке сообщений обрабатываются (blocked by user, chat not found)?
- Rate limiting на командах бота?
- Retry logic для временных сбоев Telegram API?
- Пагинация списков (автоматы, инкассации) работает корректно?
- Inline-кнопки не ломаются при повторном нажатии?
- escapeHtml() применяется ко всем пользовательским данным?
- Бот не падает при невалидных callback_data?
- Геолокация обрабатывается корректно?
- Старые сообщения бота чистятся правильно?

### 3.2 Сессии бота
- `backend/src/telegram/session-storage.ts`

**Что искать:**
- Redis TTL настроен (сессии не живут вечно)?
- In-memory fallback только для development?
- Сессия очищается при /start, main_menu?
- Данные сессии не содержат sensitive info?

---

## ЭТАП 4: BACKEND СЕРВИСЫ (Service Layer Audit)

### 4.1 Machines Service
- `backend/src/modules/machines/machines.service.ts`
- `backend/src/modules/machines/machines.controller.ts`

**Что искать:**
- Создание автомата — валидация уникальности code?
- Approval flow — только admin/manager может approve?
- Rejection — reason обязателен?
- Location history — правильная работа isCurrent?
- Soft delete vs hard delete?
- Поиск автоматов — фильтрация по статусу, пагинация?

### 4.2 Users Service
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`

**Что искать:**
- Деактивация пользователя — что происходит с его active инкассациями?
- Изменение роли — правильная валидация?
- Нельзя удалить последнего admin?
- Только admin может управлять пользователями?

### 4.3 Invites Service
- `backend/src/modules/invites/invites.service.ts`
- `backend/src/modules/invites/invites.controller.ts`

**Что искать:**
- Инвайт-код генерируется криптографически безопасно?
- Expiration проверяется?
- Нельзя создать admin invite (ограничение)?
- Использованный invite нельзя переиспользовать?

### 4.4 Reports Service
- `backend/src/modules/reports/reports.service.ts`
- `backend/src/modules/reports/reports.controller.ts`

**Что искать:**
- Excel export — formula injection защита?
- Большие выгрузки — stream/pagination?
- Группировка by-machine, by-date, by-operator — корректные SQL агрегации?
- Decimal precision в суммах отчётов?
- Фильтрация по дате — правильная работа с timezone?

### 4.5 Finance Service
- `backend/src/modules/finance/finance.service.ts`
- `backend/src/modules/finance/finance.controller.ts`

**Что искать:**
- Создание банковского депозита — валидация суммы?
- Только manager/admin?
- Связь с инкассациями?
- Корректные decimal операции?

### 4.6 Settings Service
- `backend/src/modules/settings/settings.service.ts`

**Что искать:**
- Key-value хранилище работает корректно?
- Кеширование настроек?
- Валидация значений?

### 4.7 Notifications Gateway
- `backend/src/notifications/notifications.gateway.ts`

**Что искать:**
- WebSocket аутентификация?
- Авторизация — пользователь получает только свои уведомления?
- Reconnection handling?
- Утечка данных через broadcast?

### 4.8 Health & Config
- `backend/src/health/health.controller.ts`
- `backend/src/config/configuration.ts`
- `backend/src/config/data-source.ts`
- `backend/src/config/logger.config.ts`
- `backend/src/cache/cache.module.ts`

**Что искать:**
- Health endpoint не раскрывает DB credentials/версии?
- Database SSL в production?
- Logger не пишет sensitive data?
- Redis connection handling — reconnect, timeout?

---

## ЭТАП 5: FRONTEND (Frontend Audit)

### 5.1 Компоненты и страницы
Проверь каждый файл в `frontend/src/pages/` и `frontend/src/components/`:

**Страницы:**
- `Login.tsx` — Telegram Widget integration
- `Dashboard.tsx` — главная панель
- `Collections.tsx` — список инкассаций
- `CollectionsPending.tsx` — ожидающие инкассации
- `Machines.tsx` — управление автоматами
- `Users.tsx` — управление пользователями
- `Reports.tsx` — отчёты и аналитика
- `ExcelImport.tsx` — импорт из Excel
- `HistoryEntry.tsx`, `HistoryByMachine.tsx`, `HistoryByDate.tsx` — история
- `TelegramMapPicker.tsx` — карта для Telegram
- `collections/PendingCollections.tsx`, `CollectionsList.tsx`, `BankDeposits.tsx`

**Компоненты:**
- `Layout.tsx` — навигация, layout
- `ErrorBoundary.tsx` — обработка ошибок
- `ReceiveModal.tsx`, `EditCollectionModal.tsx`, `CancelCollectionModal.tsx`
- `DepositModal.tsx` — банковский депозит
- `NotificationBell.tsx` — уведомления
- `ThemeToggle.tsx` — переключение темы
- `MapPicker.tsx` — карта Leaflet

**Что искать:**
- XSS — пользовательские данные выводятся через dangerouslySetInnerHTML?
- Формы — валидация на клиенте ДО отправки?
- Модальные окна — double-submit protection?
- Loading states — показаны при ожидании ответа API?
- Error states — показаны при ошибках?
- Empty states — показаны при пустых данных?
- Пагинация — корректная навигация?
- Responsive design — работает на мобильных?
- Accessibility — ARIA labels, keyboard navigation?
- Memory leaks — useEffect cleanup, cancelled requests?

### 5.2 API клиент
- `frontend/src/api/client.ts` — базовый axios instance
- `frontend/src/api/auth.ts` — auth API
- `frontend/src/api/collections.ts` — collections API
- `frontend/src/api/machines.ts` — machines API
- `frontend/src/api/users.ts` — users API
- `frontend/src/api/reports.ts` — reports API
- `frontend/src/api/finance.ts` — finance API

**Что искать:**
- Timeout настроен?
- Network errors обрабатываются с понятными сообщениями?
- 5xx errors обрабатываются?
- 429 (rate limit) обрабатывается?
- Refresh token flow работает без потери запросов?
- Request cancellation при unmount компонента?

### 5.3 State Management
- `frontend/src/contexts/AuthContext.ts` — Zustand store авторизации
- `frontend/src/contexts/ThemeContext.ts` — Zustand store темы
- `frontend/src/hooks/useNotifications.ts` — Socket.IO hook

**Что искать:**
- Token хранение безопасно?
- Logout очищает все данные?
- Theme persistence корректна?
- WebSocket reconnection?

### 5.4 Routing
- `frontend/src/App.tsx` — маршрутизация, ProtectedRoute, AdminRoute, ManagerRoute

**Что искать:**
- Все роуты защищены авторизацией?
- Role-based routing корректен?
- 404 обработка?
- Redirect после логина?

---

## ЭТАП 6: ИНФРАСТРУКТУРА (DevOps Audit)

### 6.1 Docker
- `backend/Dockerfile`, `backend/Dockerfile.dev`
- `frontend/Dockerfile`, `frontend/Dockerfile.dev`
- `docker-compose.yml`, `docker-compose.dev.yml`

**Что искать:**
- Multi-stage builds оптимальны?
- .dockerignore существует и полный?
- Non-root user используется?
- Health checks настроены?
- Volumes для persistent data?
- Environment variables не захардкожены?
- Node.js не запускается как PID 1 (нужен tini/dumb-init)?

### 6.2 CI/CD
- `.github/workflows/` — все workflow файлы

**Что искать:**
- Тесты запускаются с coverage?
- Linting проверяется?
- Build проверяется?
- Secrets не хардкожены?
- Docker image scanning?
- Deployment pipeline корректен?

### 6.3 Бэкапы
- `scripts/backup.sh`, `scripts/restore.sh`

**Что искать:**
- Backup запускается автоматически?
- Ротация старых бэкапов?
- Restore протестирован?
- Бэкап включает все таблицы?

### 6.4 Nginx
- `frontend/nginx.conf`

**Что искать:**
- Gzip настроен правильно?
- Кеширование статики?
- Proxy headers (X-Real-IP, X-Forwarded-For)?
- WebSocket проксирование для Socket.IO?
- Security headers полные?

---

## ЭТАП 7: КАЧЕСТВО КОДА (Code Quality)

### 7.1 TypeScript строгость
- `backend/tsconfig.json`, `frontend/tsconfig.json`

**Что искать:**
- `strict: true` включён?
- `noImplicitAny: true`?
- Нет `any` типов без необходимости?
- Нет `@ts-ignore` без комментария?

### 7.2 Обработка ошибок
Проверь каждый сервис и контроллер:

**Что искать:**
- Все async операции в try/catch?
- NestJS exceptions (NotFoundException, BadRequestException, etc.) используются правильно?
- Global exception filter настроен?
- Ошибки логируются с контекстом?
- Пользователь получает понятное сообщение, а не stack trace?

### 7.3 Logging
- `backend/src/config/logger.config.ts`
- `backend/src/common/interceptors/logging.interceptor.ts`

**Что искать:**
- Sensitive data не логируется (tokens, passwords)?
- Structured logging в production?
- Request/response logging?
- Ротация логов настроена?

### 7.4 Модульная структура
- `backend/src/app.module.ts` — корневой модуль

**Что искать:**
- Circular dependencies?
- Все модули правильно импортированы?
- forwardRef() используется обоснованно?
- Providers/exports корректны?

---

## ЭТАП 8: ТЕСТЫ (Testing Audit)

### 8.1 Backend тесты
Проверь каждый spec файл в `backend/src/`:
- `modules/auth/auth.service.spec.ts`
- `modules/auth/auth.controller.spec.ts`
- `modules/collections/collections.service.spec.ts`
- `modules/collections/collections.controller.spec.ts`
- `modules/machines/machines.service.spec.ts`
- `modules/machines/machines.controller.spec.ts`
- `modules/invites/invites.service.spec.ts`
- `modules/users/users.service.spec.ts`
- `modules/settings/settings.service.spec.ts`
- `telegram/telegram.service.spec.ts`

**Что искать:**
- Тесты действительно проверяют логику, а не моки?
- Edge cases покрыты (null, undefined, empty, max values)?
- Negative cases (ошибки, отказ в доступе)?
- Моки realistic — не `jest.fn().mockReturnValue(true)` на guard?
- Тесты запускаются и проходят (`npm test`)?

### 8.2 Frontend тесты
Проверь файлы в `frontend/src/`:
- `api/client.test.ts`
- `components/ThemeToggle.test.tsx`
- `components/NotificationBell.test.tsx`
- `components/MapPicker.test.tsx`

**Что искать:**
- Тесты проверяют пользовательское взаимодействие?
- Моки API корректны?
- Тесты не brittle (не привязаны к implementation details)?

### 8.3 Недостающие тесты
Определи и создай минимальные тесты для:
- Каждого сервиса без тестов
- Критических бизнес-операций (receive, edit, cancel)
- Telegram bot handlers
- Frontend forms и modals

---

## ЭТАП 9: ИТОГОВАЯ ПРОВЕРКА

После всех исправлений:

1. **Backend build:** `cd backend && npm run build` — должен скомпилироваться без ошибок
2. **Frontend build:** `cd frontend && npm run build` — должен собраться без ошибок
3. **Backend tests:** `cd backend && npm test` — все тесты должны пройти
4. **Frontend tests:** `cd frontend && npm test` — все тесты должны пройти
5. **Lint:** Нет ESLint ошибок
6. **TypeScript:** Нет TS ошибок

---

## Формат работы

Для каждого этапа:
1. Прочитай все указанные файлы
2. Найди проблемы
3. Исправь каждую проблему
4. Проверь компиляцию
5. Перейди к следующему этапу

Приоритеты исправлений:
- **CRITICAL** — исправить немедленно (безопасность, потеря данных)
- **HIGH** — исправить в рамках аудита (баги, некорректная логика)
- **MEDIUM** — исправить если не ломает существующее (улучшения)
- **LOW** — отметить, но не трогать без явной необходимости

Не создавай новые файлы без необходимости. Редактируй существующие.
