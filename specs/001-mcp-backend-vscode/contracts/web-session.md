# Browser Web Session Contract

Browser refresh credentials are carried only by a backend-set cookie. The
frontend stores the short-lived access token, but it never reads or stores the
refresh credential.

## Cookie

- Name: `brainiac_web_refresh`
- Attributes in production: `HttpOnly; Secure; SameSite=Lax; Path=/auth/web`
- Local Docker exception: `WEB_REFRESH_COOKIE_SECURE=false` may omit `Secure`
  for `http://localhost` development only. Hosted or HTTPS environments must
  leave the cookie secure.
- Value: opaque random refresh token, never a JWT and never exposed in JSON.

## `POST /auth/web/refresh`

Purpose: Rotate a browser refresh session and issue a new access token.

Request:

- Headers: browser sends `Cookie: brainiac_web_refresh=...`
- Body: empty JSON object or no body
- Frontend fetch options: `credentials: include`

Success `200`:

```json
{
  "accessToken": "short-lived-access-token",
  "expiresAt": "2026-05-03T12:00:00.000Z"
}
```

Response headers:

- `Set-Cookie` with a rotated `brainiac_web_refresh` value and the configured
  cookie attributes.

Failure `401`:

```json
{
  "ok": false,
  "code": "WEB_REFRESH_INVALID",
  "message": "web refresh session expired"
}
```

Rules:

- Missing, malformed, expired, revoked, or replayed cookies return `401`.
- Replay of a rotated token returns `401`.
- Failure responses clear the refresh cookie.
- The endpoint must not accept refresh tokens from JSON bodies or URL
  parameters.

## `POST /auth/web/revoke`

Purpose: Revoke the current browser refresh session and clear the cookie.

Request:

- Headers: browser sends `Cookie: brainiac_web_refresh=...`
- Body: empty JSON object or no body
- Frontend fetch options: `credentials: include`

Success `200`:

```json
{
  "revoked": true
}
```

Rules:

- The route is idempotent; missing/unknown cookies still return `200`.
- The response always clears `brainiac_web_refresh`.

## Login And Signup

`POST /auth/login` and `POST /auth/signup` continue returning the existing
access-token JSON and additionally set the `brainiac_web_refresh` cookie.
