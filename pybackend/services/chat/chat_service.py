from typing import Dict, Any, List, Optional
from models.ollama_adapter import OllamaAdapter, AnnotationLLMOutput, registry, configs
import json
import logging
import re

from models.embedding_schemas import Label



class ChatService:
    def __init__(self):
        self.registry = registry
        self.configs = configs
        self.logger = logging.getLogger("uvicorn.error")

    def send_chat(self, labels: List[Label], task_def:str, model_name: str, system: str, text: str, user_input: Optional[str] = None, **opts) -> Dict[str, Any]:
        model = self.registry[model_name] #TODO: add check to see if model is present, if not, need to download if it is a valid model name
        inference_payload = {
            "labels": [l.dict() for l in labels],
            "text": text,
            "task_definition": task_def,
            "user_input": user_input
        }
        payload_str = json.dumps(inference_payload, ensure_ascii=False)
        messages = [{"role": "system", "content": system}, {"role": "user", "content": payload_str}]
        # token check, caching, metrics hooks go here
        response = model.chat(messages, format=AnnotationLLMOutput.model_json_schema(), **opts)
        response_json = response.json()
        prompt_tokens = response_json.get("prompt_eval_count")
        eval_tokens = response_json.get("eval_count")
        total_tokens = (
            (prompt_tokens or 0) + (eval_tokens or 0)
            if prompt_tokens is not None or eval_tokens is not None
            else 0
        )
        duration_ns = response_json.get("total_duration")
        if duration_ns is None:
            prompt_duration = response_json.get("prompt_eval_duration")
            eval_duration = response_json.get("eval_duration")
            if prompt_duration is not None or eval_duration is not None:
                duration_ns = (prompt_duration or 0) + (eval_duration or 0)

        if prompt_tokens is not None or eval_tokens is not None:
            duration_ms = (duration_ns / 1e6) if duration_ns else 0.0
            self.logger.info(
                "ollama usage model=%s prompt_tokens=%s eval_tokens=%s total_tokens=%s duration_ms=%.1f",
                model_name,
                prompt_tokens,
                eval_tokens,
                total_tokens,
                duration_ms,
            )
        else:
            self.logger.info(
                "ollama usage model=%s prompt_tokens=missing eval_tokens=missing",
                model_name,
            )
        # normalize response text
        raw_content = response_json.get("message", {}).get("content", "")
        try:
            model_output = json.loads(raw_content)
        except json.JSONDecodeError:
            model_output = self._extract_json(raw_content)
            if model_output is None:
                self.logger.error("ollama response not json: %s", raw_content)
                raise ValueError("Model response was not valid JSON")

        label = model_output.get("label", [])
        if isinstance(label, str):
            label = [label]
        if not label:
            label = ["not relevant"]
        span_text = model_output.get("span_text", "")
        if not span_text:
            span_text = "No span text identified." 
        reason = model_output.get("reason", "")

        if not reason:
            self.logger.warning(
                "ollama response missing reason: %s",
                model_output,
            )
            reason = "No reasoning provided"

        return {
            "label": label,
            "span_text": span_text,
            "reason": reason,
            "raw_response": raw_content,
            "tokens": total_tokens,
            "time": (duration_ns / 1e9) if duration_ns else 0.0,
        }

    def _extract_json(self, content: str) -> Optional[Dict[str, Any]]:
        if not content:
            return None
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
