#!/bin/sh
set -e

echo "[entrypoint] Starting entrypoint script"

echo "[entrypoint] Generating Prisma client"
npx prisma generate

MAX_ATTEMPTS=10
ATTEMPT=0

until npx prisma migrate deploy; do
  ATTEMPT=$((ATTEMPT+1))
  echo "[entrypoint] prisma migrate deploy failed (attempt $ATTEMPT/$MAX_ATTEMPTS). Retrying in 3s..."
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] Migration failed after $ATTEMPT attempts. Exiting."
    exit 1
  fi
  sleep 3
done

echo "[entrypoint] Migrations applied successfully"

echo "[entrypoint] Starting application"
exec node dist/index.js
