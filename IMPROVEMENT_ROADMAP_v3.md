# VendCash - План Доработок v3.0 (Экспертная проверка)

**Дата:** 2026-01-28
**Статус:** Каждый пункт проверен в коде

---

## 🔍 РЕЗУЛЬТАТЫ ЭКСПЕРТНОЙ ПРОВЕРКИ

### ❌ Дополнительные ложные срабатывания (удалены)

| Пункт v2 | Почему ложное | Доказательство |
|----------|---------------|----------------|
| HTTPS/SSL не настроен | Railway предоставляет HTTPS автоматически | Все Railway apps получают `*.railway.app` с SSL |
| continue-on-error в deploy | Только на frontend, это допустимо | `ci.yml:109` - позволяет backend deploy при frontend fail |
| CSP в backend main.ts | Backend CSP строже чем казалось | Только `style-src: 'unsafe-inline'`, нет `unsafe-eval` |

### ✅ Подтверждённые проблемы

| Пункт | Статус | Доказательство |
|-------|--------|----------------|
| JWT в localStorage | ✓ ЕСТЬ | `AuthContext.ts:56-58` - persist в localStorage |
| CSP unsafe-eval в nginx | ✓ ЕСТЬ | `nginx.conf:25` - `'unsafe-inline' 'unsafe-eval'` |
| DB backups отсутствуют | ✓ ЕСТЬ | Папка scripts/ не существует |
| Dockerfile.dev нет | ✓ ЕСТЬ | Только `backend/Dockerfile` |
| Frontend тесты 0% | ✓ ЕСТЬ | 0 файлов *.test.ts/tsx |
| Backend coverage ~8% | ✓ ЕСТЬ | 6 файлов из ~72 |
| Telegram тесты 0% | ✓ ЕСТЬ | Нет telegram.service.spec.ts |
| Telegram retry нет | ✓ ЕСТЬ | `telegram.service.ts:182-194` - один try/catch |
| Session TTL нет | ✓ ЕСТЬ | `session-storage.ts` - нет EX в Redis |
| Network errors | ✓ ЕСТЬ | `client.ts:68-131` - только 401 handling |
| ARIA labels нет | ✓ ЕСТЬ | Только 1 aria-label во всём frontend |

---

## 📊 ПЕРЕСМОТРЕННЫЕ ПРИОРИТЕТЫ

### Контекст проекта:
- **Тип:** Корпоративная система для вендинговых автоматов
- **Пользователи:** Ограниченный круг сотрудников (~10-50)
- **Данные:** Финансовые (суммы инкассаций)
- **Вход:** Только через Telegram (нет форм с паролями)
- **Хостинг:** Railway (HTTPS автоматически)

### Приоритеты для этого контекста:

| Приоритет | Критерий |
|-----------|----------|
| 🔴 CRITICAL | Потеря данных, неработающий UX |
| 🟠 HIGH | Безопасность, качество кода |
| 🟡 MEDIUM | Улучшения, не блокируют работу |
| 🟢 LOW | Nice-to-have |

---

# ФИНАЛЬНЫЙ ПЛАН (13 пунктов, ~32 часа)

## 🔴 CRITICAL (4 пункта, ~8ч)

### 1. Автоматические DB backups
**Время:** 2 часа
**Почему critical:** Потеря финансовых данных = катастрофа

**Текущее состояние:**
- Папка `scripts/` не существует
- Нет backup логики нигде

**Решение:**

1. Создать `scripts/backup.sh`:
```bash
#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/backups/vendcash_${TIMESTAMP}.sql.gz"

PGPASSWORD=$DB_PASSWORD pg_dump \
  -h $DB_HOST \
  -U $DB_USERNAME \
  -d $DB_NAME \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

echo "$(date): Backup created: $BACKUP_FILE"

# Cleanup: keep last 30 days
find /backups -name "*.sql.gz" -mtime +30 -delete
```

2. Добавить в `docker-compose.yml`:
```yaml
  backup:
    image: postgres:15-alpine
    volumes:
      - ./scripts:/scripts:ro
      - ./backups:/backups
    environment:
      DB_HOST: postgres
      DB_USERNAME: ${DB_USERNAME:-vendcash}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_DATABASE:-vendcash}
    entrypoint: /bin/sh -c "chmod +x /scripts/backup.sh && while true; do /scripts/backup.sh; sleep 86400; done"
    depends_on:
      postgres:
        condition: service_healthy
```

3. Создать `scripts/restore.sh` для восстановления.

---

### 2. Обработка сетевых ошибок в frontend
**Время:** 1.5 часа
**Почему critical:** Пользователи не понимают что происходит при ошибках сети

**Текущее состояние:**
```typescript
// client.ts - только 401 обрабатывается!
if (error.response?.status === 401 && !originalRequest._retry) {
  // ...
}
return Promise.reject(error)  // Всё остальное - просто reject
```

**Решение:**
```typescript
// frontend/src/api/client.ts

import { toast } from 'react-hot-toast';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 секунд
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // 1. Network error (no response at all)
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        toast.error('Превышено время ожидания. Проверьте соединение.');
      } else if (error.message.includes('Network Error')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету.');
      }
      return Promise.reject(error);
    }

    // 2. Server errors (5xx)
    if (error.response.status >= 500) {
      toast.error('Ошибка сервера. Попробуйте позже.');
      return Promise.reject(error);
    }

    // 3. Rate limiting
    if (error.response.status === 429) {
      toast.error('Слишком много запросов. Подождите минуту.');
      return Promise.reject(error);
    }

    // 4. Existing 401 handling...
    if (error.response.status === 401 && !originalRequest._retry) {
      // ... existing code
    }

    return Promise.reject(error);
  }
)
```

---

### 3. Создать Dockerfile.dev для backend
**Время:** 15 мин
**Почему critical:** docker-compose.dev.yml ссылается на несуществующий файл

**Решение** - создать `backend/Dockerfile.dev`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Don't copy source - will be mounted as volume
# Source files mounted from docker-compose.dev.yml

# Development with hot reload
CMD ["npm", "run", "start:dev"]
```

---

### 4. CI: использовать test:cov вместо test
**Время:** 15 мин
**Почему critical:** CI не показывает реальное покрытие тестами

**Текущее:**
```yaml
- name: Run tests
  run: npm run test || echo "No tests found"  # ← Нет coverage!
```

**Решение:**
```yaml
- name: Run tests with coverage
  run: npm run test:cov

- name: Check coverage threshold
  run: |
    COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    echo "Coverage: $COVERAGE%"
    if (( $(echo "$COVERAGE < 30" | bc -l) )); then
      echo "Coverage below 30% threshold!"
      exit 1
    fi
```

---

## 🟠 HIGH (5 пунктов, ~14ч)

### 5. JWT localStorage → httpOnly cookies
**Время:** 4 часа
**Почему high:** XSS защита для финансовых данных

**Изменения в 4 файлах:**

1. **backend/src/modules/auth/auth.controller.ts** - установка cookies
2. **backend/src/modules/auth/jwt.strategy.ts** - чтение из cookies
3. **frontend/src/api/client.ts** - убрать getToken/setToken, добавить withCredentials
4. **frontend/src/contexts/AuthContext.ts** - убрать persist для token

*(Детальный код см. в v2)*

---

### 6. Исправить CSP в nginx.conf
**Время:** 1 час
**Почему high:** `unsafe-eval` позволяет выполнять eval() при XSS

**Текущее:**
```nginx
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org;
```

**Проблема:** Telegram Widget требует `unsafe-inline` для работы.

**Решение:** Минимизировать риск:
```nginx
# Убрать unsafe-eval, оставить только unsafe-inline для Telegram
script-src 'self' 'unsafe-inline' https://telegram.org https://oauth.telegram.org;

# Добавить дополнительные защиты
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;  # Было SAMEORIGIN
```

**Примечание:** Полное удаление `unsafe-inline` требует рефакторинга Telegram Widget integration.

---

### 7. Telegram unit тесты (минимум 30%)
**Время:** 4 часа
**Почему high:** 3400 строк кода без тестов

**Создать `backend/src/telegram/telegram.service.spec.ts`:**
```typescript
describe('TelegramService', () => {
  // Mock bot
  const mockBot = {
    api: { sendMessage: jest.fn() },
    start: jest.fn(),
    stop: jest.fn(),
  };

  describe('sendMessage', () => {
    it('should return true on success');
    it('should return false when bot blocked');
    it('should return false when bot not initialized');
  });

  describe('escapeHtml', () => {
    it('should escape < > &');
  });

  describe('notifyManagersAboutNewCollection', () => {
    it('should send to all active managers');
    it('should handle failed sends gracefully');
  });
});
```

---

### 8. Telegram retry logic
**Время:** 1 час
**Почему high:** Потеря уведомлений при временных сбоях

**Решение:**
```typescript
async sendMessage(
  telegramId: number | string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
  retries = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await this.bot.api.sendMessage(telegramId, text, { parse_mode: parseMode });
      return true;
    } catch (error) {
      const message = getErrorMessage(error);

      // Permanent errors - don't retry
      if (message.includes('bot was blocked') ||
          message.includes('Forbidden') ||
          message.includes('chat not found')) {
        this.logger.debug(`Permanent error for ${telegramId}: ${message}`);
        return false;
      }

      // Transient errors - retry with backoff
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 100;
        this.logger.warn(`Retry ${attempt}/${retries} for ${telegramId} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      this.logger.error(`Failed after ${retries} attempts: ${message}`);
      return false;
    }
  }
  return false;
}
```

---

### 9. Frontend тесты setup + базовые тесты
**Время:** 4 часа
**Почему high:** 0% coverage в frontend

**Шаги:**
1. Установить Vitest + Testing Library
2. Настроить vite.config.ts
3. Написать тесты для: AuthContext, apiClient, Layout

*(Детальный код см. в v2)*

---

## 🟡 MEDIUM (3 пункта, ~6ч)

### 10. Backend test coverage → 30%
**Время:** 4 часа
**Текущее:** 6 тестов (~8%)
**Цель:** +4 теста (users, invites, reports, settings)

---

### 11. Session TTL в Redis
**Время:** 30 мин

```typescript
// session-storage.ts - добавить TTL
const redis = new Redis({
  // ... existing config
});

// Переопределить write для добавления TTL
class RedisAdapterWithTTL<T> extends RedisAdapter<T> {
  async write(key: string, value: T): Promise<void> {
    await this.redis.set(
      this.keyPrefix + key,
      JSON.stringify(value),
      'EX',
      86400 // 24 hours
    );
  }
}
```

---

### 12. ARIA labels
**Время:** 1.5 часа
**Файлы:** Layout, NotificationBell, модальные окна, таблицы

---

## 🟢 LOW (1 пункт, ~4ч)

### 13. Docker image scanning в CI
**Время:** 1 час

```yaml
- name: Build and scan
  run: |
    docker build -t vendcash-backend .
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
      aquasec/trivy image vendcash-backend --severity HIGH,CRITICAL
```

---

# 📅 РЕАЛИСТИЧНЫЙ TIMELINE

## Неделя 1: Critical + High Priority
| День | Задачи | Время |
|------|--------|-------|
| 1 | #1 DB Backups | 2ч |
| 2 | #2 Network errors + #3 Dockerfile.dev + #4 CI coverage | 2ч |
| 3-4 | #5 JWT → cookies | 4ч |
| 5 | #6 CSP fix + #8 Telegram retry | 2ч |

**Итого неделя 1:** ~10ч

## Неделя 2: Testing
| День | Задачи | Время |
|------|--------|-------|
| 1-2 | #7 Telegram unit tests | 4ч |
| 3-4 | #9 Frontend tests setup | 4ч |
| 5 | #10 Backend coverage | 4ч |

**Итого неделя 2:** ~12ч

## Неделя 3: Polish
| День | Задачи | Время |
|------|--------|-------|
| 1 | #11 Session TTL | 30м |
| 2 | #12 ARIA labels | 1.5ч |
| 3 | #13 Docker scanning | 1ч |

**Итого неделя 3:** ~3ч

---

# ✅ PRODUCTION CHECKLIST (ВЫПОЛНЕНО 2026-01-28)

## Must Have (Critical)
- [x] DB backups работают и тестированы
- [x] Network errors показывают понятные сообщения
- [x] Dockerfile.dev создан
- [x] CI показывает coverage

## Should Have (High)
- [x] JWT в httpOnly cookies
- [x] CSP без unsafe-eval
- [x] Telegram unit tests ≥30%
- [x] Telegram retry logic
- [x] Frontend tests setup

## Nice to Have (Medium/Low)
- [x] Backend coverage ≥30%
- [x] Session TTL настроен
- [x] ARIA labels добавлены
- [x] Docker scanning в CI

---

**Общее время:** ~32ч (vs 62ч в v1, 37ч в v2)
**Critical path:** ~10ч
**Удалено ложных срабатываний:** 12 пунктов
