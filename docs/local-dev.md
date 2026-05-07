# Локальный запуск (без Docker для бэка/фронта)

В Docker крутится только Postgres (опционально — judge-eval-worker). Бэк и фронт запускаются нативно — быстрая итерация, удобный дебаг.

## 0. Однократно

В корне проекта:

```bash
# поднять только базу (порт 5432 — стандартный)
docker compose up -d db
```

В `backend/`:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy        # или npm run prisma:reset для чистой схемы
```

В `frontend/`:

```bash
cd ../frontend
npm install
```

## 1. Переменные окружения

`backend/.env` (создать если нет):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/brainiac-db
JWT_SECRET_KEY=dev-secret-change-me
PORT=3000

# опционально:
# OPENROUTER_API_KEY=...
# MISTRAL_API_KEY=...
# CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

Пользователь/пароль/имя БД должны совпадать с тем, что указано в `.env.docker` для контейнера `db` (по умолчанию `postgres/postgres/brainiac-db`).

## 2. Запуск

В двух терминалах:

```bash
# терминал 1 — backend (Express на :3000)
cd backend
npm run dev
```

```bash
# терминал 2 — frontend (CRA на :3001, проксирует API на :3000)
cd frontend
npm start
```

CRA увидит, что 3000 занят бэкендом, и поднимется на 3001. В `frontend/package.json` стоит `"proxy": "http://localhost:3000"` — все API-запросы из dev-сервера автоматически уходят на бэк, никаких CORS.

Откроется `http://localhost:3001` в браузере.

## 3. Опционально — judge-eval-worker

Питоновский сервис для метрик. Грузит ML-модели, нужен для оценки. Можно поднять в Docker отдельно:

```bash
docker compose --profile app up -d judge-eval-worker
```

Или нативно если есть Python 3.11 + uv/pip:

```bash
cd judge-eval-worker
pip install -r requirements.txt
HF_HOME=./hf_cache uvicorn app.main:app --port 8001
```

## 4. Тесты

Базу для тестов лучше держать в той же docker-postgres (она persistent). Сбросить схему:

```bash
cd backend
npm run prisma:reset
npm run test:db
```

## 5. Полный docker (если когда-нибудь захочется)

```bash
docker compose --profile app up -d --build
# фронт на :3000, backend на :8080, db на :5432
```

`profiles: ["app"]` стоит на backend/frontend/judge-eval-worker — без этого флага поднимается только db.
