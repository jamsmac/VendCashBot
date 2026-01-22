# VendCash — Промпт для полной разработки

## Контекст проекта

Разработай полнофункциональную систему **учёта инкассации** вендинговых автоматов **VendCash** от начала до production-ready состояния.

**Основная задача:** Учёт сбора денег с автоматов — кто, когда, с какого автомата, сколько собрал. Удобная отчётность по этим данным.

---

## 🎯 Цель

Создать рабочую систему, состоящую из:
1. **Backend API** (NestJS + TypeORM + PostgreSQL)
2. **Telegram Bot** (grammY) — для операторов
3. **Web Frontend** (React + Tailwind CSS) — для менеджеров/админов
4. **Docker deployment** — готово к запуску на Hetzner VPS

---

## 📋 Функциональные требования

### Роли пользователей

| Роль | Платформа | Возможности |
|------|-----------|-------------|
| **Оператор** | Telegram бот | Выбор автомата, отметка времени сбора |
| **Менеджер** | Telegram бот + Web | Приём инкассации, ввод суммы, отчёты, ввод истории |
| **Admin** | Telegram бот + Web | Всё + управление автоматами, приглашение сотрудников |

### Регистрация по приглашению (без паролей!)

```
1. Админ нажимает "Пригласить" (в боте или на сайте)
2. Выбирает роль: Оператор или Менеджер
3. Система генерирует ссылку: t.me/VendCashBot?start=invite_abc123
4. Админ отправляет ссылку сотруднику
5. Сотрудник переходит → нажимает Start → вводит имя → готово!
6. Веб-авторизация через Telegram Login Widget
```

### Основной flow

```
Оператор (Telegram)              Менеджер (Web)
       │                              │
  Выбирает автомат               Видит "Ожидают приёма"
       │                              │
  Нажимает "Подтвердить"         Принимает, вводит сумму
  (фиксируется время                  │
   до секунды!)                       │
       │                              ▼
       └──────────────────────► Отчёты и аналитика
```

### ⚠️ Точность времени

Время сбора (`collected_at`) должно фиксироваться **с точностью до секунды** — это необходимо для точного учёта и будущей интеграции.

| Где | Формат | Пример |
|-----|--------|--------|
| Telegram бот | ДД.ММ.ГГГГ ЧЧ:ММ:СС | 22.01.2026 14:35:47 |
| Веб-интерфейс | ЧЧ:ММ:СС или полный | 14:35:47 |
| API | ISO 8601 UTC | 2026-01-22T09:35:47.000Z |

---

## 🗄️ База данных

### Таблицы

#### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(100),
    telegram_first_name VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'manager', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### invites (приглашения)
```sql
CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'manager')),
    created_by UUID NOT NULL REFERENCES users(id),
    used_by UUID REFERENCES users(id),
    used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### machines
```sql
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    vhm24_id UUID,
    vhm24_synced_at TIMESTAMP
);
```

#### collections
```sql
CREATE TYPE collection_status AS ENUM ('collected', 'received', 'cancelled');
CREATE TYPE collection_source AS ENUM ('realtime', 'manual_history', 'excel_import');

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID NOT NULL REFERENCES machines(id),
    operator_id UUID NOT NULL REFERENCES users(id),
    manager_id UUID REFERENCES users(id),
    collected_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP,
    amount DECIMAL(15, 2),
    status collection_status NOT NULL DEFAULT 'collected',
    source collection_source NOT NULL DEFAULT 'realtime',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔌 API Endpoints

### Auth (через Telegram)
```
POST   /api/auth/telegram           # Авторизация через Telegram Login Widget
GET    /api/auth/me                 # Текущий пользователь
POST   /api/auth/refresh            # Обновление токена
```

### Invites (приглашения)
```
GET    /api/invites                 # Список приглашений (admin)
POST   /api/invites                 # Создать { role: 'operator' | 'manager' }
DELETE /api/invites/:id             # Отменить
```

### Users
```
GET    /api/users                   # Список (admin)
GET    /api/users/:id
PATCH  /api/users/:id               # Обновить (имя, телефон, статус)
DELETE /api/users/:id               # Деактивировать
```

### Machines
```
GET    /api/machines                # Список (query: ?active=true)
POST   /api/machines                # Создать (admin)
GET    /api/machines/:id
PATCH  /api/machines/:id            # Обновить (admin)
DELETE /api/machines/:id            # Soft delete (admin)
```

**Создание/обновление автомата:**
```json
{
  "code": "abc123f0000",
  "name": "Название автомата",
  "location": "Адрес/локация",
  "isActive": true
}
```

### Collections
```
GET    /api/collections             # Список с фильтрами (?status, ?machineId, ?from, ?to)
GET    /api/collections/pending     # Ожидающие приёма
POST   /api/collections             # Создать (от бота)
POST   /api/collections/bulk        # Массовое создание (исторические данные)
POST   /api/collections/import      # Импорт из Excel
GET    /api/collections/:id
GET    /api/collections/:id/history # История изменений
PATCH  /api/collections/:id/receive # Принять { amount, notes? }
PATCH  /api/collections/:id/edit    # Редактировать принятую { amount, reason }
PATCH  /api/collections/:id/cancel  # Отменить
```

### Reports
```
GET    /api/reports/summary         # Общая сводка (?from, ?to)
GET    /api/reports/by-machine      # По автоматам
GET    /api/reports/by-date         # По датам
GET    /api/reports/by-operator     # По операторам
GET    /api/reports/export          # Экспорт в Excel
```

---

## 🤖 Telegram Bot

### Команды
- `/start` — регистрация/авторизация

### Flow оператора
```
Главное меню:
├── 🏧 Отметить сбор
│   ├── Выбор автомата (inline keyboard)
│   ├── Подтверждение (показать время с секундами!)
│   └── Результат: "✅ Сбор зарегистрирован"
├── 📋 Мои сборы за сегодня
└── ❓ Помощь
```

### Важные детали
1. Время фиксируется в момент выбора автомата и сохраняется в сессии
2. При подтверждении используется сохранённое время (не текущее!)
3. Авторизация по telegram_id — админ заранее создаёт пользователя
4. **Защита от дублей:** если для автомата есть сбор за последние 30 мин — предупреждение

---

## 🔐 Дополнительные функции

### Регистрация по приглашению
- Админ создаёт ссылку (в боте: "Пригласить" или на сайте)
- Ссылка: `t.me/BotName?start=invite_CODE`
- Действует 24 часа, одноразовая
- При переходе: /start → ввод имени → готово

### Авторизация в Web
- Через Telegram Login Widget (кнопка "Войти через Telegram")
- Никаких паролей!
- После авторизации — JWT токен

### Меню бота по ролям
**Оператор:** Отметить сбор, Мои сборы
**Менеджер:** Ожидают приёма, Все инкассации, Отчёты, Веб-панель
**Админ:** + Пригласить сотрудника

### Управление автоматами (Admin)
- Добавление новых автоматов (код, название, адрес)
- Редактирование существующих
- Деактивация (soft delete)

### Управление пользователями (Admin)
- Список сотрудников с фильтром по роли
- Редактирование (имя, телефон)
- Деактивация
- Просмотр ожидающих приглашений

### Audit Log (История изменений)
```sql
CREATE TABLE collection_history (
    id UUID PRIMARY KEY,
    collection_id UUID REFERENCES collections(id),
    changed_by UUID REFERENCES users(id),
    field_name VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    created_at TIMESTAMP
);
```

---

## 🖥️ Web Frontend

### Страницы

```
/login                          # Авторизация
/dashboard                      # Главная: виджеты + ожидающие приёма
/collections                    # Все инкассации (таблица с фильтрами)
/collections/pending            # Только ожидающие
/collections/history            # Ввод исторических данных (выбор режима)
/collections/history/by-machine # Ввод по машине
/collections/history/by-date    # Ввод по дате
/reports                        # Отчёты
/reports/by-machine
/reports/by-date
/machines                       # Справочник автоматов (admin) — CRUD
/users                          # Пользователи (admin) — CRUD
/settings                       # Настройки профиля, смена пароля
```

### Admin: Управление автоматами
- Таблица всех автоматов с поиском и фильтром по статусу
- Кнопка "Добавить" → модалка с формой
- Кнопка "Редактировать" у каждого
- Поля: код (серийный номер), название, адрес, статус
- Деактивация вместо удаления

### Admin: Управление сотрудниками
- Таблица: имя, роль, @telegram, статус
- Кнопка "Пригласить" → выбор роли → генерация ссылки → копирование
- Редактирование: имя, телефон, статус (активен/деактивирован)
- Список ожидающих приглашений (можно отменить)

### Dashboard виджеты
- ⏳ Ожидают приёма (count)
- 💰 Собрано сегодня (sum)
- 📅 Собрано за месяц (sum)
- Список ожидающих с кнопкой "Принять"
- Последние инкассации

### Модалка приёма инкассации
```
🏧 Автомат: 5b7b181f0000 - Кардиология КПП
👷 Оператор: Алишер
⏰ Время сбора: 22.01.2026 14:35:47

[Сумма: ________] сум
[Примечание: ________]

[Отмена] [✅ Принять]
```

### Ввод исторических данных

**Режим "По машине":**
- Выбрал автомат → добавляешь строки: дата, время, сумма
- Enter → новая строка (дата = предыдущая)
- Поддержка Ctrl+V из Excel

**Режим "По дате":**
- Выбрал дату → добавляешь строки: автомат, время, сумма
- Уже добавленные автоматы скрыты из списка
- Время автоинкремент +5 мин

**Импорт Excel:**
- Формат: Код автомата | Дата | Время | Сумма | Примечание
- Валидация: нет будущих дат, нет дубликатов

---

## 📁 Структура проекта

```
vendcash/
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/
│   │   │   └── configuration.ts
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── guards/
│   │   │   ├── filters/
│   │   │   └── interceptors/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── dto/
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── entities/user.entity.ts
│   │   │   │   └── dto/
│   │   │   ├── machines/
│   │   │   │   ├── machines.module.ts
│   │   │   │   ├── machines.controller.ts
│   │   │   │   ├── machines.service.ts
│   │   │   │   ├── entities/machine.entity.ts
│   │   │   │   └── dto/
│   │   │   ├── collections/
│   │   │   │   ├── collections.module.ts
│   │   │   │   ├── collections.controller.ts
│   │   │   │   ├── collections.service.ts
│   │   │   │   ├── entities/collection.entity.ts
│   │   │   │   └── dto/
│   │   │   └── reports/
│   │   │       ├── reports.module.ts
│   │   │       ├── reports.controller.ts
│   │   │       └── reports.service.ts
│   │   └── telegram/
│   │       ├── telegram.module.ts
│   │       ├── telegram.service.ts
│   │       └── handlers/
│   ├── test/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── auth.ts
│   │   │   ├── collections.ts
│   │   │   ├── machines.ts
│   │   │   └── reports.ts
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── CollectionCard.tsx
│   │   │   ├── ReceiveModal.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Collections.tsx
│   │   │   ├── CollectionsPending.tsx
│   │   │   ├── HistoryEntry.tsx
│   │   │   ├── HistoryByMachine.tsx
│   │   │   ├── HistoryByDate.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── Machines.tsx
│   │   │   └── Users.tsx
│   │   ├── hooks/
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx
│   │   └── utils/
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

---

## ⚙️ Конфигурация

### .env
```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=vendcash
DB_PASSWORD=secure_password_here
DB_DATABASE=vendcash

# JWT
JWT_SECRET=your-very-long-secret-key-minimum-32-chars
JWT_EXPIRES_IN=7d

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# First Admin (required for first run)
ADMIN_TELEGRAM_ID=123456789
ADMIN_NAME=Администратор

# Frontend
FRONTEND_URL=http://localhost:5173

# Timezone
TZ=Asia/Tashkent
```

### docker-compose.yml (development)
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
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=development
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USERNAME=vendcash
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_DATABASE=vendcash
      - JWT_SECRET=${JWT_SECRET}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - FRONTEND_URL=${FRONTEND_URL}
    depends_on:
      - postgres
    ports:
      - "3000:3000"
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - VITE_API_URL=http://localhost:3000/api
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

---

## 🚀 Требования к реализации

### Backend
1. **NestJS** с модульной архитектурой
2. **TypeORM** с миграциями (не synchronize в production!)
3. **JWT авторизация** с Guards
4. **Валидация** через class-validator
5. **Swagger** документация (/api/docs)
6. **Логирование** через встроенный Logger
7. **Error handling** через Exception Filters
8. **CORS** настроен для frontend

### Telegram Bot
1. **grammY** framework
2. **Sessions** для хранения состояния
3. **Inline keyboards** для выбора
4. Интеграция в NestJS как модуль
5. Graceful shutdown

### Frontend
1. **React 18** + **TypeScript**
2. **Vite** для сборки
3. **React Router v6** для роутинга
4. **Tailwind CSS** для стилей
5. **React Query (TanStack Query)** для API
6. **React Hook Form** для форм
7. **Axios** для HTTP
8. **Zustand** или Context для auth state
9. Responsive design (mobile-friendly)

### Качество кода
1. TypeScript strict mode
2. ESLint + Prettier
3. Осмысленные имена переменных и функций
4. Комментарии для сложной логики
5. README с инструкциями

---

## 📝 Seed данные

При первом запуске создать:

```typescript
// Первый админ (из переменных окружения)
// ADMIN_TELEGRAM_ID=123456789
{
  telegramId: process.env.ADMIN_TELEGRAM_ID,
  name: process.env.ADMIN_NAME || 'Администратор',
  role: 'admin',
  isActive: true
}

// Автоматы (реальные данные)
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

> 💡 Чтобы узнать Telegram ID, напишите боту @userinfobot

---

## ✅ Критерии готовности (Definition of Done)

### Backend
- [ ] Все endpoints работают
- [ ] Telegram авторизация работает
- [ ] Invites API работает (создание, использование)
- [ ] Валидация входных данных
- [ ] Swagger документация
- [ ] Миграции и seed (admin + автоматы)

### Telegram Bot
- [ ] Регистрация по invite-ссылке работает
- [ ] Разные меню для разных ролей
- [ ] Оператор: отметка сбора с секундами
- [ ] Менеджер: приём инкассации в боте
- [ ] Админ: создание invite-ссылок

### Frontend
- [ ] Авторизация через Telegram Login Widget
- [ ] Dashboard с виджетами
- [ ] Приём инкассации
- [ ] Ввод исторических данных (оба режима)
- [ ] Импорт из Excel
- [ ] Отчёты + экспорт
- [ ] Управление автоматами (admin)
- [ ] Управление сотрудниками + invites (admin)
- [ ] Responsive

### Deployment
- [ ] docker-compose up работает
- [ ] Бот отвечает
- [ ] Web доступен
- [ ] Данные сохраняются

---

## 🔄 Порядок разработки

1. **Backend: База и Auth** (users, machines, JWT)
2. **Backend: Collections API** (CRUD, bulk, import)
3. **Backend: Reports API**
4. **Telegram Bot** (полный flow)
5. **Frontend: Auth + Layout**
6. **Frontend: Dashboard + Приём**
7. **Frontend: История + Импорт**
8. **Frontend: Отчёты**
9. **Frontend: Admin pages**
10. **Docker + Deploy**
11. **Тестирование end-to-end**

---

## 📎 Приложение: Спецификация

Полная техническая спецификация находится в файле `vendcash-specification.md`. Используй её как reference для деталей реализации, wireframes и примеров API.

---

**Начни разработку с создания структуры проекта и базового backend с авторизацией.**
