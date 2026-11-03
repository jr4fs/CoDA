"""Read-only retrieval for evaluation rounds; Node owns all review state.

Cache sentence/record embeddings beside the uploaded data so the existing shared
volume persists them. Source bytes, columns and model identity invalidate caches.
"""
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

import faiss
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, field_validator

from .model_singleton import get_embedding_model, MODEL_NAME


class EvaluationSamplingRequest(BaseModel):
    task_id: str = Field(pattern=r"^[a-f0-9]{24}$")
    file_path: str
    text_col: list[str] = Field(min_length=1)
    queries: dict[str, list[str]]
    quotas: dict[str, int]
    excluded: list[str] = Field(default_factory=list)
    export_guide: bool = False

    @field_validator("file_path")
    @classmethod
    def safe_filename(cls, value):
        if Path(value).name != value or value in (".", ".."):
            raise ValueError("Expected an upload filename")
        return value

    @field_validator("quotas")
    @classmethod
    def bounded_quotas(cls, value):
        if any(n < 0 for n in value.values()) or sum(value.values()) > 1000:
            raise ValueError("Invalid sampling quotas")
        return value


def normalized(vectors):
    values = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    if not np.isfinite(values).all() or np.any(norms == 0):
        raise ValueError("Embedding model returned invalid or zero vectors")
    return np.ascontiguousarray(values / norms)


def coverage_indices(vectors, n, seed=0):
    """Farthest-first coverage within a relevant pool; never repeat a record."""
    if len(vectors) == 0 or n <= 0:
        return []
    vectors = normalized(vectors)
    picked = [seed]
    max_sims = vectors @ vectors[seed]
    max_sims[seed] = np.inf
    while len(picked) < min(n, len(vectors)):
        next_index = int(np.argmin(max_sims))
        picked.append(next_index)
        max_sims = np.maximum(max_sims, vectors @ vectors[next_index])
        max_sims[picked] = np.inf
    return picked


def relevant_candidates(index, query_vectors, owners, remaining, wanted):
    """Top distinct records by their best sentence/query similarity."""
    k = min(500, index.ntotal)
    while True:
        scores, hits = index.search(query_vectors, k)
        best = {}
        for score, hit in zip(scores.flat, hits.flat):
            if hit < 0:
                continue
            row = int(owners[hit])
            if row in remaining:
                best[row] = max(best.get(row, -np.inf), float(score))
        candidates = sorted(best, key=lambda row: (-best[row], row))[:wanted]
        if k == index.ntotal:
            return candidates
        # A large union alone is insufficient: one query may still hide better
        # records behind many sentences from a single narrative. Expand until
        # no query's unseen hits can outrank the cutoff, including score ties.
        if len(candidates) == wanted and float(scores[:, -1].max()) < best[candidates[-1]]:
            return candidates
        k = min(index.ntotal, k * 2)


class EvaluationSampler:
    def __init__(self, request, root=None, model=None):
        self.request = request
        self.root = root or Path(__file__).resolve().parents[3]
        self.model = model

    def run(self):
        request = self.request
        source = self.root / "shared_uploads" / request.file_path
        df = pd.read_csv(source, dtype=str, keep_default_na=False)
        if any(col not in df.columns for col in request.text_col):
            raise ValueError("A configured text column is missing")
        # Position-based IDs remain stable across rounds and duplicate source IDs.
        texts = df[request.text_col].agg("\n\n".join, axis=1).tolist()
        eligible = [i for i, text in enumerate(texts) if text.strip()]
        excluded = set(request.excluded)
        available = [i for i in eligible if f"r{i}" not in excluded]
        result = {"totalRecords": len(df), "eligibleRecords": len(eligible), "records": []}
        if not available or not sum(request.quotas.values()):
            return result

        model = self.model or get_embedding_model()
        digest = hashlib.sha256()
        with source.open("rb") as uploaded:
            for chunk in iter(lambda: uploaded.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(json.dumps([request.text_col, MODEL_NAME, 1]).encode())
        fingerprint = digest.hexdigest()
        cache_path = self.root / "shared_uploads" / f".evaluation-{request.task_id}.npz"
        cached = None
        if cache_path.exists():
            try:
                with np.load(cache_path, allow_pickle=False) as cache:
                    if str(cache["fingerprint"]) == fingerprint:
                        cached = (cache["sentence_vectors"], cache["owners"], cache["record_vectors"])
            except (ValueError, OSError, KeyError):
                pass  # An incomplete cache is disposable; uploaded data is not.
        if cached is None:
            sentences, owners = [], []
            for i in eligible:
                parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+(?=[A-Z])", texts[i]) if p.strip()]
                sentences.extend(parts)
                owners.extend([i] * len(parts))
            sentence_vectors = normalized(model.encode(sentences, convert_to_numpy=True, batch_size=64))
            record_vectors = np.zeros((len(df), sentence_vectors.shape[1]), dtype=np.float32)
            record_vectors[eligible] = normalized(model.encode([texts[i] for i in eligible], convert_to_numpy=True, batch_size=64))
            owners = np.asarray(owners, dtype=np.int64)
            with tempfile.NamedTemporaryFile(dir=cache_path.parent, suffix=".npz", delete=False) as handle:
                temporary = handle.name
                np.savez(handle, fingerprint=fingerprint, sentence_vectors=sentence_vectors, owners=owners, record_vectors=record_vectors)
            os.replace(temporary, cache_path)
        else:
            sentence_vectors, owners, record_vectors = cached
        index = faiss.IndexFlatIP(sentence_vectors.shape[1])
        index.add(sentence_vectors)

        selected = []
        remaining = set(available)
        # Allocate scarce labels first (Node orders quotas by running count).
        # A record is reserved once; subsequent labels retrieve replacements.
        for label, quota in request.quotas.items():
            if quota <= 0 or not remaining:
                continue
            queries = list(dict.fromkeys(q.strip() for q in request.queries.get(label, []) if q.strip()))
            if not queries:
                raise ValueError(f"Missing query for {label}")
            query_vectors = normalized(model.encode(queries, convert_to_numpy=True))
            wanted = min(len(remaining), max(50, 10 * quota))
            candidates = relevant_candidates(index, query_vectors, owners, remaining, wanted)
            chosen = [candidates[i] for i in coverage_indices(record_vectors[candidates], quota)]
            selected.extend(chosen)
            remaining.difference_update(chosen)

        result["records"] = [{"recordId": f"r{i}", "text": texts[i], "sampleContent": {**df.iloc[i].to_dict(), "text_combined": texts[i]}, "labels": [], "spans": [], "reviewed": False} for i in selected]
        if request.export_guide:
            # Keep D_all intact. Existing review UI reads these established paths.
            for folder, rows in [("rest_datasets", available), ("guide_datasets", selected)]:
                destination = self.root / folder / request.file_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                output = df.iloc[rows].copy()
                output["text_combined"] = [texts[i] for i in rows]
                output["record_id"] = [f"r{i}" for i in rows]
                with tempfile.NamedTemporaryFile(mode="w", dir=destination.parent, suffix=".csv", delete=False) as handle:
                    temporary = handle.name
                    output.to_csv(handle, index=False)
                os.replace(temporary, destination)
        return result
