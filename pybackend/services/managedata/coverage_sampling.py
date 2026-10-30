import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from typing import List
import torch

class CoverageBasedSampling:
    def __init__(self, df: pd.DataFrame, model: SentenceTransformer):
        self.rep_sample_df = df  # D_guide
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = model.to(self.device)

    def sample(self, n: int = 150, text_col: str = "text_combined") -> pd.DataFrame:
        n = min(max(0, n), len(self.rep_sample_df))
        if n == 0:
            return self.rep_sample_df.iloc[:0].copy()
        if self.rep_sample_df.empty:
            return self.rep_sample_df.sample(n=min(n, len(self.rep_sample_df)))

        texts = self.rep_sample_df[text_col].tolist()

        # Encode all texts in one pass — one vector per text, no sentence splitting.
        # all-mpnet-base-v2 captures full-text semantics so whole-sample encoding
        # gives a clean single vector representing the overall meaning of each note.
        print(f"[CoverageBasedSampling] Pre-computing embeddings for {len(texts)} texts...")
        all_embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            batch_size=64,
            device=self.device,
        )  # shape: (N, 768)

        # Step 1: seed with the most peripheral sample (farthest from the centroid)
        # so greedy selection fans out from the most semantically outlying point
        centroid = all_embeddings.mean(axis=0, keepdims=True)  # (1, 768)
        seed_idx = int(np.argmin(cosine_similarity(all_embeddings, centroid).squeeze()))

        picked = [seed_idx]

        # Running max-similarity vector: max_sims[i] = highest similarity sample i
        # has to any candidate picked so far. Avoids recomputing the full matrix
        # each iteration — only one column of comparisons needed per new pick.
        max_sims = cosine_similarity(all_embeddings, all_embeddings[[seed_idx]]).reshape(-1)
        max_sims[seed_idx] = float('inf')  # exclude seed from future selection

        # Step 2: iteratively add the most semantically distant remaining sample
        while len(picked) < n:
            # pick the least similar (lowest coverage score)
            next_idx = int(np.argmin(max_sims))

            # move it from remaining to candidate
            picked.append(next_idx)

            # update running max against the newly added candidate
            new_sims = cosine_similarity(all_embeddings, all_embeddings[[next_idx]]).reshape(-1)
            max_sims = np.maximum(max_sims, new_sims)
            max_sims[next_idx] = float('inf')  # exclude from future selection

            print(f"Picked: {len(picked)}")

        return self.rep_sample_df.iloc[picked].reset_index(drop=True)
