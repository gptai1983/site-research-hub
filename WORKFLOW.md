# Как работает система Hermes Site Research Hub

## Общий процесс

```
User → Frontend → tRPC → Backend → Hermes/Playwright → Browser
                    ↓
                  SQLite
```

---

## 1. Создание профиля

**Шаг 1:** Пользователь создаёт профиль в UI (Profiles → Create Profile)

```
Frontend: profiles.create({ name, url, credentials })
    ↓
Backend: createProfile() → шифрует credentials (AES-256-GCM)
    ↓
SQLite: INSERT INTO profiles
    ↓
Frontend: отображает профиль в списке
```

**Данные профиля:**
- name: Название сайта
- url: URL для исследования
- credentials: JSON с username/password (зашифрован)

---

## 2. Запуск исследования

**Шаг 2:** Пользователь выбирает профиль и запускает исследование

```
Frontend: 
  1. sessions.create({ profileId, prompt, url? })
  2. sessions.start({ sessionId })
  
Backend:
  1. createSession() → создаёт запись в БД
  2. selectProvider(prompt) → выбирает AI провайдера
     - код → OpenCode Zen (big-pickle)
     - картинка → Gemini (1.5-flash)
     - остальное → Groq (llama-3.3)
  3. executeResearchTaskStream()
```

**Выбор провайдера:**
```
prompts с "код", "python", "js" → OpenCode Zen
prompts с "картинка", "скриншот", "image" → Gemini
иначе → Groq
```

---

## 3. Выполнение задачи Hermes Agent

**Шаг 3:** Backend запускает Hermes CLI

```typescript
// hermesService.ts
const hermes = spawn('hermes', ['agent', 'run', '--model', modelToUse, prompt]);
```

**Hermes Agent:**
1. Принимает задачу от Backend
2. Анализирует URL через браузер (если требуется)
3. Выполняет исследование с использованием выбранного AI
4. Возвращает результат в stdout

**Fallback при ошибках:**
- 429 (rate limit) → следующий провайдер в цепочке
- 5xx (server error) → следующий провайдер
- Успех → возврат результата

---

## 4. Real-time логи через SSE

**Шаг 4:** Пользователь видит логи в реальном времени

```
Backend:
  executeResearchTaskStream() → отправляет данные в callback
    ↓
  sendSSE(sessionId, { type: 'log', message: data })

Frontend:
  EventSource('/sse/' + sessionId)
    ↓
  useSSE() hook → обновляет UI
```

**Логи:**
- Подключение к SSE
- Выбор провайдера
- Вывод Hermes Agent
- Ошибки (красным)
- Завершение (зелёным)

---

## 5. Сохранение результата

**Шаг 5:** Результат сохраняется в БД

```typescript
// При завершении
saveSessionResult(sessionId, result);

// При ошибке
saveSessionResult(sessionId, null, errorMessage);
```

**Поля сессии:**
- status: pending → running → completed/error
- provider: groq/opencode-zen/gemini
- model: выбранная модель
- result: результат исследования
- error: сообщение об ошибке

---

## 6. Вход на сайт с сохранением cookies

**Дополнительно:** Профиль с credentials

```typescript
// Backend
profiles.login({ id: profileId })
  → getProfile() → decrypt(credentials)
  → loginToSite({ url, username, password })
  → page.context().cookies()
  → updateProfileCookies()
```

**Cookies сохраняются:**
- В поле `cookies` таблицы profiles
- Используются при следующих запросах через Playwright

---

## 7. Batch обработка (несколько задач)

```typescript
// Backend
batch.run({ batchId, tasks: [{ profileId, prompt, url }] })
  → for each task:
    → createSession()
    → executeResearchTaskStream()
    → sendSSE(batchId, progress)
```

**Прогресс отправляется в SSE:**

```json
{
  "type": "batch_progress",
  "total": 5,
  "completed": 2,
  "failed": 0
}
```

---

## 8. Планировщик (Scheduler)

```typescript
// Создание задачи
scheduler.create({ profileId, prompt, schedule: 'daily' })
  → createScheduledTask() → в память
  → запускается через 1 минуту
```

**Интервалы:**
- hourly: каждый час
- daily: каждый день
- weekly: каждую неделю

---

## 9. Webhooks (уведомления)

```typescript
// Создание webhook
webhooks.create({ url, events: ['session.complete'] })

// При событии
notifyEvent('session.complete', { sessionId, result })
  → для каждого webhook с этим событием
  → POST запрос на url
```

---

## 10. Экспорт отчётов

```typescript
// Сессии
export.sessions({ profileId, format: 'json' })
  → exportSessions() → JSON/CSV/Markdown файл

// Отдельная сессия
export.session({ sessionId, format: 'markdown' })
  → exportSessionReport() → файл
```

---

## Health Checks

**Простой:**
```
GET /health → { status: "healthy" }
```

**Детальный:**
```
GET /health/detailed
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "rateLimiter": { "totalKeys": 5, "activeWindows": 2 },
    "scheduler": { "running": true, "tasks": 3 },
    "webhooks": { "total": 2, "enabled": 1 }
  }
}
```

---

## Rate Limiting

```
100 запросов в минуту на IP
```

**Заголовки ответа:**
- X-RateLimit-Limit: 100
- X-RateLimit-Remaining: 85
- X-RateLimit-Reset: 1699999999

---

## Graceful Shutdown

При SIGTERM/SIGINT:
1. Сохраняет SQLite (saveDb())
2. Закрывает браузер (closeBrowser())
3. Останавливает scheduler
4. Закрывает сервер

---

## Диаграмма процесса

```
┌─────────────┐
│   User     │
└──────┬──────┘
       │ 1. create profile
       ▼
┌─────────────┐     2. start session
│  Frontend   │──────────┐
└──────┬──────┘          │
       │                 ▼
       │           ┌─────────────┐
       │◄──────────│   Backend   │
       │           └──────┬──────┘
       │                  │ 3. select provider
       │                  ▼
       │           ┌─────────────┐
       │           │  AI Router  │
       │           │ Groq→OpenCode│
       │           │ →Gemini      │
       │           └──────┬──────┘
       │                  │ 4. execute
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│   UI + SSE  │◄───│ Hermes CLI  │
└─────────────┘    └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Playwright │
                  │   Browser   │
                  └─────────────┘
```

---

## Запуск системы

```bash
# Terminal 1 - Backend
cd D:/гермес
npm run dev
# → http://0.0.0.0:3000

# Terminal 2 - Frontend
cd D:/гермес/frontend
npm run dev
# → http://localhost:5173
```

**Workflow:**
1. Открыть http://localhost:5173
2. Создать профиль (Profiles → Create)
3. Выбрать профиль (Select)
4. Ввести prompt и нажать "Start Research"
5. Наблюдать логи в реальном времени
6. Получить результат в Session History