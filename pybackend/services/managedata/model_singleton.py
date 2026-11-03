import os

MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"

# Embedding backend: "local" (default, in-process mpnet/torch) or a remote API
# ("bedrock" / "openai"). Set EMBEDDINGS_PROVIDER in the environment to offload
# embeddings and avoid loading torch/mpnet into RAM (smaller VM). Default stays
# local so dev and unconfigured deployments behave exactly as before.
EMBEDDINGS_PROVIDER = os.getenv("EMBEDDINGS_PROVIDER", "local").strip().lower()

_model = None
_device = None


def get_device() -> str:
    """Resolve the local torch device lazily so torch is imported only on the
    local-embeddings path (never when EMBEDDINGS_PROVIDER is an API)."""
    global _device
    if _device is None:
        import torch  # lazy: heavy import, only needed for local mpnet
        _device = "cuda" if torch.cuda.is_available() else "mps" if torch.mps.is_available() else "cpu"
    return _device


def get_embedding_model():
    global _model
    if _model is None:
        if EMBEDDINGS_PROVIDER in ("", "local"):
            from sentence_transformers import SentenceTransformer  # lazy: heavy import
            device = get_device()
            print(f"[ModelSingleton] Loading {MODEL_NAME} on {device}...")
            _model = SentenceTransformer(MODEL_NAME).to(device)
        else:
            # Imported lazily so the API path has no torch/sentence-transformers dependency.
            from .api_embeddings import ApiEmbeddingModel
            print(f"[ModelSingleton] Using '{EMBEDDINGS_PROVIDER}' API embeddings (no local model loaded)")
            _model = ApiEmbeddingModel(provider=EMBEDDINGS_PROVIDER)
    return _model
