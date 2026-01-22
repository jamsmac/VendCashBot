# VendCash - Система учёта инкассации вендинговых автоматов

Система для автоматизации процесса учёта инкассации вендинговых автоматов с Telegram-ботом для операторов и веб-панелью для менеджеров.

## Архитектура

- **Backend**: NestJS + TypeORM + PostgreSQL
- **Telegram Bot**: grammY
- **Frontend**: React + Tailwind CSS + Vite
- **Deployment**: Docker + Docker Compose

## Быстрый старт

### 1. Клонирование и настройка

```bash
git clone <repository-url>
cd vendcash

# Копируем пример конфигурации
cp .env.example .env
```

### 2. Настройка .env

Отредактируйте файл `.env`:

```env
# Telegram Bot - получите у @BotFather
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=YourBotName

# Ваш Telegram ID - узнайте у @userinfobot
ADMIN_TELEGRAM_ID=your_telegram_id

# JWT Secret - сгенерируйте: openssl rand -hex 32
JWT_SECRET=your_random_secret_32_chars

# Пароль базы данных
DB_PASSWORD=your_secure_password

# URL вашего сервера (для production)
FRONTEND_URL=https://your-domain.com
VITE_API_URL=https://your-domain.com/api
```

### 3. Запуск (Development)

```bash
# Запуск с hot-reload
docker-compose -f docker-compose.dev.yml up --build
```

Приложение будет доступно:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Swagger: http://localhost:3000/api/docs

### 4. Запуск (Production)

```bash
docker-compose up -d --build
```

Приложение будет доступно на порту 80.

## Структура проекта

```
vendcash/
├── backend/
│   ├── src/
│   │   ├── auth/           # Аутентификация через Telegram
│   │   ├── users/          # Управление пользователями
│   │   ├── invites/        # Приглашения сотрудников
│   │   ├── machines/       # Автоматы
│   │   ├── collections/    # Инкассации
│   │   ├── reports/        # Отчёты и экспорт
│   │   ├── telegram/       # Telegram бот
│   │   └── common/         # Общие декораторы и guards
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/            # API клиенты
│   │   ├── components/     # React компоненты
│   │   ├── contexts/       # Контексты (Auth)
│   │   └── pages/          # Страницы
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml      # Production
├── docker-compose.dev.yml  # Development
└── .env.example
```

## Роли пользователей

| Роль | Telegram | Web | Возможности |
|------|----------|-----|-------------|
| **Оператор** | ✅ | ❌ | Отмечает сбор денег с автоматов |
| **Менеджер** | ✅ | ✅ | Принимает инкассации, вводит суммы, просматривает отчёты |
| **Админ** | ✅ | ✅ | Всё + управление сотрудниками и автоматами |

## Рабочий процесс

1. **Оператор** через Telegram бота отмечает сбор денег с автомата
2. **Менеджер** получает уведомление в Telegram
3. **Менеджер** принимает инкассацию и вводит точную сумму (в боте или web-панели)
4. Данные сохраняются для отчётности

## API Endpoints

### Auth
- `POST /api/auth/telegram` - Авторизация через Telegram

### Collections
- `GET /api/collections` - Список инкассаций (с фильтрами)
- `GET /api/collections/pending` - Ожидающие приёма
- `POST /api/collections` - Создать (оператор)
- `POST /api/collections/:id/receive` - Принять (менеджер)
- `POST /api/collections/bulk` - Массовый ввод

### Machines
- `GET /api/machines` - Список автоматов
- `POST /api/machines` - Создать
- `PATCH /api/machines/:id` - Обновить

### Users
- `GET /api/users` - Список пользователей
- `PATCH /api/users/:id` - Обновить

### Invites
- `POST /api/invites` - Создать приглашение
- `GET /api/invites/pending` - Активные приглашения

### Reports
- `GET /api/reports/by-machine` - По автоматам
- `GET /api/reports/by-date` - По датам
- `GET /api/reports/by-operator` - По операторам
- `GET /api/reports/export` - Экспорт в Excel

## Telegram Bot команды

- `/start` - Начало работы / регистрация
- `/collect` - Отметить сбор (оператор)
- `/pending` - Ожидающие приёма (менеджер)
- `/invite` - Пригласить сотрудника (админ)
- `/web` - Ссылка на веб-панель

## Deployment на Hetzner VPS

### 1. Подготовка сервера

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Установка Docker Compose
apt install docker-compose-plugin
```

### 2. Настройка домена

Направьте DNS A-запись вашего домена на IP сервера.

### 3. Деплой

```bash
# Клонируем проект
git clone <repo> /opt/vendcash
cd /opt/vendcash

# Настраиваем .env
cp .env.example .env
nano .env

# Запускаем
docker compose up -d --build
```

### 4. SSL (опционально)

Для HTTPS используйте nginx-proxy с Let's Encrypt или Cloudflare.

## Лицензия

MIT
