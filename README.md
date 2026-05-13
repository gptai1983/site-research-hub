# Hermes Site Research Hub

## Возможности

- 🔐 **Безопасность**: Шифрование учётных данных (AES-256-GCM)
- 🍪 **Cookie Management**: Сохранение сессий браузера
- 🌐 **Browser Automation**: Playwright для навигации и скрапинга
- 🤖 **AI Маршрутизация**: Groq → OpenCode Zen → Gemini с fallback
- 📊 **Real-time**: SSE для live логов
- 📈 **Метрики**: Отслеживание сессий, ошибок и использования токенов
- 📦 **Batch Processing**: Запуск нескольких задач
- ⏰ **Scheduler**: Планировщик задач (hourly/daily/weekly)
- 🔔 **Webhooks**: HTTP уведомления
- 📤 **Export**: Экспорт в JSON/CSV/Markdown
- 🛡️ **Rate Limiting**: 100 req/min на IP
- 💾 **Caching**: In-memory кэш с TTL
- 🔄 **Graceful Shutdown**: Корректное завершение

## Быстрый старт

```bash
# Установка
cd D:/гермес && npm install
cd D:/гермес/frontend && npm install
npx playwright install chromium

# Запуск
npm run dev
```

## API Endpoints

### Health & Status

| Endpoint | Описание |
|----------|----------|
| `GET /health` | Базовый health check |
| `GET /health/detailed` | Детальный статус всех сервисов |
| `GET /status` | Статус AI провайдеров |
| `GET /logs` | Логи приложения |
| `GET /rate-limit-stats` | Статистика rate limiting |

### REST Endpoints

| Endpoint | Описание |
|----------|----------|
| `GET /` | Статус API |
| `GET /sse/:sessionId` | Server-Sent Events |

### tRPC Router

| Router | Procedures |
|--------|------------|
| `profiles` | list, create, login, delete, get |
| `sessions` | list, create, start, get, logs, update |
| `reports` | get |
| `browser` | navigate, close |
| `metrics` | get |
| `batch` | run, cancel, status |
| `scheduler` | list, create, get, delete, toggle, status |
| `webhooks` | list, create, delete, toggle, status, test |
| `export` | sessions, session |

## AI Провайдеры

| Провайдер | Модель | Назначение |
|-----------|--------|------------|
| Groq | llama-3.3-70b-versatile | Чат, роутинг |
| OpenCode Zen | big-pickle | Код, сложные задачи |
| Gemini | gemini-1.5-flash | Изображения, Vision |

## Скрипты

```bash
npm run dev          # Запуск dev сервера
npm run build        # Сборка
npm test             # Тестирование API
npm run docker:up    # Запуск в Docker
npm run docker:down  # Остановка Docker
```

## Docker

```bash
# Сборка и запуск
npm run docker:up

# Остановка
npm run docker:down

# Логи
npm run docker:logs
```

## Архитектура

```
User → Frontend → tRPC → Backend (Hono)
                            ↓
                    Hermes Agent / Playwright
                            ↓
                      Browser Automation
```

## Переменные окружения

```env
GROQ_API_KEY=...
OPENCODE_API_KEY=...
GEMINI_API_KEY=...
LOG_LEVEL=INFO
```