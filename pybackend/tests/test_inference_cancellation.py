import asyncio
import threading
import unittest
from unittest.mock import patch

import pandas as pd

from api import routes
from models.ollama_adapter import AutoLabelRequest


class InferenceCancellationTests(unittest.IsolatedAsyncioTestCase):
    def tearDown(self):
        routes._eval_progress.clear()
        routes._eval_run_ids.clear()
        routes._auto_label_progress.clear()
        routes._auto_label_run_ids.clear()
        routes._auto_label_results.clear()

    async def test_cancelled_worker_does_not_overwrite_a_new_run(self):
        started = threading.Event()
        release = threading.Event()

        class SlowChat:
            def send_chat(self, *args):
                started.set()
                release.wait(timeout=2)
                return {"label": ["positive"]}

        request = AutoLabelRequest(
            file_path="unused.csv",
            text_column="text",
            labels=[{"name": "positive", "definition": "positive"}],
            task_definition="Classify text",
            model_name="qwen2.5:72b",
            task_type="annotation",
        )
        routes._auto_label_run_ids["task"] = "old-run"
        routes._auto_label_progress["task"] = {"completed": 0, "total": 0, "done": False}

        with patch.object(pd, "read_csv", return_value=pd.DataFrame([{"text": "one"}, {"text": "two"}])), \
             patch.object(routes, "ChatService", return_value=SlowChat()):
            worker = asyncio.create_task(routes._run_auto_label_job("task", "old-run", request))
            self.assertTrue(await asyncio.to_thread(started.wait, 2))
            await routes.cancel_auto_label("task")
            routes._auto_label_run_ids["task"] = "new-run"
            routes._auto_label_progress["task"] = {"completed": 0, "total": 2, "done": False}
            routes._auto_label_results["task"] = [{"generated_label": "new"}]
            release.set()
            await worker

        self.assertEqual(routes._auto_label_progress["task"], {"completed": 0, "total": 2, "done": False})
        self.assertEqual(routes._auto_label_results["task"], [{"generated_label": "new"}])


if __name__ == "__main__":
    unittest.main()
