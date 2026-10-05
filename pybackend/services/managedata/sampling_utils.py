"""Shared sampling helpers."""

import os

import pandas as pd


def get_candidate_cap() -> int:
    """Max candidate rows to embed before sampling, from SAMPLING_CANDIDATE_CAP.
    0 / unset / invalid => disabled (embed the full dataset, the default)."""
    raw = os.getenv("SAMPLING_CANDIDATE_CAP", "").strip()
    try:
        return max(0, int(raw))
    except ValueError:
        return 0


def apply_candidate_cap(df: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    """Randomly subsample the candidate pool to the cap BEFORE the (expensive)
    embedding step. Disabled by default; only trims when SAMPLING_CANDIDATE_CAP is
    a positive int smaller than the dataset. Keeps sampling fast/cheap on small VMs
    without changing default behaviour."""
    cap = get_candidate_cap()
    if cap > 0 and len(df) > cap:
        print(f"[sampling] candidate cap enabled: subsampling {len(df)} -> {cap} rows before embedding")
        return df.sample(n=cap, random_state=seed).reset_index(drop=True)
    return df
