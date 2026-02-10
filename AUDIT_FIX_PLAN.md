# VendCash - Комплексный план аудита и исправлений

## Дата аудита: 2026-02-07
## Статус: ✅ ВСЕ ИСПРАВЛЕНИЯ ПРИМЕНЕНЫ

---

## БЛОК 1: ИДЕНТИФИКАЦИЯ И РЕГИСТРАЦИЯ (AUTH/INVITES)

### 1.1 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ

**[AUTH-01] Race condition в регистрации через Telegram бота** ✅
- Файл: `telegram.service.ts` строки 335-342
- Проблема: Пользователь создаётся ДО атомарного claim инвайта. Если claimInvite упадёт, создан "осиротевший" пользователь.
- Решение: Обёрнут claimInvite в try-catch с откатом (deleteById) при ошибке.

**[AUTH-02] Token refresh не перепроверяет актуальную роль пользователя** ✅
- Файл: `auth.service.ts` строки 176-181
- Проблема: При refresh JWT содержит устаревшую роль из токена.
- Решение: Перезагрузка пользователя из БД (`findByIdOrFail`) перед выпуском нового JWT.

**[AUTH-03] Frontend auth API использует `any` тип** ✅
- Файл: `frontend/src/api/auth.ts` строка 21
- Проблема: `telegramLogin(data: any)` — нет типизации.
- Решение: Заменён на `Record<string, string | number>`.

**[AUTH-04] clearCookie без полных опций** ✅
- Файл: `auth.controller.ts` строки 158-159
- Проблема: `clearCookie` не включает `sameSite` и `secure`.
- Решение: Передаются полные `COOKIE_OPTIONS` в clearCookie.

### 1.2 СРЕДНИЕ ИСПРАВЛЕНИЯ

**[AUTH-05] findUsersByRole с кастом `as any`** ✅
- Файл: `auth.service.ts` строка 40
- Решение: Приведён к `UserRole` (`role as UserRole`).

**[AUTH-06] Нет пагинации в findAll инвайтов** ✅
- Файл: `invites.service.ts` строка 59
- Решение: Добавлен `.take(500)`.

**[AUTH-07] Нет максимальной длины инвайт-кода при валидации** ✅
- Файл: `telegram.service.ts` строки 296-299
- Решение: Добавлена проверка `length > 64`.

---

## БЛОК 2: РЕГИСТРАЦИЯ НАЛИЧНЫХ ИНКАССАЦИЙ (COLLECTIONS/FINANCE)

### 2.1 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ

**[COLL-01] Финансовые вычисления через parseFloat — потеря точности** ✅
- Файл: `finance.service.ts` строки 50-52
- Проблема: `parseFloat()` теряет десятичную точность.
- Решение: `Number().toFixed(2)` для всех финансовых операций.

**[COLL-02] bulkCreate — zero-amount falsy баг** ✅
- Файл: `collections.service.ts` строки 159-164
- Проблема: `item.amount ? ...` — 0 = falsy, нулевая сумма не определяется.
- Решение: `item.amount && item.amount > 0` — явная проверка.

**[COLL-03] Zero-amount в BulkCreateCollectionDto** ✅
- Файл: `bulk-create-collection.dto.ts` строка 24
- Решение: `@Min(0)` → `@Min(1)`, русские сообщения валидации.

**[COLL-04] Zero-amount в CreateDepositDto** ✅
- Файл: `create-deposit.dto.ts` строка 7
- Решение: `@Min(0)` → `@Min(1)`, русские сообщения валидации.

### 2.2 СРЕДНИЕ ИСПРАВЛЕНИЯ

**[COLL-05] HTML-инъекция в уведомлениях** ✅
- Файл: `telegram.service.ts` строки 233-234
- Решение: Добавлен `escapeHtml()` для machineName и operatorName.

**[COLL-06] Нет валидации from < to в date range** ✅
- Файл: `collection-query.dto.ts`
- Решение: Добавлен `IsDateRangeValidConstraint` кастомный валидатор.

---

## БЛОК 3: ДОПОЛНИТЕЛЬНЫЕ ИСПРАВЛЕНИЯ (Раунд 2-3)

### 3.1 RACE CONDITIONS в receive/edit/cancel

**[COLL-07] Race condition в receive() — TOCTOU** ✅
- Файл: `collections.service.ts` строки 271-300
- Проблема: Статус/сумма читались из второго findOne ПОСЛЕ lock, а не из locked row.
- Решение: `oldStatus`/`oldAmount` берутся из `lockedCollection` ДО второго запроса.

**[COLL-08] Race condition в edit() — TOCTOU** ✅
- Файл: `collections.service.ts` строки 346-370
- Проблема: Валидация статуса после второго load.
- Решение: Валидация из locked row, русские сообщения.

**[COLL-09] Race condition в cancel() — TOCTOU** ✅
- Файл: `collections.service.ts` строки 401-438
- Проблема: `oldStatus` из второго load.
- Решение: `oldStatus` берётся из locked row.

### 3.2 DTO ВАЛИДАЦИЯ И I18N

**[COLL-10] EditCollectionDto — нет @IsNotEmpty на reason** ✅
- Файл: `edit-collection.dto.ts`
- Решение: Добавлен `@IsNotEmpty`, русские сообщения.

**[COLL-11] Все DTO — унификация русских сообщений** ✅
- Файлы: `receive-collection.dto.ts`, `bulk-create-collection.dto.ts`, `bulk-cancel-collection.dto.ts`, `create-deposit.dto.ts`
- Решение: Все `message:` переведены на русский.

**[COLL-12] bulkCancel — getRawMany type safety** ✅
- Файл: `collections.service.ts` строки 504-505
- Проблема: `getRawMany()` с type assertion `{ collection_id: string }`.
- Решение: Заменён на `getMany()` + `.map(c => c.id)`.

**[COLL-13] bulkCancel — английские сообщения в цикле** ✅
- Файл: `collections.service.ts` строки 526, 532, 542
- Решение: Переведены: "Инкассация не найдена", "Уже отменена", "Массовая отмена".

### 3.3 XSS ЗАЩИТА — САНИТИЗАЦИЯ ТЕКСТОВЫХ ПОЛЕЙ

**[COLL-14] Notes/reason поля без санитизации** ✅
- Файлы: `edit-collection.dto.ts`, `receive-collection.dto.ts`, `bulk-cancel-collection.dto.ts`, `create-deposit.dto.ts`
- Решение: `@Transform()` — trim + strip HTML tags для всех text полей.

### 3.4 FRONTEND UX

**[FE-01] Двойной submit — модалки закрываются во время запроса** ✅
- Файлы: `BulkCancelModal.tsx`, `CancelCollectionModal.tsx`, `EditCollectionModal.tsx`, `ReceiveModal.tsx`
- Решение: `disabled={isSubmitting}` на кнопках закрытия (X) и "Назад"/"Отмена".

**[FE-02] CancelCollectionModal — loose null check** ✅
- Файл: `CancelCollectionModal.tsx` строка 47
- Решение: `!= null` → `!== null && !== undefined`.

**[FE-03] ReceiveModal/EditCollectionModal — нет min/step на input** ✅
- Файлы: `ReceiveModal.tsx`, `EditCollectionModal.tsx`
- Решение: Добавлены `min="1"` и `step="1"` атрибуты.

**[FE-04] Frontend auth — any тип** ✅
- Файл: `frontend/src/api/auth.ts`
- Решение: `data: any` → `data: Record<string, string | number>`.

---

## ИТОГО

| Категория | Найдено | Исправлено |
|---|---|---|
| AUTH (критические) | 4 | 4 ✅ |
| AUTH (средние) | 3 | 3 ✅ |
| COLL (критические) | 4 | 4 ✅ |
| COLL (средние/доп.) | 8 | 8 ✅ |
| Frontend | 4 | 4 ✅ |
| **ВСЕГО** | **23** | **23 ✅** |

### Изменённые файлы (20):
1. `backend/src/modules/auth/auth.service.ts`
2. `backend/src/modules/auth/auth.controller.ts`
3. `backend/src/modules/users/users.service.ts`
4. `backend/src/modules/invites/invites.service.ts`
5. `backend/src/telegram/telegram.service.ts`
6. `backend/src/modules/collections/collections.service.ts`
7. `backend/src/modules/collections/dto/edit-collection.dto.ts`
8. `backend/src/modules/collections/dto/receive-collection.dto.ts`
9. `backend/src/modules/collections/dto/collection-query.dto.ts`
10. `backend/src/modules/collections/dto/bulk-create-collection.dto.ts`
11. `backend/src/modules/collections/dto/bulk-cancel-collection.dto.ts`
12. `backend/src/modules/finance/dto/create-deposit.dto.ts`
13. `backend/src/modules/finance/finance.service.ts`
14. `frontend/src/api/auth.ts`
15. `frontend/src/components/ReceiveModal.tsx`
16. `frontend/src/components/EditCollectionModal.tsx`
17. `frontend/src/components/CancelCollectionModal.tsx`
18. `frontend/src/components/BulkCancelModal.tsx`
