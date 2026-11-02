import os
import unittest
from unittest.mock import patch

from models.ollama_adapter import SELECTABLE_MODEL_KEYS, _build_registry


class ModelMappingTests(unittest.TestCase):
    def test_new_tasks_offer_only_five_model_families(self):
        self.assertEqual(
            SELECTABLE_MODEL_KEYS,
            ["mistral:7b", "gemma3:1b", "qwen3.5:2b", "qwen2.5:32b", "llama3.3:70b"],
        )

    def test_new_qwen_selection_preserves_legacy_on_ollama(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "ollama"}):
            registry = _build_registry()
            self.assertEqual(registry["qwen2.5:32b"].model, "qwen2.5:32b")
            self.assertEqual(registry["qwen:32b"].model, "qwen:32b")

    def test_new_qwen_selection_preserves_legacy_on_openrouter(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "openrouter", "OPENROUTER_MODEL_MAP": ""}):
            registry = _build_registry()
            self.assertEqual(
                registry["qwen2.5:32b"].model,
                "qwen/qwen2.5-32b-instruct",
            )
            self.assertEqual(registry["qwen:32b"].model, "qwen/qwen-2.5-72b-instruct")


if __name__ == "__main__":
    unittest.main()
