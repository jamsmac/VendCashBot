# Промпт: Проверка, оптимизация и исправление процесса регистрации и авторизации VendCash

## Контекст проекта

VendCash - система учёта инкассации вендинговых автоматов. Используется:
- **Backend:** NestJS + TypeORM + PostgreSQL
- **Frontend:** React + Vite + Zustand + React Router
- **Авторизация:** Telegram Login Widget + JWT + httpOnly cookies
- **Роли:** operator, manager, admin

## Текущая архитектура авторизации

### Backend файлы:
- `backend/src/modules/auth/auth.controller.ts` - контроллер авторизации
- `backend/src/modules/auth/auth.service.ts` - сервис авторизации
- `backend/src/modules/auth/jwt.strategy.ts` - JWT стратегия
- `backend/src/modules/auth/entities/refresh-token.entity.ts` - сущность refresh токена
- `backend/src/common/guards/jwt-auth.guard.ts` - guard для JWT
- `backend/src/common/guards/roles.guard.ts` - guard для ролей
- `backend/src/modules/invites/` - модуль инвайтов для регистрации

### Frontend файлы:
- `frontend/src/pages/Login.tsx` - страница входа
- `frontend/src/contexts/AuthContext.ts` - Zustand store авторизации
- `frontend/src/api/client.ts` - API клиент с interceptors
- `frontend/src/api/auth.ts` - API методы авторизации
- `frontend/src/App.tsx` - роутинг и защищённые маршруты

## Полный flow авторизации

```
1. Пользователь открывает /login
2. Загружается Telegram Login Widget
3. Пользователь нажимает "Login with Telegram"
4. Telegram возвращает данные: {id, first_name, last_name, username, photo_url, auth_date, hash}
5. Frontend отправляет POST /api/auth/telegram
6. Backend валидирует hash через HMAC-SHA256
7. Backend проверяет auth_date (не старше 24ч)
8. Backend ищет пользователя по telegramId
9. Backend генерирует JWT access token (15 мин) и refresh token (30 дней)
10. Токены устанавливаются в httpOnly cookies
11. Frontend получает user data и сохраняет в Zustand store
12. Frontend перенаправляет на /dashboard
13. ProtectedRoute проверяет isAuthenticated
14. При 401 ошибке - автоматический refresh через interceptor
```

## Задача

Проведи полный аудит и исправь все проблемы в процессе регистрации и авторизации:

### 1. Проверить и исправить Frontend

**Login.tsx:**
- [ ] Проверить корректную загрузку Telegram Widget
- [ ] Проверить обработку ошибок от Telegram
- [ ] Проверить race conditions в useEffect
- [ ] Проверить утечки памяти при unmount компонента
- [ ] Проверить double-submit при быстром клике
- [ ] Проверить обработку случая когда пользователь уже авторизован
- [ ] Проверить отображение состояния загрузки

**AuthContext.ts:**
- [ ] Проверить инициализацию store при загрузке приложения
- [ ] Проверить race condition между checkAuth и login
- [ ] Проверить корректную обработку ошибок
- [ ] Проверить состояние isLoading во всех сценариях
- [ ] Добавить типизацию для telegramData

**API Client (client.ts):**
- [ ] Проверить логику refresh token interceptor
- [ ] Проверить очередь запросов при обновлении токена
- [ ] Проверить обработку network errors
- [ ] Проверить infinite loop prevention при refresh
- [ ] Проверить timeout настройки

**App.tsx:**
- [ ] Проверить ProtectedRoute на все edge cases
- [ ] Проверить AdminRoute и ManagerRoute
- [ ] Проверить redirect logic при logout

### 2. Проверить и исправить Backend

**auth.controller.ts:**
- [ ] Проверить COOKIE_OPTIONS для production/development
- [ ] Проверить sameSite настройки для cross-origin
- [ ] Проверить secure flag
- [ ] Проверить path для cookies
- [ ] Проверить clearCookie при logout

**auth.service.ts:**
- [ ] Проверить Telegram hash verification algorithm
- [ ] Проверить обработку undefined/null в authData
- [ ] Проверить JWT payload structure
- [ ] Проверить refresh token rotation
- [ ] Проверить revocation логику
- [ ] Проверить cleanup expired tokens

**jwt.strategy.ts:**
- [ ] Проверить извлечение токена из cookie/header
- [ ] Проверить валидацию payload
- [ ] Проверить обработку истёкшего токена

### 3. Критические сценарии для тестирования

1. **Успешный вход:** Новый пользователь входит через Telegram
2. **Повторный вход:** Уже авторизованный пользователь открывает /login
3. **Истёкший access token:** Автоматический refresh при 401
4. **Истёкший refresh token:** Redirect на /login
5. **Отключение пользователя:** isActive = false
6. **Logout:** Очистка всех токенов и cookies
7. **Multiple tabs:** Синхронизация состояния между вкладками
8. **Network error:** Корректная обработка offline состояния
9. **Server error (5xx):** Корректное отображение ошибки
10. **Rate limiting (429):** Корректное отображение ограничения

### 4. Известные потенциальные проблемы

1. **Race condition в AuthContext:**
   - `checkAuth()` вызывается до монтирования компонентов
   - Может привести к мерцанию UI

2. **Telegram Widget в Strict Mode:**
   - Widget может загружаться дважды
   - Используется `widgetLoaded.current` ref для предотвращения

3. **Cookie SameSite:**
   - В production нужен `sameSite: 'none'` и `secure: true`
   - Требуется HTTPS

4. **Refresh token queue:**
   - При множественных 401 ошибках одновременно
   - Нужна корректная queue обработка

5. **Logout на всех вкладках:**
   - Нет синхронизации между вкладками браузера

### 5. Переменные окружения

**Backend (.env):**
```
JWT_SECRET=<минимум 32 символа>
TELEGRAM_BOT_TOKEN=<токен бота>
JWT_EXPIRES_IN=15m
FRONTEND_URL=https://your-domain.com
```

**Frontend (.env):**
```
VITE_API_URL=/api
VITE_TELEGRAM_BOT_USERNAME=VendCashBot
```

### 6. Требования к исправлениям

1. **Не ломать существующую функциональность**
2. **Сохранить обратную совместимость API**
3. **Добавить подробные комментарии к сложной логике**
4. **Логировать ошибки для отладки**
5. **Обеспечить типобезопасность (TypeScript)**
6. **Следовать существующим паттернам кода**

### 7. Ожидаемый результат

После исправлений должен работать следующий flow без ошибок:

1. Открытие /login показывает Telegram Login Widget
2. Клик на виджет открывает Telegram авторизацию
3. После подтверждения - автоматический redirect на /dashboard
4. Dashboard отображает данные пользователя
5. При истечении access token - автоматический refresh
6. При истечении refresh token - redirect на /login
7. Logout очищает все данные и возвращает на /login
8. Защищённые роуты недоступны без авторизации

## Команды для запуска

```bash
# Backend
cd backend && npm run start:dev

# Frontend
cd frontend && npm run dev

# Проверка типов
npm run typecheck

# Проверка линтера
npm run lint
```

## Дополнительный контекст

- Nginx проксирует /api на backend (порт 3000)
- Frontend работает на порте 5173 в dev режиме
- База данных PostgreSQL
- Telegram Bot уже настроен и работает
- Инвайт-система работает через Telegram Bot
