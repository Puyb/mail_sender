# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-bookworm-slim

# ---- Stage 1: build backend + frontend ----------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Toolchain needed to compile native deps (better-sqlite3) if no prebuilt
# binary matches the target platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY backend backend
COPY frontend frontend
RUN npm run build

# Drop devDependencies (vite, typescript, vue-tsc, tsx, ...) from the
# workspace-hoisted node_modules before copying it into the runtime image.
RUN npm prune --omit=dev

# ---- Stage 2: runtime ------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PORT=3000 \
    DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "backend/dist/index.js"]
