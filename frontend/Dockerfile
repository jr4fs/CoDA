# Frontend (Vite SPA) built to static assets, served by Caddy which also
# reverse-proxies /api/* to the Node backend and terminates TLS.
#
# Build context MUST be the repo root (the build pulls in ../common). Build with:
#   docker build -f frontend/Dockerfile -t annotation-web .
#
# VITE_API_URL is intentionally left unset so the SPA talks to the API on the
# same origin ("/api/..."), which Caddy routes to the backend. No domain is
# baked into the bundle.

# ---- build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend
COPY common ./common

# Optional: set to "pilot" to show the pilot banner (see README).
ARG VITE_APP_MODE=
ENV VITE_APP_MODE=${VITE_APP_MODE}

# Default total number of samples pre-filled in the dataset upload form.
ARG VITE_DEFAULT_COVERAGE_SAMPLES=15
ENV VITE_DEFAULT_COVERAGE_SAMPLES=${VITE_DEFAULT_COVERAGE_SAMPLES}

RUN cd frontend && npm run build

# ---- runtime stage ----
FROM caddy:2-alpine
COPY --from=build /app/frontend/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
