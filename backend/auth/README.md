# Example JWT Auth API

API для аутентификации и обновления JWT токенов (access и refresh) на Go с использованием Gin и GORM.

---

## Описание

Данный сервис предоставляет REST API для:

- Логина пользователя с выдачей пары токенов (access и refresh)
- Обновления токенов по refresh токену
- Получения информации о пользователе по access токену
- Выхода пользователя (логаут)

---

## Технологии

- Go (Golang)
- Gin Web Framework
- GORM ORM (PostgreSQL)
- JWT (github.com/golang-jwt/jwt/v5)
- bcrypt для хеширования паролей и refresh токенов
- UUID (github.com/gofrs/uuid/v5)
- godotenv для загрузки переменных окружения

---

## Установка и запуск

### ВНИМАНИЕ:  Swagger генерируется при сборке проекта!

1. Для корректной работы вам необходим установленный и обновленный Docker на вашем устройстве.
2. Склонируйте репозиторий: `git clone https://github.com/Konscig/test-backend.git`
3. Перейдите в директорию проекта: `cd test-backend`
4. Создайте файл `.env` в корне проекта и заполните его по примеру `.env.example`
5. Запустите проект: `docker-compose -f docker-compose.yml up -d`
6. Заполните БД данными `psql -U user -d dbname` (учтите, что bcrypt пароля вам необходимо будет создать самому, например здесь: `https://gchq.github.io/CyberChef/#recipe=Bcrypt(10)`)
7. Перейдите на эндпоинт `/swagger/index.html#/` для просмотра документации и выполнения тестовых запросов.

P.S. Для БД можете взять мои креды ('Kostya', '$2a$10$NG8hmCmX8nBKVmQdaashIeFbZoSFL.d.UcHchQViUk9mMUT8UUS6G' <- это bcrypt пароль '1234').
---

## `main.go`

### `DatabaseMiddleware(db *gorm.DB) gin.HandlerFunc`

Создаёт middleware для Gin, которое устанавливает соединение с базой данных в контекст запроса.

Параметры:

- `db` — указатель на объект `*gorm.DB` (соединение с базой данных).

Возвращает:

- `gin.HandlerFunc` — middleware, который добавляет объект базы данных в контекст с ключом "db".

---

### `extractBearerToken(c *gin.Context) (string, error)`

Извлекает `Bearer` токен из заголовка `Authorization` HTTP-запроса.

Параметры:

- `c` — указатель на контекст Gin (`*gin.Context`).

Возвращает:

- Строку токена (без префикса `"Bearer "`).
- Ошибку, если заголовок отсутствует или имеет неправильный формат.

---

### `CheckTokenMiddleware(tokenType string) gin.HandlerFunc`

Создаёт middleware, которое проверяет JWT токен определённого типа (`"access"` или `"refresh"`).

Параметры:

- `tokenType` — строка, тип токена (`"access"` или `"refresh"`).

Возвращает:

- `gin.HandlerFunc`, который:
  - Извлекает токен из заголовка `Authorization`.
  - Валидирует токен.
  - Устанавливает в контекст `userID` и `tokenType`.
  - Для `refresh`-токена дополнительно ищет токен в базе данных и устанавливает его в контекст.
  - При невалидном или просроченном токене возвращает ошибку `401 Unauthorized`.

---

### `NotRevokedTokenMiddleware() gin.HandlerFunc`

Создаёт middleware, которое проверяет, что access-токен не был отозван.

Проверяет, что время выпуска токена (`iat`) не раньше времени `TokenValidAfter` пользователя из базы данных.

Если токен отозван или пользователь не найден — возвращает ошибку `401 Unauthorized`.

Если проверка успешна — добавляет пользователя в контекст.

---

### `generateTokens(userID uuid.UUID) (string, string, []byte, error)`

Создаёт пару `access` и `refresh` токенов для пользователя с заданным `userID`.

Логика:

- Формирует `access` токен.
- Формирует `refresh` токен.
- Кодирует `refresh` токен в `base64`.
- Хэширует `SHA256` и затем `bcrypt` для безопасного хранения в базе данных.

Параметры:

- `userID` — идентификатор пользователя (`uuid.UUID`).

Возвращает:

- `accessToken` — строка JWT access токена.
- `refreshTokenB64` — base64-кодированный refresh токен.
- `refreshHash` — bcrypt-хэш SHA256-образа refresh токена.
- `err` — ошибка, если что-то пошло не так.
---
### `postLogin(c *gin.Context)`

Обрабатывает вход пользователя и выдачу токенов.

Логика:

- Принимает `username` и `password` в JSON теле запроса.
- Проверяет правильность данных.
- Генерирует `access` и `refresh` токены.
- Сохраняет хэш `refresh` токена в базе данных.
- Возвращает токены клиенту.
---
### `postRefresh(c *gin.Context)`

Обрабатывает обновление токенов (refresh).

Логика:

- Принимает `refresh` токен в заголовке `Authorization`.
- Проверяет его валидность и соответствие в базе.
- Генерирует новую пару `access` и `refresh` токенов.
- Истекающий (старый) `refresh` токен помечается как просроченный.
- Возвращает новые токены клиенту.
---
### `getUserId(c *gin.Context)`

Защищённый маршрут, возвращает ID пользователя, извлечённый из access токена.

Параметры:

- `c` — контекст Gin (`*gin.Context`).

Возвращает:
- JSON с ключом `userid`.
---
### `postLogout(c *gin.Context)`

Обрабатывает выход пользователя из системы.

**Логика:**

- Извлекает `refresh` токен из заголовка `Authorization`.
- Ищет соответствующий токен в базе данных.
- Помечает `refresh` токен как просроченный (revoked).
- Возвращает статус успешного выхода (обычно HTTP 204 No Content).

---
## `tokengen.go`
### `generateAccessToken(userID string) (string, error)`

Генерирует JWT access токен доступа для указанного пользователя.

Параметры:

- `userID` — идентификатор пользователя (UUID строка).

Возвращает:

- `string` — сгенерированный JWT access токен.
- `error` — ошибка при генерации токена.

---

### `generateRefreshToken(userID string, exp int64) (string, error)`

Генерирует JWT refresh токен доступа для указанного пользователя.

Параметры:

- `userID` — идентификатор пользователя (UUID строка).
- `exp` — время истечения срока действия токена (Unix timestamp).

Возвращает:

- `string` — сгенерированный JWT refresh токен.
- `error` — ошибка при генерации токена.

---

### `checkToken(tokenString string, tokenType string) (*jwt.Token, error)`

Проверяет валидность JWT токена и его тип.

Параметры:

- `tokenString` — строка токена.
- `tokenType` — ожидаемый тип токена (`"access"` или `"refresh"`).

Возвращает:

- `*jwt.Token` — объект токена, если он валиден и имеет правильный тип.
- `error` — ошибка при неверном токене или неправильном типе.

---

### `extractSub(token *jwt.Token) (uuid.UUID, error)`

Извлекает идентификатор пользователя (sub) из токена.

Параметры:

- `token` — объект JWT токена.

Возвращает:

- `uuid.UUID` — идентификатор пользователя.
- `error` — ошибка, если поле `sub` отсутствует или невалидно.

---

### `getIat(token *jwt.Token) (time.Time, error)`

Извлекает время создания токена (`iat`) из токена.

Параметры:

- `token` — объект JWT токена.

Возвращает:

- `time.Time` — время создания токена.
- `error` — ошибка, если поле `iat` отсутствует.