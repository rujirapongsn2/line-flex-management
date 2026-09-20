# Softnix LineDev — multi-stage production image (SQLite + Next.js)
# Uses node:22-alpine (cached locally when Docker Hub bookworm pull times out)
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat ca-certificates
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat ca-certificates
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/linedev.db"
ENV LINEDEV_SESSION_SECRET="build-time-placeholder-change-me"
RUN mkdir -p data \
  && npx prisma generate \
  && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat ca-certificates
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3456
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/app/data/linedev.db"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/lib ./lib
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data

VOLUME /app/data
EXPOSE 3456
ENTRYPOINT ["./docker-entrypoint.sh"]
