# Функционал Hermes Site Research Hub

## Содержание

1. [AI Провайдеры и маршрутизация](#1-ai-провайдеры-и-маршрутизация)
2. [Browser Automation](#2-browser-automation)
3. [Профили и сессии](#3-профили-и-сессии)
4. [Real-time логи](#4-real-time-логи)
5. [Batch обработка](#5-batch-обработка)
6. [Планировщик](#6-планировщик)
7. [Webhooks](#7-webhooks)
8. [Экспорт данных](#8-экспорт-данных)
9. [Безопасность](#9-безопасность)
10. [Мониторинг](#10-мониторинг)
11. [Rate Limiting](#11-rate-limiting)

---

## 1. AI Провайдеры и маршрутизация

### Поддерживаемые провайдеры

| Провайдер | Модель | Назначение |
|-----------|--------|------------|
| **Groq** | llama-3.3-70b-versatile | Чат, анализ текста, роутинг |
| **Groq** | llama-3.1-8b-instant | Быстрые запросы |
| **OpenCode Zen** | big-pickle | Код, скрипты, сложные задачи |
| **OpenCode Zen** | minimax-m2.5-free | Бесплатные запросы |
| **Google Gemini** | gemini-1.5-flash | Изображения, Vision, OCR |

### Автоматический выбор

Система анализирует prompt и выбирает оптимальный провайдер:

```
код / python / js / script / generate → OpenCode Zen
картинка / скриншот / image / vision → Gemini
остальное → Groq
```

### Fallback (автопереключение)

При ошибке система автоматически переключает провайдер:

```
Groq → 429/5xx → OpenCode Zen → 429/5xx → Gemini → error
```

**Код:** `src/lib/aiRouter.ts`

---

## 2. Browser Automation

### Возможности

- Навигация по URL
- Заполнение форм
- Клики и ожидания
- Скриншоты страниц
- Извлечение контента (title, links, images)
- Сохранение cookies

### Функции

```typescript
// Переход по URL
browser.navigate({ url: 'https://example.com' })

// Вход на сайт с сохранением cookies
profiles.login({ id: profileId })

// Скриншот страницы
takeScreenshot(page, 'screenshot.png')

// Извлечение данных
scrapePage(page) → { title, url, content, links, images }
```

**Код:** `src/lib/browserService.ts`

---

## 3. Профили и сессии

### Профили (profiles)

Создание профиля сайта для исследований:

```typescript
// Создать профиль
profiles.create({
  name: 'My Site',
  url: 'https://example.com',
  credentials: '{"username":"user","password":"pass"}'
})

// Войти и сохранить cookies
profiles.login({ id: profileId })

// Удалить профиль
profiles.delete({ id: profileId })
```

**Поля профиля:**
- name: Название
- url: URL сайта
- credentials: Логин/пароль (зашифровано)
- cookies: Сессия браузера

### Сессии (sessions)

Отслеживание исследования:

```typescript
// Создать сессию
sessions.create({
  profileId: 1,
  prompt: 'Получи заголовок сайта',
  url: 'https://example.com'
})

// Запустить выполнение
sessions.start({ id: sessionId })

// Получить результат
sessions.get({ id: sessionId })
```

**Статусы:** `pending` → `running` → `completed` / `error`

**Код:** `src/api/router.ts` (profiles, sessions)

---

## 4. Real-time логи

### SSE (Server-Sent Events)

Мгновенная передача логов без polling:

```
GET /sse/{sessionId}
```

**События:**
- `connected` - Подключено
- `log` - Лог сообщение
- `error` - Ошибка
- `complete` - Завершено

### Frontend

```typescript
const { messages, connected } = useSSE(sessionId);

// Авто-обновление списка
refetchInterval: autoRefresh ? 3000 : false
```

**Код:** 
- Backend: `src/lib/sse.ts`, `src/index.ts`
- Frontend: `frontend/src/lib/sse.ts`

---

## 5. Batch обработка

Запуск нескольких исследований одновременно:

```typescript
batch.run({
  batchId: 'batch-123',
  tasks: [
    { profileId: 1, prompt: 'Задача 1', url: 'https://a.com' },
    { profileId: 2, prompt: 'Задача 2', url: 'https://b.com' },
    { profileId: 3, prompt: 'Задача 3', url: 'https://c.com' }
  ]
})
```

**Ответ:**
```json
{
  "total": 3,
  "completed": 1,
  "failed": 0,
  "results": [
    { "sessionId": 1, "status": "completed", "result": "..." },
    { "sessionId": 2, "status": "running" },
    { "sessionId": 3, "status": "pending" }
  ]
}
```

**Код:** `src/lib/batchRunner.ts`

---

## 6. Планировщик (Scheduler)

Автоматический запуск задач по расписанию:

```typescript
// Создать задачу
scheduler.create({
  profileId: 1,
  prompt: 'Ежедневный отчёт',
  schedule: 'daily'  // hourly | daily | weekly
})

// Список задач
scheduler.list()

// Удалить задачу
scheduler.delete({ id: 'task_123' })

// Включить/выключить
scheduler.toggle({ id: 'task_123', enabled: false })
```

**Интервалы:**
- hourly: каждый час
- daily: каждый день в то же время
- weekly: каждую неделю

**Код:** `src/lib/scheduler.ts`

---

## 7. Webhooks

HTTP уведомления при событиях:

```typescript
// Создать webhook
webhooks.create({
  url: 'https://my-server.com/webhook',
  events: ['session.complete', 'session.error'],
  secret: 'my-secret-key'  // опционально
})

// Тестирование
webhooks.test({ url: 'https://my-server.com/test' })
```

**События:**
- `session.start` - Начало сессии
- `session.complete` - Успешное завершение
- `session.error` - Ошибка
- `batch.complete` - Batch завершён
- `scheduler.task` - Задача выполнена

**Подпись:** HMAC-SHA256 в заголовке `X-Webhook-Signature`

**Код:** `src/lib/webhooks.ts`

---

## 8. Экспорт данных

Экспорт сессий и отчётов:

```typescript
// Все сессии
export.sessions({ format: 'json' })  // json | csv | markdown

// Одна сессия
export.session({ sessionId: 1, format: 'markdown' })
```

**Форматы:**
- JSON: Машиночитаемый
- CSV: Для Excel
- Markdown: Человекочитаемый

**Код:** `src/lib/export.ts`

---

## 9. Безопасность

### Шифрование credentials

AES-256-GCM для паролей:

```typescript
encrypt('{"username":"user","password":"pass"}')
// → "iv:tag:encrypted"

decrypt(encrypted)
// → '{"username":"user","password":"pass"}'
```

### Rate Limiting

100 запросов в минуту на IP:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1699999999
```

При превышении: `429 Too Many Requests`

**Код:** `src/lib/rateLimiter.ts`

### Graceful Shutdown

При SIGTERM/SIGINT:
1. Сохранить SQLite
2. Закрыть браузер
3. Остановить scheduler
4. Закрыть сервер

**Код:** `src/index.ts`

---

## 10. Мониторинг

### Health Checks

```bash
GET /health                    # Простой
GET /health/detailed           # Все сервисы

# Ответ
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "rateLimiter": { "totalKeys": 5 },
    "scheduler": { "running": true, "tasks": 2 },
    "webhooks": { "total": 1, "enabled": 1 }
  }
}
```

### Метрики

```typescript
metrics.get({ profileId?: number })

# Ответ
{
  "total": 100,
  "completed": 85,
  "failed": 10,
  "running": 5,
  "avgDuration": 45.2,
  "totalTokens": 1500000
}
```

### Логи

```bash
GET /logs?level=ERROR&limit=50
```

---

## 11. Rate Limiting

### Конфигурация

- Лимит: 100 запросов/минута
- Окно: 60 секунд
- Ключ: IP адрес

### Кэш

In-memory кэш с автоматической очисткой:

```typescript
setCache('key', data, ttl=300000)  // 5 минут
getCache('key')                    // получить или null
```

**Код:** `src/lib/cache.ts`

---

## API Endpoints полный список

### REST

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/` | GET | Статус API |
| `/health` | GET | Health check |
| `/health/detailed` | GET | Детальный статус |
| `/status` | GET | Статус провайдеров |
| `/logs` | GET | Логи приложения |
| `/rate-limit-stats` | GET | Статистика rate limiting |
| `/sse/:sessionId` | GET | SSE поток |

### tRPC

| Router | Procedure | Описание |
|--------|------------|-----------|
| `profiles` | list | Список профилей |
| `profiles` | create | Создать профиль |
| `profiles` | login | Войти на сайт |
| `profiles` | delete | Удалить профиль |
| `sessions` | list | Список сессий |
| `sessions` | create | Создать сессию |
| `sessions` | start | Запустить |
| `sessions` | get | Получить |
| `sessions` | logs | Логи |
| `browser` | navigate | Перейти по URL |
| `browser` | close | Закрыть браузер |
| `metrics` | get | Метрики |
| `batch` | run | Запустить batch |
| `batch` | cancel | Отменить |
| `scheduler` | list | Список задач |
| `scheduler` | create | Создать задачу |
| `scheduler` | delete | Удалить |
| `webhooks` | list | Список webhooks |
| `webhooks` | create | Создать |
| `webhooks` | test | Тест |
| `export` | sessions | Экспорт сессий |
| `export` | session | Экспорт одной |

---

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Backend | Hono + tRPC + Node.js |
| Frontend | React 19 + Vite |
| Database | SQLite (sql.js) |
| Browser | Playwright |
| AI | Groq, OpenCode, Gemini |

---

## Структура файлов

```
src/
├── index.ts              # Server entry
├── api/router.ts         # tRPC routes
├── db/schema.ts          # Database schema
└── lib/
    ├── aiRouter.ts       # AI routing
    ├── browserService.ts # Playwright
    ├── batchRunner.ts    # Batch processing
    ├── cache.ts          # Caching
    ├── encryption.ts     # AES-256-GCM
    ├── export.ts         # Export
    ├── logger.ts         # Logging
    ├── rateLimiter.ts    # Rate limiting
    ├── scheduler.ts      # Scheduler
    ├── sse.ts            # SSE
    └── webhooks.ts       # Webhooks
```