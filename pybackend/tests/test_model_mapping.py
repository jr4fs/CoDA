import os
import unittest
from unittest.mock import patch

from models.ollama_adapter import SELECTABLE_MODEL_KEYS, _build_registry, selectable_model_keys


class ModelMappingTests(unittest.TestCase):
    def test_new_tasks_offer_available_qwen_model_on_openrouter(self):
        self.assertEqual(
            selectable_model_keys("openrouter"),
            ["mistral:7b", "gemma3:1b", "qwen3.5:2b", "qwen:72b", "qwen2.5:72b", "llama3.3:70b"],
        )
        self.assertIn("qwen2.5:32b", SELECTABLE_MODEL_KEYS)
        self.assertIn("qwen:72b", SELECTABLE_MODEL_KEYS)
        self.assertIn("qwen:72b", selectable_model_keys("ollama"))

    def test_new_qwen_selection_preserves_legacy_on_ollama(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "ollama"}):
            registry = _build_registry()
            self.assertEqual(registry["qwen2.5:32b"].model, "qwen2.5:32b")
            self.assertEqual(registry["qwen2.5:72b"].model, "qwen2.5:72b")
            self.assertEqual(registry["qwen:72b"].model, "qwen:72b")

    def test_new_qwen_selection_preserves_legacy_on_openrouter(self):
        with patch.dict(os.environ, {"LLM_PROVIDER": "openrouter", "OPENROUTER_MODEL_MAP": ""}):
            registry = _build_registry()
            self.assertEqual(
                registry["qwen2.5:32b"].model,
                "qwen/qwen2.5-32b-instruct",
            )
            self.assertEqual(registry["qwen2.5:72b"].model, "qwen/qwen-2.5-72b-instruct")
            self.assertEqual(registry["qwen:72b"].model, "qwen/qwen-2.5-72b-instruct")


if __name__ == "__main__":
    unittest.main()
