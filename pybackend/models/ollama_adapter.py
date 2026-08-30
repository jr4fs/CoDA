from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import requests
import json
import os
import time
import logging

from models.embedding_schemas import Label

_logger = logging.getLogger("uvicorn.error")


class OllamaAdapter(BaseModel):
    model: str
    base:str = "http://localhost:11434"

    def chat(self, messages: List[Dict[str,str]], **opts):
        payload = {"model": self.model, "messages": messages, "stream":False, "format": "json", **opts}
        r = requests.post(f"{self.base}/api/chat", json=payload, timeout=180) #TODO: add retry and backoff
        r.raise_for_status()
        return r

    def info(self) -> Dict[str, Any]:
        return {"model": self.model}


class _OpenRouterResponse:
    """
    Thin wrapper that exposes an Ollama-shaped ``.json()`` so the existing
    ChatService / RuleSynthesisService parsing code works unchanged.

    Ollama keys consumed downstream: ``message.content``, ``prompt_eval_count``,
    ``eval_count``, ``total_duration`` (nanoseconds).
    """

    def __init__(self, openai_payload: Dict[str, Any], duration_ns: int):
        choices = openai_payload.get("choices") or [{}]
        content = (choices[0].get("message") or {}).get("content", "")
        usage = openai_payload.get("usage") or {}
        self._normalized = {
            "message": {"content": content},
            "prompt_eval_count": usage.get("prompt_tokens"),
            "eval_count": usage.get("completion_tokens"),
            "total_duration": duration_ns,
        }

    def json(self) -> Dict[str, Any]:
        return self._normalized


class OpenRouterAdapter(BaseModel):
    """
    OpenAI-compatible adapter for OpenRouter (https://openrouter.ai).

    Exposes the same ``.chat(messages, format=<json_schema>, **opts)`` contract
    as ``OllamaAdapter`` and returns an Ollama-shaped response, so no changes are
    required in ChatService / RuleSynthesisService or the frontend.
    """

    model: str  # OpenRouter model slug, e.g. "mistralai/mistral-7b-instruct"
    base: str = "https://openrouter.ai/api/v1"

    def chat(self, messages: List[Dict[str, str]], **opts):
        opts = dict(opts)
        schema = opts.pop("format", None)  # pydantic json schema dict, or None

        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not set")

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            **opts,  # e.g. temperature
        }
        # Prefer structured JSON output when a schema is available; fall back to
        # a generic JSON object otherwise. Downstream code also has a JSON
        # extraction fallback for models that ignore the format hint.
        if isinstance(schema, dict):
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "structured_output", "schema": schema},
            }
        else:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        referer = os.getenv("OPENROUTER_SITE_URL")
        title = os.getenv("OPENROUTER_APP_NAME")
        if referer:
            headers["HTTP-Referer"] = referer
        if title:
            headers["X-Title"] = title

        start = time.perf_counter()
        r = requests.post(
            f"{self.base}/chat/completions",
            json=payload,
            headers=headers,
            timeout=180,
        )
        # Not every model/provider accepts json_schema response_format. On a 4xx,
        # retry once with a generic json_object (downstream code can still parse it).
        if 400 <= r.status_code < 500 and payload.get("response_format", {}).get(
            "type"
        ) == "json_schema":
            _logger.warning(
                "OpenRouter rejected json_schema for model=%s (%s); retrying as json_object",
                self.model,
                r.status_code,
            )
            payload["response_format"] = {"type": "json_object"}
            r = requests.post(
                f"{self.base}/chat/completions",
                json=payload,
                headers=headers,
                timeout=180,
            )
        duration_ns = int((time.perf_counter() - start) * 1e9)
        r.raise_for_status()
        return _OpenRouterResponse(r.json(), duration_ns)

    def info(self) -> Dict[str, Any]:
        return {"model": self.model}

class InferenceRequest(BaseModel):
    labels:  List[Label] = Field(..., min_length=1)
    task_definition: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1)
    user_input: Optional[str] = Field(None, min_length=0)
    task_type: str = Field(..., min_length=1)

class InferenceResponse(BaseModel):
    model_name: str = Field(..., min_length=1)
    label: List[str] = Field(..., min_length=1)
    span_text: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1)
    raw_response: Optional[str] = Field(None, min_length=0)
    system_prompt: Optional[str] = Field(None, min_length=0)
    user_prompt: Optional[str] = Field(None, min_length=0)
    task_type: str = Field(..., min_length=1)
    tokens: int
    time: float

class BatchInferenceRequest(BaseModel):
    ground_truth_labels:  List[Label] = Field(..., min_length=1)
    task_definition: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1)
    user_input: Optional[str] = Field(None, min_length=0)
    task_type: str = Field(..., min_length=1)

class BatchInferenceResponse(BaseModel):
    model_name: str = Field(..., min_length=1)
    is_correct: bool
    tokens: int
    time: float

class BatchInferenceSummary(BaseModel):
    results: List[BatchInferenceResponse]
    accuracy: float

class AnnotationLLMOutput(BaseModel):
    label: List[str] = Field(..., min_length=1)
    span_text: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1)


# Friendly model keys exposed in the UI / stored on TaskDetails.modelName.
MODEL_KEYS = ["mistral:7b", "gemma3:1b", "qwen3.5:2b", "qwen:72b", "llama3.3:70b"]

# Default mapping from friendly key -> OpenRouter model slug. Slugs occasionally
# change in the OpenRouter catalogue (https://openrouter.ai/models); override any
# of these without a code change via the OPENROUTER_MODEL_MAP env var (JSON), e.g.
#   OPENROUTER_MODEL_MAP={"gemma3:1b":"google/gemma-3-4b-it"}
DEFAULT_OPENROUTER_MODEL_MAP = {
    "mistral:7b": "mistralai/ministral-8b-2512",
    "gemma3:1b": "google/gemma-3-4b-it",
    "qwen3.5:2b": "qwen/qwen-2.5-7b-instruct",
    "qwen:72b": "qwen/qwen-2.5-72b-instruct",
    "llama3.3:70b": "meta-llama/llama-3.3-70b-instruct",
}


def _build_registry() -> Dict[str, Any]:
    """
    Build the model registry from the LLM_PROVIDER env var.

    LLM_PROVIDER=ollama (default)     -> self-hosted Ollama (local dev / GPU host)
    LLM_PROVIDER=openrouter           -> OpenRouter hosted API (cloud deployment)
    """
    provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    if provider == "openrouter":
        model_map = dict(DEFAULT_OPENROUTER_MODEL_MAP)
        override = os.getenv("OPENROUTER_MODEL_MAP")
        if override:
            try:
                model_map.update(json.loads(override))
            except json.JSONDecodeError:
                _logger.warning("OPENROUTER_MODEL_MAP is not valid JSON; ignoring")
        return {key: OpenRouterAdapter(model=model_map[key]) for key in MODEL_KEYS}

    # Default: Ollama. The Ollama base host is configurable for containerized dev.
    ollama_base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    return {key: OllamaAdapter(model=key, base=ollama_base) for key in MODEL_KEYS}


registry = _build_registry()

class ValEvalSample(BaseModel):
    text: str
    ground_truth: List[str]

class ValEvalRequest(BaseModel):
    samples: List[ValEvalSample]
    labels: List[Label]
    task_definition: str
    model_name: str
    user_input: Optional[str] = None
    task_type: str
    task_id: Optional[str] = None

class ValEvalSampleResult(BaseModel):
    predicted: List[str]
    ground_truth: List[str]

class ValEvalResponse(BaseModel):
    results: List[ValEvalSampleResult]


class AutoLabelRequest(BaseModel):
    file_path: str            # filename relative to shared_uploads/
    text_column: str          # CSV column containing text to annotate
    labels: List[Label]
    task_definition: str
    model_name: str
    user_input: Optional[str] = None
    task_type: str
    job_id: Optional[str] = None


class AutoLabelJobResponse(BaseModel):
    job_id: str

configs = {
    "mistral:7b": {
        "temperature": 0.4,
    },
    "gemma3:1b": {
        "temperature": 0.4,
    },
    "qwen3.5:2b": {
        "temperature": 0.4,
    },
    "qwen:72b": {
        "temperature": 0.4,
    },
    "llama3.3:70b": {
        "temperature": 0.4,
    }
}
