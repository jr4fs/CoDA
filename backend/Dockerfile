# Node/Express backend (BFF).
#
# Build context MUST be the repo root (the backend tsconfig pulls in ../common),
# so build with:  docker build -f backend/Dockerfile -t annotation-backend .
#
# We run via `tsx` (no separate tsc build step) so the TypeScript path alias
# `@common/*` resolves at runtime exactly as it does in dev. Running from
# /app/backend means fileUpload.ts's PROJECT_ROOT (../../../ from src/utils)
# resolves to /app — the same data root the Python service uses, so the two
# containers can share the data dirs via identical bind mounts.
FROM node:20-bookworm-slim

# Build tooling for the native `argon2` module (used for password hashing).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching.
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

# App + shared types.
COPY backend ./backend
COPY common ./common

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "src/index.ts"]
