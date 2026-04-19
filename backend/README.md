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
- `npm run seed:basic-types` — создать/обновить базовый MVP-каталог типов нод в БД (`Tool` + `NodeType`).

Prisma / миграции

- `npm run prisma:generate` — сгенерировать Prisma Client.
- `npm run prisma:migrate` — для локальной разработки: создаст новую миграцию и применит её к dev-базе (интерактивно по умолчанию).
- `npm run prisma:deploy` — применяет уже сгенерированные миграции без интерактивности (используйте в CI/production).
- `npm run prisma:push` — синхронизировать БД с `schema.prisma` без истории миграций (быстро, но не для prod).
- `npm run prisma:reset` — **опасная** команда: сбрасывает и пересоздаёт dev-базу (удаляет все данные). Использовать только в dev.
- `npm run prisma:studio` — открыть Prisma Studio для просмотра данных (локально).

Интеграционные тесты

- `npm run test:integration` — выполнит `backend/scripts/integration-test.mjs`, который пробегает по хэппи-патам основного API (создание user/project/agent/dataset/document/tool/metric/export/refresh-token, затем часть CRUD и негативный кейс).
- `npm run test:rag` (или `npm run test:rag:smoke`) — быстрый smoke для RAG-сценария (1 вопрос, мягкий режим для внешнего LLM-провайдера).
- `npm run test:rag:e2e` (или `npm run test:rag:e2e:full`) — полный длительный RAG e2e (4 вопроса, полный пайплайн инструментов), запускать отдельно когда нужен полный прогон.
- `npm run test:rag:e2e:realistic` — RAG e2e в realistic-профиле: без подмешивания `chunks/vectors/candidates/context_bundle/answer` в `input_json` (промежуточные данные собираются цепочкой ToolNode во время исполнения).
- `npm run test:agent:e2e` — автономный AgentCall e2e (граф `ManualInput -> ToolNode* -> AgentCall`, плюс ребра `ToolNode -> AgentCall`): проверяет внутренний tool-calling loop внутри AgentCall только на edge-derived инструментах.

Strict OpenRouter recipe (PowerShell)

- Для strict-прогонов используйте только свежий backend-процесс: старый процесс может не содержать последние изменения по provenance `contract_output`.
- Проверка свежего процесса перед запуском strict RAG:

```powershell
$payload = @{ tool = @{ name = 'DocumentLoader' }; contract = @{ name = 'DocumentLoader' }; input = @{ contract_input = @{ dataset_id = 1 } } } | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/tool-executor/contracts' -ContentType 'application/json' -Body $payload -TimeoutSec 10 | ConvertTo-Json -Depth 8
```

- В ответе должны присутствовать поля `contract_output_source` и `contract_output`.

- Strict AgentCall e2e (bounded retries):

```powershell
$attempts = 3; $ok = $false
for ($i = 1; $i -le $attempts; $i++) {
	Write-Host "[outer-agent-3000] attempt $i/$attempts"
	$env:BASE_URL='http://localhost:3000'
	$env:AGENT_E2E_MODEL='openrouter/elephant-alpha'
	$env:AGENT_E2E_STRICT_OPENROUTER='1'
	$env:AGENT_E2E_FORCE_HEALTH_EXECUTOR='0'
	$env:AGENT_E2E_STRICT_RETRIES='3'
	$env:AGENT_E2E_STRICT_RETRY_DELAY_MS='1200'
	$env:AGENT_E2E_HTTP_TIMEOUT_MS='15000'
	npm run test:agent:e2e
	if ($LASTEXITCODE -eq 0) { $ok = $true; break }
}
if (-not $ok) { exit 1 }
```

- Strict RAG smoke (bounded retries):

```powershell
$attempts = 3; $ok = $false
for ($i = 1; $i -le $attempts; $i++) {
	Write-Host "[outer-rag-3000] attempt $i/$attempts"
	$env:BASE_URL='http://localhost:3000'
	$env:RAG_E2E_AGENT_MODEL='openrouter/elephant-alpha'
	$env:RAG_E2E_STRICT_OPENROUTER='1'
	$env:RAG_E2E_FORCE_HEALTH_EXECUTOR='0'
	$env:RAG_E2E_PROFILE='realistic'
	$env:RAG_E2E_STRICT_RETRIES='3'
	$env:RAG_E2E_STRICT_RETRY_DELAY_MS='1200'
	$env:RAG_E2E_QUESTION_TIMEOUT_MS='120000'
	$env:RAG_E2E_HTTP_TIMEOUT_MS='15000'
	$env:RAG_E2E_MAX_QUESTIONS='1'
	npm run test:rag:smoke
	if ($LASTEXITCODE -eq 0) { $ok = $true; break }
}
if (-not $ok) { exit 1 }
```

Fallback policy (зафиксировано)

- `EXECUTOR_ALLOW_LOCAL_CONTRACT_OUTPUT=0` — обязательное значение по умолчанию для strict/production-like прогонов.
- Локальный synthetic `contract_output` разрешен только как временный debug-инструмент через `EXECUTOR_ALLOW_LOCAL_CONTRACT_OUTPUT=1`.
- Strict-режим (`AGENT_E2E_STRICT_OPENROUTER=1`, `RAG_E2E_STRICT_OPENROUTER=1`) не должен деградировать в soft-success: при отсутствии provider evidence (`model`, `provider_response_id`, положительный usage) тест обязан падать.
- `*_FORCE_HEALTH_EXECUTOR=0` обязателен для strict-проверок provenance контрактов.
- Runtime soft-fallback по провайдеру сохраняется только для non-strict сценариев и локальной диагностики, чтобы не ломать обратную совместимость dev-потока.

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
