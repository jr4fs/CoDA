# Sampling Methodology

This document explains how the two core datasets are constructed during a project setup: the **guide dataset** (D_val) and the **rest dataset** (D_rest), and how examples are drawn for each batch of annotation.

---

## Overview

When a dataset is uploaded and a project is initialized, the system partitions the data into two datasets:

| Dataset | File location | Purpose |
|---|---|---|
| **D_rest** (`rest_datasets/`) | Pool of label-representative examples | Source for subsequent annotation batches |
| **D_guide** (`guide_datasets/`) | Maximally diverse coverage sample | First batch shown to annotators; also stored in MongoDB `AnnotationDetails` |

The entry point is `DataManagerService.run_sampling()` (`data_manager_service.py:40`), which dispatches to one or both sampling strategies depending on the request flags.

```
run_sampling()
 ├── [if use_representative_sampling] upsample()  → builds D_rest via RepresentativeSampling
 └── coverage_sample()                            → builds D_guide via CoverageBasedSampling
```

A UI development mode bypass exists (`random_sample_for_ui_dev`) that skips both strategies and uses a fixed random seed instead.

---

## D_val (Guide Dataset) — Coverage-Based Sampling

**File:** `coverage_sampling.py` — `CoverageBasedSampling`

**Goal:** Select `n` examples (default 150, controlled by `coverage_n`) that are maximally spread across the semantic space of the dataset. This ensures the first batch of annotations covers as much conceptual ground as possible rather than clustering around common themes.

### Algorithm

The algorithm is a greedy **farthest-point sampling** (also called max-min diversity selection) operating in embedding space.

#### Step 1 — Embed the dataset

All texts in `text_combined` are encoded in a single pass using `all-mpnet-base-v2`, producing one 768-dimensional vector per record (no sentence splitting at this stage).

```
texts → model.encode(batch_size=64) → all_embeddings  shape: (N, 768)
```

#### Step 2 — Seed from the periphery

The centroid of all embeddings is computed, and the sample with the **lowest cosine similarity to the centroid** is chosen as the seed. Starting from the most outlying point causes greedy selection to fan outward from the extremes rather than from the densest region.

```
centroid = mean(all_embeddings)                       # shape: (1, 768)
seed_idx = argmin(cosine_similarity(all_embeddings, centroid))
```

#### Step 3 — Iterative farthest-point expansion

At each iteration, the algorithm selects the sample that is **least similar to any already-picked sample**. A running `max_sims` vector is maintained so that only one column of similarity comparisons is needed per iteration (rather than recomputing the full N×N matrix).

```
max_sims[i] = max cosine similarity between sample i and any picked sample so far

while len(picked) < n:
    next_idx  = argmin(max_sims)          # least covered sample
    picked.append(next_idx)
    new_sims  = cosine_similarity(all_embeddings, all_embeddings[[next_idx]])
    max_sims  = max(max_sims, new_sims)   # update running coverage
    max_sims[next_idx] = inf              # exclude from future selection
```

#### Step 4 — Persist

The selected rows are written to `guide_datasets/<filename>.csv` and each row is inserted into MongoDB `AnnotationDetails` with `source: "guide"`. Any pre-existing guide annotations for the same `taskId` are deleted first to avoid duplicates.

### Properties

- **Deterministic** given the same dataset (no random seed required — the algorithm is greedy).
- **Outlier-first**: semantically rare examples are prioritized, reducing blind spots in the annotation batch.
- **O(n · N)** cosine similarity operations total (N = dataset size, n = budget), thanks to the running max trick.

---

## D_rest (Rest Dataset) — Representative Label Sampling

**Files:** `rep_sampling.py`, `label_sampling.py`, `embed_dataset.py`, `faiss_indexing.py`

**Goal:** Retrieve a set of records from the full dataset that are semantically close to each label's keywords and definition. This pool is used to populate subsequent annotation batches and ensures annotators see examples that are actually relevant to the label schema.

This path runs when `use_representative_sampling: true` is set on the request.

### Pipeline

```
RepresentativeSampling.run()
 ├── 1. DatasetEmbedding.build_embedding_database()   → embed D_all
 ├── 2. FAISSIndexing.build_faiss_index()             → build ANN index
 └── 3. LabelSampling.run_faiss_indexing()            → retrieve per-label results
```

---

### Stage 1 — Dataset Embedding (`embed_dataset.py`)

The raw dataset is transformed into a searchable embedding database.

#### Text preparation

Specified `text_col` columns are concatenated into a single `text_combined` field:

```python
df["text_combined"] = df[text_cols].fillna("").astype(str).agg(" ".join, axis=1).str.strip()
```

#### Sentence splitting (optional)

When `split_to_sentences=True` (the default), each record's `text_combined` is split into individual sentences using a naive regex that splits on `.`, `!`, or `?` followed by whitespace and a capital letter:

```python
pattern = r'(?<=[.!?])\s+(?=[A-Z])'
```

Each sentence becomes its own row in the embedding database, carrying `orig_id` (the source record's ID) and `sentence_idx` (its position within the record). This increases retrieval granularity — a FAISS query can match a specific relevant sentence even if the rest of the record is off-topic.

#### Embedding

All sentences (or full texts if splitting is disabled) are encoded with `all-mpnet-base-v2` in batches of 64, producing 768-dimensional float32 vectors.

```
database_df columns: row_id | orig_id | sentence_idx | text | text_combined | vector
```

---

### Stage 2 — FAISS Index (`faiss_indexing.py`)

A FAISS flat index is built over the embedding matrix.

- Vectors are L2-normalized (divided by their norms) to convert inner product to cosine similarity.
- Index type: `IndexFlatIP` (exact inner product search, equivalent to cosine similarity after normalization).
- The index stores one vector per sentence row (not per original record).

---

### Stage 3 — Label-Guided Retrieval (`label_sampling.py`)

For each label defined in the project, the system retrieves the most semantically similar records from the embedding database.

#### Query construction (`build_queries_for_label`)

Each label produces one or more query strings:

| Condition | Queries generated |
|---|---|
| Label has keywords | One query per keyword (e.g., `["fever", "chills", "fatigue"]` → 3 queries) |
| No keywords, has definition | One query: `"<label_name>: <definition>"` |
| No keywords, no definition | One query: `"<label_name>"` |

Labels with no keywords at all are skipped entirely (`run_faiss_indexing`, line 161).

#### Per-query FAISS search (`faiss_search_balanced`)

For each query string:

1. Encode the query with the same `all-mpnet-base-v2` model.
2. Normalize the query vector (L2) for cosine comparison.
3. Search the FAISS index for the **top 500** nearest neighbors.
4. Merge results with `database_df` on `row_id` to recover text and metadata.

#### Result aggregation and filtering

After collecting results across all queries for a label:

1. All per-query frames are concatenated.
2. Rows are sorted by **distance descending** (higher inner product = more similar).
3. Duplicate `row_id` entries are removed, keeping the highest-similarity occurrence.
4. The **top 25%** of the deduplicated results are retained.

```python
combined = combined.sort_values("distance", ascending=False)
combined = combined.drop_duplicates(subset=["row_id"], keep="first")
n_top_25 = int(len(combined) * 0.25)
combined = combined.head(n_top_25)
```

Each retained row is tagged with `label_name` and `keyword_used`.

#### Cross-label concatenation

Results from all labels are concatenated into a single DataFrame, which is saved to `rest_datasets/<filename>.csv`. This file serves as the pool from which subsequent annotation batches are drawn.

---

## Shared Infrastructure

### Embedding model (`model_singleton.py`)

Both sampling paths use the same singleton model instance to avoid loading the weights more than once per process:

- **Model:** `sentence-transformers/all-mpnet-base-v2`
- **Device:** Apple MPS if available, otherwise CPU

### `EmbedDatasetRequest` fields relevant to sampling

| Field | Type | Effect |
|---|---|---|
| `coverage_n` | `int` (default 150) | Number of examples in D_guide |
| `use_representative_sampling` | `bool` (default `false`) | Whether to build D_rest via label sampling before coverage sampling |
| `split_to_sentences` | `bool` (default `true`) | Whether to split records into sentences before embedding for FAISS |
| `text_col` | `List[str]` | Columns concatenated into `text_combined` |
| `labels[].keywords` | `List[str]` | Drives query construction; labels with no keywords are skipped |

---

## End-to-End Data Flow

```
Uploaded CSV (shared_uploads/)
        │
        ▼
[optional] RepresentativeSampling
        │  embed → FAISS index → per-label retrieval → top-25% filter
        ▼
rest_datasets/<file>.csv   (D_rest — label-relevant pool)
        │
        ▼
CoverageBasedSampling
        │  embed → centroid seed → greedy farthest-point → n examples
        ▼
guide_datasets/<file>.csv  (D_guide — first annotation batch)
        │
        ▼
MongoDB AnnotationDetails  (source: "guide", one doc per example)
```
