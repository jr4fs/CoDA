import numpy as np
import pandas as pd
import re
import torch
from sentence_transformers import SentenceTransformer
from typing import List, Optional, Tuple

class DatasetEmbeddingService:
    def __init__(self, df:pd.DataFrame, text_cols: List[str], id_col: str, split_sent: bool, model_name:Optional[str], device: Optional[str]):
        """ 
        Parameters
        ----------
        df : DataFrame
            Input dataframe.
        text_cols : str
            Column in df containing the text to embed.
        id_col : str, optional
            Optional column in df that gives a unique id per row
            (e.g., 'example_id', 'report_id'). If None, the dataframe index is used.
        split_to_sentences : bool
            If True, each row is split into sentences, and each sentence gets its own embedding.
            If False, one embedding per row (full note).
        model_name : str
            SentenceTransformer model name.
        device : str, optional
            'cuda' or 'cpu'. If None, auto-detect.
        """
        self.df = df.copy()
        self.text_cols = text_cols
        self.id_col = id_col
        self.split_to_sentences = split_sent 
        self.model_name: str = "sentence-transformers/all-mpnet-base-v2" if model_name is None else model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "mps" if torch.mps.is_available() else "cpu")

        # Create combined text column
        self.df["text_combined"] = self.df[self.text_cols].fillna("").astype(str).agg(" ".join, axis=1).str.strip()

    def split_sentences(self, text: str) -> List[str]:
        """
        Naive sentence splitter: split on punctuation followed by a capital letter.
        Returns a list of sentences, with whitespace stripped.
        """
        if not isinstance(text, str):
            return []
        # Split on .!? + space + Capital; keep the punctuation
        parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text.strip())
        return [s.strip() for s in parts if s.strip()]
    
    def build_embedding_database(self) -> Tuple[pd.DataFrame, SentenceTransformer]:
        """
        Build a text embedding database from a dataframe.
        -------
        Returns
        -------
        database_df : DataFrame
            Columns: ['row_id', 'text', 'orig_id', 'sentence_idx', 'vector']
            - orig_id: the original row ID from df (e.g., example_id)
            - sentence_idx: which sentence (if split_to_sentences=True)
        model : SentenceTransformer
            Loaded embedding model.
        """
        df = self.df
        model = SentenceTransformer(self.model_name).to(self.device)
        records = []
        for i, row in df.iterrows():
            orig_id = row[self.id_col] if self.id_col is not None else i
            text = row["text_combined"]

            if self.split_to_sentences:
                sentences = self.split_sentences(text)
                for s_idx, sent in enumerate(sentences):
                    records.append(
                        {
                            "orig_id": orig_id,
                            "sentence_idx": s_idx,
                            "text": sent,
                        }
                    )
            else:
                records.append(
                    {
                        "orig_id": orig_id,
                        "sentence_idx": 0,
                        "text": text,
                    }
                )

        database_df = pd.DataFrame.from_records(records)
        database_df["row_id"] = range(len(database_df))

        # Compute embeddings
        print(f"Embedding {len(database_df)} texts with {self.model_name} on {self.device}...")
        vectors = model.encode(
            database_df["text"].tolist(),
            convert_to_numpy=True,
            show_progress_bar=True,
        )
        
        database_df["vector"] = list(vectors.astype(np.float32))

        return database_df, model
