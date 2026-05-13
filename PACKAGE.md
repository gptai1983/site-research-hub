# Упаковка и масштабирование Hermes Site Research Hub

## Быстрая сборка (все в одном)

```bash
# Клонировать репозиторий
git clone <repo-url> hermes-hub
cd hermes-hub

# Скопировать .env.example в .env и добавить ключи
cp .env.example .env
# Отредактировать .env с вашими ключами

# Запуск через Docker (рекомендуется)
npm run docker:up

# Или запуск вручную
npm install
npm run dev &
cd frontend && npm install && npm run dev
```

---

## Docker (рекомендуется)

```bash
# Сборка и запуск
npm run docker:up

# Остановка
npm run docker:down

# Логи
npm run docker:logs
```

**Требования:** Docker + Docker Compose

---

## Ручная установка (Windows)

```powershell
# 1. Установить Node.js 20+
# 2. Установить Docker (для Playwright)

# Клонировать
git clone <repo> hermes
cd hermes

# Backend
npm install
npm run dev

# Frontend (новый терминал)
cd frontend
npm install
npm run dev
```

---

## Ручная установка (Linux/Mac)

```bash
# 1. Установить Node.js 20+

# 2. Клонировать
git clone <repo> hermes
cd hermes

# 3. Зависимости
npm install
cd frontend && npm install && cd ..

# 4. Скопировать .env
cp .env.example .env
# Добавить ключи API в .env

# 5. Playwright (опционально)
npx playwright install chromium

# 6. Запуск
npm run dev

# 7. Frontend (новый терминал)
cd frontend && npm run dev
```

---

## Переменные окружения (.env)

```env
GROQ_API_KEY=<ваш ключ>
OPENCODE_API_KEY=<ваш ключ>
GEMINI_API_KEY=<ваш ключ>
```

Ключи получить:
- Groq: https://console.groq.com/
- OpenCode: https://opencode.ai/
- Gemini: https://aistudio.google.com/app/apikey

---

## Структура для масштабирования

```
hermes-hub/
├── docker-compose.yml    # orchestration
├── backend/              # API сервис
├── frontend/             # UI сервис  
└── data.db               # SQLite БД
```

**Горизонтальное масштабирование:**
- несколько инстансов backend за балансировщиком
- общая SQLite / переход на PostgreSQL
- кэш Redis для сессий

---

## Быстрые команды

| Команда | Описание |
|---------|----------|
| `npm run docker:up` | Запуск |
| `npm run docker:down` | Остановка |
| `npm run dev` | Dev режим |
| `npm test` | Тест API |

---

## URLs после запуска

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health: http://localhost:3000/health
- Status: http://localhost:3000/status