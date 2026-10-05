"""
API-backed embedding model that is a drop-in replacement for the
``SentenceTransformer`` object returned by ``model_singleton.get_embedding_model``.

Only the two methods the sampling code actually uses are implemented:

    model.encode(texts, batch_size=..., convert_to_numpy=..., show_progress_bar=...,
                 device=..., normalize_embeddings=...) -> np.ndarray  (shape (N, dim))
    model.to(device) -> self   (no-op; kept so `model.to(...)` call sites don't break)

Selected via the ``EMBEDDINGS_PROVIDER`` env var (``bedrock`` or ``openai``); the
default (``local``) never constructs this class and keeps using mpnet/torch.

Vectors are returned UN-normalized, matching SentenceTransformer's default — the
downstream code normalizes itself (FAISSIndexing / faiss.normalize_L2 / cosine).
"""

from __future__ import annotations

import os
from typing import List, Sequence, Union

import numpy as np

_OPENAI_BATCH = 256   # OpenAI accepts large batches per request
_COHERE_BATCH = 96    # Bedrock Cohere embed max texts per invoke


class ApiEmbeddingModel:
    def __init__(self, provider: str):
        self.provider = provider.strip().lower()
        if self.provider == "openai":
            self._api_key = os.getenv("OPENAI_API_KEY")
            if not self._api_key:
                raise RuntimeError("EMBEDDINGS_PROVIDER=openai but OPENAI_API_KEY is not set")
            # `or default` (not getenv's default) so a set-but-EMPTY env var
            # (docker-compose passes "" for unset optionals) falls back correctly.
            self._base_url = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
            self.model_id = os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small"
        elif self.provider == "bedrock":
            self.model_id = os.getenv("BEDROCK_EMBEDDING_MODEL") or "amazon.titan-embed-text-v2:0"
            region = os.getenv("BEDROCK_REGION") or os.getenv("AWS_REGION") or "us-east-1"
            import boto3  # lazy: only needed for this provider
            self._client = boto3.client("bedrock-runtime", region_name=region)
        else:
            raise RuntimeError(
                f"Unsupported EMBEDDINGS_PROVIDER '{provider}' (expected 'local', 'openai' or 'bedrock')"
            )

    # SentenceTransformer compatibility: `model.to(device)` returns the model.
    def to(self, _device=None) -> "ApiEmbeddingModel":
        return self

    def encode(
        self,
        sentences: Union[str, Sequence[str]],
        batch_size: int = 64,
        convert_to_numpy: bool = True,  # noqa: ARG002 - always returns numpy
        show_progress_bar: bool = False,  # noqa: ARG002
        device=None,  # noqa: ARG002 - irrelevant for a remote API
        normalize_embeddings: bool = False,
        **_ignored,
    ) -> np.ndarray:
        single = isinstance(sentences, str)
        texts: List[str] = [sentences] if single else [str(t) for t in sentences]
        if not texts:
            return np.empty((0, 0), dtype=np.float32)

        if self.provider == "openai":
            vectors = self._encode_openai(texts)
        else:
            vectors = self._encode_bedrock(texts)

        arr = np.asarray(vectors, dtype=np.float32)
        if normalize_embeddings:
            norms = np.linalg.norm(arr, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            arr = arr / norms
        return arr[0] if single else arr

    # ---- provider implementations -------------------------------------------------

    def _encode_openai(self, texts: List[str]) -> List[List[float]]:
        import requests

        out: List[List[float]] = []
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        for start in range(0, len(texts), _OPENAI_BATCH):
            batch = texts[start:start + _OPENAI_BATCH]
            resp = requests.post(
                f"{self._base_url}/embeddings",
                headers=headers,
                json={"model": self.model_id, "input": batch},
                timeout=120,
            )
            resp.raise_for_status()
            data = sorted(resp.json()["data"], key=lambda d: d["index"])
            out.extend(item["embedding"] for item in data)
        return out

    def _encode_bedrock(self, texts: List[str]) -> List[List[float]]:
        import json

        out: List[List[float]] = []
        if self.model_id.startswith("cohere."):
            for start in range(0, len(texts), _COHERE_BATCH):
                batch = texts[start:start + _COHERE_BATCH]
                resp = self._client.invoke_model(
                    modelId=self.model_id,
                    body=json.dumps({"texts": batch, "input_type": "search_document"}),
                )
                payload = json.loads(resp["body"].read())
                out.extend(payload["embeddings"])
        else:
            # Titan text embeddings accept a single inputText per invocation.
            for text in texts:
                resp = self._client.invoke_model(
                    modelId=self.model_id,
                    body=json.dumps({"inputText": text}),
                )
                payload = json.loads(resp["body"].read())
                out.append(payload["embedding"])
        return out
