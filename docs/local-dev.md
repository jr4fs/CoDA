# Local development

Run the three services natively (no Docker) with hot reload — best for iterating
on code. For a one-command containerized run, see [deploy-docker.md](./deploy-docker.md).

## Architecture

```
frontend (Vite :5173) ──/api──▶ backend (Node/Express :8080) ──▶ pybackend (FastAPI :8000)
                                        │                              │
                                    MongoDB                     OpenRouter / OpenAI
```

- **frontend** — React + Vite SPA. In dev it targets the backend at `http://localhost:8080` automatically.
- **backend** — Express BFF: auth, tasks, Mongo I/O, file storage, ML proxy.
- **pybackend** — FastAPI: embeddings, coverage/representative sampling, anonymization, LLM calls.

## Prerequisites

- **Node.js 20+** and **Python 3.11+**
- **MongoDB** — a local instance is easiest:
  ```bash
  docker run -d --name mongo -p 27017:27017 mongo:7
  ```
- **API keys** — an [OpenRouter](https://openrouter.ai) key for LLM inference, and
  either an OpenAI key for embeddings or `EMBEDDINGS_PROVIDER=local` (runs mpnet in-process).

## 1. Configure the single `.env`

All three services read the **one** repo-root `.env` (only `VITE_*` vars reach the browser):

```bash
cp .env.example .env
```

Edit `.env`. For native dev, the important values:

```bash
DB_CONN_STRING=mongodb://localhost:27017   # local Mongo
APP_MODE=UI_DEV                            # fast sampling for quick iteration
ALLOW_SIGNUP=true                          # so you can register from the UI
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
EMBEDDINGS_PROVIDER=openai                 # or "local" (no key needed)
OPENAI_API_KEY=sk-...
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
```

## 2. Install dependencies

```bash
# pybackend
cd pybackend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # includes torch (CPU) + the spaCy model
cd ..

# backend
cd backend && npm install && cd ..

# frontend
cd frontend && npm install && cd ..
```

## 3. Create the database collections + indexes (once)

```bash
MONGODB_URI="mongodb://localhost:27017" DB_NAME=annotationTool python setup_repo.py
```

## 4. Run the services (three terminals)

```bash
# 1) pybackend  ->  http://localhost:8000
cd pybackend && source .venv/bin/activate && python main.py

# 2) backend    ->  http://localhost:8080
cd backend && npm run dev

# 3) frontend   ->  http://localhost:5173
cd frontend && npm run dev
```

Open **http://localhost:5173** and register an account (signup is enabled above).

## Notes

- **Single env file.** `backend` and `pybackend` load the repo-root `.env`; Vite reads
  `VITE_*` from it via `envDir`. There are no per-service `.env` files.
- **`APP_MODE=UI_DEV`** skips heavy representative sampling and uses fast random
  sampling — set it back to `DEFAULT` to exercise the full pipeline.
- **`/demo`** route runs entirely on mocked data (MSW), no backend required.
- **Provision a user without signup:** `cd backend && npx tsx scripts/createUser.ts 'Name' 'you@example.org' 'password'`.
