import torch
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
EMBEDDINGS_PROVIDER = "local"

_model: SentenceTransformer | None = None

def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"[ModelSingleton] Loading {MODEL_NAME} on {DEVICE}...")
        _model = SentenceTransformer(MODEL_NAME).to(DEVICE)
    return _model
