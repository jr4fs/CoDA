# Python/FastAPI ML backend (embeddings, FAISS sampling, anonymization, LLM proxy).
#
# Build context MUST be the repo root so the package sits at /app/pybackend,
# making data_manager_service.py's project_root (parents[3]) resolve to /app —
# the same data root the Node container uses. Build with:
#   docker build -f pybackend/Dockerfile -t annotation-pybackend .
FROM python:3.11-slim

# Build tooling for native wheels (faiss/torch deps, presidio, etc.).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/pybackend

# Install CPU-only torch first to avoid pulling the large CUDA build.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Remaining Python deps (includes the en_core_web_lg spaCy wheel).
COPY pybackend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the sentence-transformers embedding model so the first request
# does not block on a network fetch (and so the container works offline).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-mpnet-base-v2')"

# App code.
COPY pybackend ./

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Production: no --reload.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
