#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-file:/app/data/linedev.db}"
mkdir -p /app/data

# Prefer compose/env secret; else reuse volume file; else generate once into volume
if [ -z "${LINEDEV_SESSION_SECRET}" ]; then
  if [ -f /app/data/auth-secret.json ]; then
    # shellcheck disable=SC2016
    LINEDEV_SESSION_SECRET="$(node -e 'try{const j=require("/app/data/auth-secret.json");if(j.secret)process.stdout.write(String(j.secret))}catch(e){}')"
    export LINEDEV_SESSION_SECRET
  fi
fi
if [ -z "${LINEDEV_SESSION_SECRET}" ]; then
  LINEDEV_SESSION_SECRET="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  export LINEDEV_SESSION_SECRET
  node -e 'const fs=require("fs");fs.writeFileSync("/app/data/auth-secret.json",JSON.stringify({secret:process.env.LINEDEV_SESSION_SECRET,createdAt:new Date().toISOString()},null,2));'
  echo "[entrypoint] generated LINEDEV_SESSION_SECRET into /app/data/auth-secret.json"
fi

echo "[entrypoint] prisma db push..."
npx prisma db push --skip-generate

echo "[entrypoint] starting next on 0.0.0.0:3456"
exec npx next start -H 0.0.0.0 -p 3456
