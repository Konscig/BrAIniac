# Чек-лист деплоя в production

Памятка перед выкладкой проекта на публичный сервер. Текущая `docker-compose.yaml` настроена под локальную разработку — на проде так оставлять нельзя.

## 1. Сетевая изоляция

В `docker-compose.yaml` сейчас наружу торчат: `frontend:3000`, `backend:8080`, `db:5433`, `judge-eval-worker:8001`. На проде должен торчать только nginx (frontend), всё остальное — только внутри Docker сети.

Создать отдельный `docker-compose.prod.yaml` (override) или поправить основной:

```yaml
backend:
  # ports: убрать
  expose:
    - "3000"

db:
  # ports: убрать
  expose:
    - "5432"

judge-eval-worker:
  # ports: убрать
  expose:
    - "8001"

frontend:
  ports:
    - "80:80"
    - "443:443"   # после настройки HTTPS
```

## 2. HTTPS

Без TLS пароли и JWT уйдут открытым текстом. Варианты:

- **Caddy** перед nginx (или вместо) — сам получает Let's Encrypt сертификаты
- **Traefik** — то же самое, чуть сложнее в конфиге
- **nginx + certbot** — классический путь, больше ручной работы

При HTTPS не забыть редирект `http → https`.

## 3. Секреты

В текущем `.env.docker`:

- `JWT_SECRET_KEY=ebat-ya-debil` → заменить на `openssl rand -base64 64`
- `POSTGRES_PASSWORD=postgres` → длинный случайный (32+ символа)
- `POSTGRES_USER=postgres` → переименовать (не дефолт)
- Все API-ключи (OpenRouter, Mistral и т.д.) — отдельные ключи для прода, не из dev

`.env.docker` не должен попадать в git. Проверить `.gitignore`. На сервер класть через `scp` или secret manager.

## 4. Безопасность приложения

- **CORS** — указать конкретный домен фронта, не `*`
- **Rate limiting** на `/auth/login`, `/auth/signup`, `/judge/*` (иначе brute-force и денежные потери на LLM)
- **Helmet** или аналог для HTTP-заголовков (CSP, HSTS, X-Frame-Options)
- **JWT в httpOnly + Secure cookie** вместо localStorage (защита от XSS)
- **Валидация всех body** через zod/joi на каждом эндпоинте
- **Логирование** с маскировкой чувствительных полей (password, token, api_key)

## 5. База данных

- Снять public-доступ к 5432 (см. п.1)
- Backups: `pg_dump` по cron в S3/локально, ретеншн 7-30 дней
- Не использовать `prisma db push --accept-data-loss` на проде. Должно быть `prisma migrate deploy`
- В `.env.docker` для прода: `PRISMA_MIGRATE=deploy`

## 6. Серверный фаервол

На Ubuntu/Debian:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp        # SSH (или поменять порт SSH)
ufw allow 80/tcp        # HTTP (для редиректа)
ufw allow 443/tcp       # HTTPS
ufw enable
```

SSH: отключить парольную аутентификацию, только ключи. `PermitRootLogin no`.

## 7. Мониторинг и алерты

- **Логи**: централизовать (Loki/ELK) или хотя бы `docker compose logs` ротацию
- **Health checks** уже есть в compose — настроить алерт при unhealthy
- **Disk space** мониторинг — HF cache, postgres, docker images растут
- **Sentry** или аналог для ошибок backend/frontend

## 8. CI/CD

- Build образов в CI (GitHub Actions), пуш в registry
- Деплой через `docker compose pull && docker compose up -d`
- Не собирать образы прямо на проде (медленно, занимает место)

## 9. Перед первым выкладыванием

- [ ] `.env.docker` в `.gitignore` и не закоммичен
- [ ] Сгенерированы новые JWT_SECRET_KEY и пароли
- [ ] HTTPS настроен и работает
- [ ] CORS ограничен доменом
- [ ] Rate limiting на auth/judge
- [ ] Только 80/443/22 открыты в фаерволе
- [ ] Backup БД настроен и проверен (восстановление тоже!)
- [ ] `PRISMA_MIGRATE=deploy`, не `db push`
- [ ] Логирование без секретов
