#!/bin/sh
set -e

echo "[entrypoint] Starting entrypoint script"

echo "[entrypoint] Generating Prisma client"
npx prisma generate

MAX_ATTEMPTS=10

retry_deploy() {
  i=1
  while [ $i -le $MAX_ATTEMPTS ]; do
    echo "[entrypoint] Running prisma migrate deploy (attempt $i/$MAX_ATTEMPTS)"
    if npx prisma migrate deploy; then
      echo "[entrypoint] Migrations applied successfully"
      return 0
    fi
    i=$((i+1))
    echo "[entrypoint] prisma migrate deploy failed. Retrying in 3s..."
    sleep 3
  done
  echo "[entrypoint] Migration failed after $MAX_ATTEMPTS attempts."
  return 1
}

echo "[entrypoint] Applying migrations (deploy)"

# Try once, capture output to detect specific errors like P3005 (non-empty DB)
set +e
DEPLOY_OUTPUT=$(npx prisma migrate deploy 2>&1)
DEPLOY_EXIT=$?
set -e
echo "$DEPLOY_OUTPUT"

if [ "$DEPLOY_EXIT" -ne 0 ]; then
  echo "[entrypoint] Initial prisma migrate deploy failed with code $DEPLOY_EXIT"
  if echo "$DEPLOY_OUTPUT" | grep -q "P3005"; then
    echo "[entrypoint] Detected Prisma error P3005 (database schema is not empty). Attempting baseline."
    if [ -d "prisma/migrations" ]; then
      for d in prisma/migrations/*; do
        [ -d "$d" ] || continue
        MIGRATION_NAME=$(basename "$d")
        echo "[entrypoint] Baseline: marking migration as applied -> $MIGRATION_NAME"
        # Don't fail the whole script if a single resolve fails; continue to try others
        set +e
        npx prisma migrate resolve --applied "$MIGRATION_NAME"
        RESOLVE_EXIT=$?
        set -e
        if [ "$RESOLVE_EXIT" -ne 0 ]; then
          echo "[entrypoint] Warning: migrate resolve failed for $MIGRATION_NAME (exit $RESOLVE_EXIT), continuing..."
        fi
      done
    else
      echo "[entrypoint] No prisma/migrations directory found to baseline."
    fi

    echo "[entrypoint] Retrying prisma migrate deploy after baselining"
    if npx prisma migrate deploy; then
      echo "[entrypoint] Migrations applied successfully after baselining"
    else
      echo "[entrypoint] prisma migrate deploy still failing after baselining. Falling back to prisma db push."
      if [ "${PRISMA_DB_PUSH_ACCEPT_DATA_LOSS:-0}" = "1" ]; then
        DB_PUSH_FLAGS="--accept-data-loss"
      else
        DB_PUSH_FLAGS=""
      fi
      npx prisma db push $DB_PUSH_FLAGS
      echo "[entrypoint] prisma db push completed"
    fi
  else
    echo "[entrypoint] Non-P3005 error. Assuming DB may not be ready yet; will retry deploy."
    if ! retry_deploy; then
      echo "[entrypoint] prisma migrate deploy failed after retries. Exiting."
      exit 1
    fi
  fi
else
  echo "[entrypoint] Migrations applied successfully"
fi

echo "[entrypoint] Starting application"
exec node dist/index.js
