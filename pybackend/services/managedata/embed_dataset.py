from __future__ import annotations

import numpy as np
import pandas as pd
import re
from typing import TYPE_CHECKING, List, Optional, Tuple
from .model_singleton import get_embedding_model, EMBEDDINGS_PROVIDER

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

class DatasetEmbedding:
   
   SENTENCE_SPLIT_PATTERN = re.compile(r'(?<=[.!?])\s+(?=[A-Z])')

   def __init__(self, d_all: pd.DataFrame, text_cols: List[str], id_col: Optional[str] = None, do_split_sentences: bool = True, use_cosine: bool = True):
      """ 
      Parameters
      ----------
      df : DataFrame
         Input dataframe (D_All)
      text_cols : List[str]
         Columns in df containing the text to embed.
      id_col : str, optional
         Optional, column in df that gives a unique id per row
         (e.g., 'example_id', 'report_id'). If None, the dataframe index is used.
      split_sentences: boolean (default: True)
         Choose to or not to split sentences in a sample
      use_cosine : bool
         If True, normalize vectors and use inner product as cosine similarity.
      """
      self.df = d_all
      self.text_cols = text_cols
      self.id_col = id_col
      self.sentence_model = "sentence-transformers/all-mpnet-base-v2"
      self.do_split_sentences = do_split_sentences
      self.vector_col = "vector"
      self.use_cosine = use_cosine
        
      # combining string columns
      self.df["text_combined"] = self.df[self.text_cols].fillna("").astype(str).agg(" ".join, axis=1).str.strip() 
   
   def split_sentences(self, text: str) -> List[str]:
      """
      Naive sentence splitter: split on punctuation followed by a capital letter.
      Parameters
      ----------
      text: str
         Input text for each sample from the combined text column
      Returns
      ----------
      List of sentences, with whitespace stripped.
      """
      if not isinstance(text, str):
         return []

      # split on .!? + space + capital; keep the punctuation
      parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text.strip())
      
      return [s.strip() for s in parts if s.strip()]
   
   def build_embedding_database(self,  batch_size: int = 64) -> Tuple[pd.DataFrame, SentenceTransformer]:
      """
      Build a text embedding database from a dataframe.
      -------
      Parameters
      -------
      batch_size : int, default 64
         Batch size for encoding 
      Returns
      -------
      database_df : DataFrame
         Columns: ['row_id', 'text', 'orig_id', 'sentence_idx', 'vector']
         - orig_id: the original row ID from input dataframe (e.g., example_id)
         - sentence_idx: which sentence 
      model : SentenceTransformer
         Loaded embedding model.
      """
      model = get_embedding_model()
      records = []
      # Handle id_col=None by using the dataframe index
      if self.id_col and self.id_col in self.df.columns:
          orig_ids = self.df[self.id_col].values
      else:
          print(f"id_col '{self.id_col}' not found or not provided. Using dataframe index as identifiers.")
          orig_ids = self.df.index.values
      texts = self.df["text_combined"].values
      if self.do_split_sentences:
         for orig_id, text in zip(orig_ids, texts):
            sentences = self.split_sentences(text)
            for s_idx, sentence in enumerate(sentences):
                  records.append(
                     {
                        "orig_id": orig_id,
                        "sentence_idx": s_idx,
                        "text": sentence,
                        "text_combined": text
                     }
                  )
      else:
         records.append(
               {
                  "orig_id": orig_id,
                  "sentence_idx": 0,
                  "text": text,
                  "text_combined": text
               }
            )
         
      database_df = pd.DataFrame.from_records(records)
      database_df["row_id"] = range(len(database_df))
         
      # compute embeddings (model already carries its device; API models ignore it)
      backend = self.sentence_model if EMBEDDINGS_PROVIDER in ("", "local") else f"{EMBEDDINGS_PROVIDER} API"
      print(f"Embedding {len(database_df)} texts with {backend}...")
      vectors = model.encode(
         database_df["text"].tolist(),
         batch_size=batch_size,
         convert_to_numpy=True,
         show_progress_bar=True,
      )
         
      # embedded D_all
      database_df["vector"] = list(vectors.astype(np.float32))

      return database_df, model