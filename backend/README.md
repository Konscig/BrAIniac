# Backend (TypeScript)

Краткое руководство по запуску, миграциям и тестам для `backend` сервиса.

Файловая структура и важные файлы

- `prisma/schema.prisma` — схема Prisma (источник правды для БД).
- `prisma/migrations/` — сгенерированные миграционные SQL-файлы (закоммичены в репо).
- `src/` — исходники TypeScript (Express + сервисы).
- `scripts/integration-test.mjs` — небольшой интеграционный скрипт для проверки основных CRUD-эндпоинтов.
- `package.json` — npm-скрипты (см. раздел «Скрипты»).

Требования

- Node.js 18+ (локально используйте версию, совместимую с проектом).
- Docker + Docker Compose (для запуска Postgres и среды разработки в контейнерах).

NPM-скрипты (в каталоге `backend`)

- `npm run dev` — запустить сервер в режиме разработки через `ts-node`.
- `npm run build` — скомпилировать TypeScript в `dist/`.
- `npm run start` — запустить скомпилированный сервер (`node dist/index.js`).

Prisma / миграции

- `npm run prisma:generate` — сгенерировать Prisma Client.
- `npm run prisma:migrate` — для локальной разработки: создаст новую миграцию и применит её к dev-базе (интерактивно по умолчанию).
- `npm run prisma:deploy` — применяет уже сгенерированные миграции без интерактивности (используйте в CI/production).
- `npm run prisma:push` — синхронизировать БД с `schema.prisma` без истории миграций (быстро, но не для prod).
- `npm run prisma:reset` — **опасная** команда: сбрасывает и пересоздаёт dev-базу (удаляет все данные). Использовать только в dev.
- `npm run prisma:studio` — открыть Prisma Studio для просмотра данных (локально).

Интеграционные тесты

- `npm run test:integration` — выполнит `backend/scripts/integration-test.mjs`, который пробегает по хэппи-патам основного API (создание user/project/agent/dataset/document/tool/metric/export/refresh-token, затем часть CRUD и негативный кейс).

Примеры команд (PowerShell)

- Запустить dev-сервер локально:

```powershell
cd backend
npm install
npm run dev
```

- Запустить БД и бэкенд через Docker Compose (в корне репо):

```powershell
docker-compose up -d db
# подождите, пока сервис БД не будет healthy
docker-compose up --build -d backend
```

- Применить миграции в CI/production (на хосте с доступом к прод-базе):

```powershell
cd backend
npm ci
npm run prisma:deploy
npm run build
npm run start
```

Автоматизация в Docker

- Для production-образа безопаснее запускать `prisma migrate deploy` из entrypoint или CI перед запуском приложения, а не `migrate dev`.
- Пример entrypoint snippet для Dockerfile (опционально):

```sh
# entrypoint.sh
set -e
npx prisma migrate deploy
node dist/index.js
```

Если нужно, могу добавить `entrypoint.sh` и скорректировать `Dockerfile`/`docker-compose.yaml`.

Если хотите — могу сейчас:

- добавить `entrypoint.sh` и обновить `Dockerfile` так, чтобы в проде выполнялись `prisma migrate deploy` и затем `node dist/index.js`, и/или
- добавить короткий CI job (GitHub Actions) который выполняет `npm ci`, `npm run prisma:deploy` на staging и запускает интеграционные тесты.

Напишите, что сделать первым: добавить entrypoint + Dockerfile правку, или добавить GitHub Actions для миграций и тестов.
