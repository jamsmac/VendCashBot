# VendCash Telegram Bot - Testing Checklist

## Quick Test Command
```
/start
```

---

## 1. Welcome Screen (Unauthorized User)

### Test Scenario
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 1.1 | Open bot without invite link | Welcome image + "Для доступа необходимо получить приглашение" | [ ] |
| 1.2 | Send any message without registration | Welcome screen appears | [ ] |
| 1.3 | Click any button without registration | Welcome screen appears | [ ] |

---

## 2. Registration Flow

### Test Scenario
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 2.1 | Open link `t.me/bot?start=invite_INVALID` | "Ссылка недействительна" | [ ] |
| 2.2 | Open valid invite link | "Добро пожаловать! Введите ваше имя" | [ ] |
| 2.3 | Enter name < 2 chars | Error: "Имя должно быть от 2 до 50 символов" | [ ] |
| 2.4 | Enter name > 50 chars | Error: "Имя должно быть от 2 до 50 символов" | [ ] |
| 2.5 | Enter valid name (3-50 chars) | "Регистрация завершена!" + Main menu | [ ] |
| 2.6 | Re-open used invite link | "Ссылка уже использована" | [ ] |

---

## 3. Operator Role

### Main Menu
| # | Button | Expected Result | Status |
|---|--------|-----------------|--------|
| 3.1 | "Отметить сбор" | Machine selection screen | [ ] |
| 3.2 | "Поиск автомата" | Search input prompt | [ ] |
| 3.3 | "Мои сборы" | Today's collections list | [ ] |
| 3.4 | "Помощь" | Help text for operator | [ ] |

### Collection Flow
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 3.5 | Select machine from list | Date selection menu | [ ] |
| 3.6 | Click "Сейчас" | Confirmation screen with current time | [ ] |
| 3.7 | Click "Сегодня (другое время)" | Time input prompt (HH:MM) | [ ] |
| 3.8 | Click "Вчера" | Confirmation with yesterday's date | [ ] |
| 3.9 | Click "Другая дата" | Full date input prompt | [ ] |
| 3.10 | Enter invalid time format | Error message with format examples | [ ] |
| 3.11 | Enter future date | "Нельзя указать дату в будущем" | [ ] |
| 3.12 | Enter valid date | Confirmation screen | [ ] |
| 3.13 | Click "Подтвердить" | "Сбор зарегистрирован!" | [ ] |
| 3.14 | Click "Отмена" | Return to main menu | [ ] |

### Duplicate Collection Check
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 3.15 | Create collection for same machine same day | Warning: "уже есть сбор" with options | [ ] |
| 3.16 | Click "Да, создать" on duplicate warning | Collection created | [ ] |

### Machine Search
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 3.17 | Search with < 2 chars | Error: "минимум 2 символа" | [ ] |
| 3.18 | Search existing machine code | List with matching machines | [ ] |
| 3.19 | Search non-existing | "Ничего не найдено" + "Создать новый" | [ ] |
| 3.20 | Select found machine (approved) | Date selection screen | [ ] |
| 3.21 | Select found machine (pending) | "ещё не подтверждён администратором" | [ ] |

### Machine Creation
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 3.22 | Click "Создать новый" | Code input prompt | [ ] |
| 3.23 | Enter existing code | "Автомат с кодом уже существует" | [ ] |
| 3.24 | Enter new valid code | Name input prompt | [ ] |
| 3.25 | Enter valid name | "Автомат создан! Ожидает подтверждения" | [ ] |
| 3.26 | Admin receives notification | Notification with approve/reject buttons | [ ] |

---

## 4. Manager Role

### Main Menu
| # | Button | Expected Result | Status |
|---|--------|-----------------|--------|
| 4.1 | "Принять инкассацию" | Pending collections list | [ ] |
| 4.2 | "Поиск автомата" | Search input prompt | [ ] |
| 4.3 | "Веб-панель" | Frontend URL | [ ] |
| 4.4 | "Помощь" | Help text for manager | [ ] |

### Receiving Collections
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 4.5 | No pending collections | "Нет ожидающих приёма" | [ ] |
| 4.6 | Click pending collection | Amount input prompt | [ ] |
| 4.7 | Enter invalid amount (0 or negative) | Error: "корректную сумму" | [ ] |
| 4.8 | Enter amount > 1 billion | Error: "не может превышать" | [ ] |
| 4.9 | Enter valid amount | "Инкассация принята!" | [ ] |

---

## 5. Admin Role

### Main Menu
| # | Button | Expected Result | Status |
|---|--------|-----------------|--------|
| 5.1 | "Принять инкассацию" | Pending collections list | [ ] |
| 5.2 | "Модерация" | Pending machines list | [ ] |
| 5.3 | "Пригласить" | Role selection | [ ] |
| 5.4 | "Настройки" | Bot settings menu | [ ] |
| 5.5 | "Веб-панель" | Frontend URL | [ ] |
| 5.6 | "Помощь" | Help text for admin | [ ] |

### Invite Creation
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 5.7 | Click "Оператор" | Invite link generated | [ ] |
| 5.8 | Click "Менеджер" | Invite link generated | [ ] |
| 5.9 | Invite link is clickable | Opens bot with invite code | [ ] |
| 5.10 | "Новая ссылка" button | New invite generated | [ ] |

### Machine Moderation
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 5.11 | No pending machines | "Нет автоматов на модерации" | [ ] |
| 5.12 | Click pending machine | Machine details + approve/reject | [ ] |
| 5.13 | Click "Подтвердить" | "Автомат подтверждён" | [ ] |
| 5.14 | Creator receives approval notification | "Ваш автомат подтверждён!" | [ ] |
| 5.15 | Click "Отклонить" | "Автомат отклонён" | [ ] |
| 5.16 | Creator receives rejection notification | "Ваш автомат отклонён" | [ ] |

### Bot Settings
| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 5.17 | Click "Изменить картинку" | Upload/URL prompt | [ ] |
| 5.18 | Send photo directly | "Картинка установлена!" | [ ] |
| 5.19 | Send URL (https://...) | "Изображение обновлено!" | [ ] |
| 5.20 | Send invalid URL | Error with format hint | [ ] |
| 5.21 | Click "Предпросмотр" | Welcome screen preview | [ ] |
| 5.22 | Click "Сбросить" | "Картинка сброшена" | [ ] |

---

## 6. User Settings

| # | Action | Expected Result | Status |
|---|--------|-----------------|--------|
| 6.1 | Click "Помощь" → "Настройки" | User settings screen | [ ] |
| 6.2 | Shows user name and role | Correct data displayed | [ ] |
| 6.3 | Click "Деактивировать" | Confirmation warning | [ ] |
| 6.4 | Click "Да, деактивировать" | "Аккаунт деактивирован" | [ ] |
| 6.5 | Try to use bot after deactivation | "Ваш аккаунт деактивирован" | [ ] |

---

## 7. Edge Cases

| # | Test | Expected Behavior | Status |
|---|------|-------------------|--------|
| 7.1 | Session timeout (idle) | Graceful return to menu | [ ] |
| 7.2 | Invalid UUID in callback | Error message, not crash | [ ] |
| 7.3 | Deleted machine during selection | "Автомат не найден" | [ ] |
| 7.4 | Network error during operation | Readable error message | [ ] |
| 7.5 | Concurrent operations | No data corruption | [ ] |

---

## 8. Visual/UX Check

| # | Check | Status |
|---|-------|--------|
| 8.1 | All buttons have icons | [ ] |
| 8.2 | Consistent message formatting | [ ] |
| 8.3 | Markdown renders correctly | [ ] |
| 8.4 | Button layout is intuitive | [ ] |
| 8.5 | Back navigation works everywhere | [ ] |
| 8.6 | Error messages are helpful | [ ] |
| 8.7 | Success messages are clear | [ ] |

---

## Test Results Summary

| Category | Passed | Failed | Total |
|----------|--------|--------|-------|
| Welcome Screen | | | 3 |
| Registration | | | 6 |
| Operator | | | 26 |
| Manager | | | 9 |
| Admin | | | 22 |
| User Settings | | | 5 |
| Edge Cases | | | 5 |
| Visual/UX | | | 7 |
| **TOTAL** | | | **83** |

---

## Notes

_Add any issues found during testing here:_

1.
2.
3.

---

## Sign-off

- Tester: ________________
- Date: ________________
- Version: ________________
