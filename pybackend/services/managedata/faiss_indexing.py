import numpy as np
import faiss
import pandas as pd
from typing import Tuple


class FAISSIndexing:
    def __init__(self, df, vector_col, use_cosine=True):
        """ 
        Parameters
        ----------
        database_df : DataFrame
            Must contain a column with vectors (list/array).
        vector_col : str
            Name of the column containing vectors.
        use_cosine : bool
            If True, normalize vectors and use inner product as cosine similarity.
        """
        self.database_df = df
        self.vector_col = "vector" if vector_col is None else vector_col
        self.use_cosine = use_cosine
    
    def build_faiss_index(self) -> Tuple[faiss.Index, np.ndarray]:
        """
        Build a FAISS index from the vectors in database_df.
        Returns
        -------
        index : faiss.Index
            FAISS index.
        matrix : np.ndarray
            The matrix of vectors used in the index (after any normalization).
        """
        print("Step 1: Checking DataFrame...")
        if self.database_df.empty:
            raise ValueError("DataFrame is empty.")

        if self.vector_col not in self.database_df.columns:
            raise KeyError(f"Column '{self.vector_col}' not found in DataFrame.")

        if self.database_df[self.vector_col].isnull().any():
            raise ValueError("Vector column contains null values.")
        print("Step 2: Stacking vectors...")
        vectors = np.vstack(self.database_df[self.vector_col].tolist()).astype(np.float32)
        print(f"Step 3: vectors shape = {vectors.shape}, dtype = {vectors.dtype}")
        dim = vectors.shape[1]
        print(dim)

        if self.use_cosine:
            # normalize to unit length
            print("Step 4: Checking norms...")
            norms = np.linalg.norm(vectors, axis=1, keepdims=True)
            if np.any(norms == 0):
                raise ValueError("One or more zero vectors found — cannot normalize for cosine similarity.")
            print("Step 5: Normalizing with FAISS...")
            # faiss.normalize_L2(vectors)
            vectors = vectors / norms          # ← pure numpy, no FAISS/MPS/CUDA conflict
            vectors = np.ascontiguousarray(vectors) 
            print("Step 6: Creating IndexFlatIP...")
            index = faiss.IndexFlatIP(dim)
        else:
            print("Step 5: Creating IndexFlatL2...")
            index = faiss.IndexFlatL2(dim)

        print("Step 7: Adding vectors to index...")
        index.add(vectors)
        print(f"Step 8: Done. Index has {index.ntotal} vectors.")
        return index, vectors
