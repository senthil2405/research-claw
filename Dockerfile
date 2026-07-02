# syntax=docker/dockerfile:1

# ---- Builder ----------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

# Prisma needs OpenSSL present to pick the right query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Generate the Prisma client, then build the standalone Next.js server.
RUN npx prisma generate && npm run build

# ---- Runtime ----------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The chat engine spawns the Claude Code CLI; the release step runs Prisma
# migrations. Install both globally so they're on PATH. (Pin prisma to match
# the installed @prisma/client version.)
RUN npm i -g @anthropic-ai/claude-code prisma@6.19.3

# Next.js standalone output: self-contained server + traced node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Schema + migrations for `prisma migrate deploy` (Fly release_command).
COPY --from=builder /app/prisma ./prisma

# NOTE: runs as root for the beta so the app can write the Claude CLI per-user
# config dirs on the mounted Fly volume (/data) without a chown dance. Hardening
# follow-up: drop to a non-root user + chown the volume via an entrypoint.

EXPOSE 3000
CMD ["node", "server.js"]
