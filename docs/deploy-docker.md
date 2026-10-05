# Run with Docker (locally)

Bring up the whole stack — SPA, Node BFF, Python ML service, and a throwaway
MongoDB — with one command. This is the closest thing to production on your own
machine. For native hot-reload dev, see [local-dev.md](./local-dev.md); for the
automated AWS deploy, see [deploy-aws.md](./deploy-aws.md).

## Architecture

```
Browser ──HTTP──▶ Caddy ──/api/*──▶ Node BFF ──▶ Python ML service
  (localhost)      │ (static SPA)      │              │
                   └─ serves /srv      └── shared ./data volume ──┘
                                       │              │
                                   MongoDB       OpenRouter / OpenAI
```

Node and Python mount the **same host data dirs** (`./data/*`) so file handoff
between them works exactly as in production.

## Prerequisites

- **Docker** + the Compose plugin (`docker compose version`)
- An **OpenRouter** API key (LLM) and an **OpenAI** key (embeddings), or set
  `EMBEDDINGS_PROVIDER=local` to embed in-process.

## 1. Configure the single `.env`

```bash
cp .env.example .env
```

Set these for the local Docker overlay (which adds a `mongo` service and serves over http):

```bash
DB_CONN_STRING=mongodb://mongo:27017   # the compose Mongo service (NOT localhost)
DATA_DIR=./data
APP_MODE=UI_DEV                        # or DEFAULT for full sampling
ALLOW_SIGNUP=true
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=sk-...
JWT_SECRET=...                         # openssl rand -hex 32
JWT_REFRESH_SECRET=...
```

## 2. Up

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.local.yml up -d --build
```

The `deploy/docker-compose.local.yml` overlay:
- adds a throwaway **MongoDB** container (so you don't need Atlas), and
- serves the app over **plain `http://localhost`** (via `deploy/Caddyfile.local`) so the
  in-app `/demo` service worker works — browsers block service workers on the
  self-signed HTTPS cert.

## 3. Use it

Open **http://localhost** and register an account (signup is on above), or
provision one directly:

```bash
docker compose exec node npx tsx scripts/createUser.ts 'Admin' 'you@example.org' 'password'
```

Collections are created on first write. (For a shared/Atlas database, create the
indexes explicitly with `setup_repo.py` — see [deploy-aws.md](./deploy-aws.md).)

## Operations

- **Logs:** `docker compose logs -f node pybackend caddy`
- **Rebuild after code changes:** re-run the `up -d --build` command (add specific
  services to rebuild just those, e.g. `... up -d --build caddy`).
- **Data** lives in `./data/` (git-ignored); the Mongo container keeps a named volume.
- **Down:** `docker compose -f docker-compose.yml -f deploy/docker-compose.local.yml down`
  (add `-v` to also drop the Mongo volume).

## Deploying this stack to a server

The same `docker-compose.yml` runs on a VM behind Caddy with real TLS. Rather than
wiring that by hand, use the automated Terraform + one-script flow in
[deploy-aws.md](./deploy-aws.md), which provisions the box, renders the server
`.env`, and runs `docker compose up -d --build` for you.
