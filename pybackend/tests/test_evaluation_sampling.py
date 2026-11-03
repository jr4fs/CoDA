import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
import faiss
from services.managedata.evaluation_sampling import EvaluationSampler, EvaluationSamplingRequest, coverage_indices, normalized, relevant_candidates


class FixtureModel:
    def __init__(self):
        self.calls = []

    def encode(self, texts, **kwargs):
        self.calls.append(list(texts))
        return np.array([[1 + text.lower().count("lawyer"), 1 + text.lower().count("doctor"), 1 + len(text) % 13] for text in texts], dtype=np.float32)


class EvaluationSamplingTests(unittest.TestCase):
    def test_coverage_bounds_singletons_and_identical_vectors(self):
        for count in [0, 1, 2, 10]:
            picked = coverage_indices(np.ones((count, 3)), 50)
            self.assertEqual(len(picked), count)
            self.assertEqual(len(set(picked)), count)
        self.assertEqual(coverage_indices(np.ones((4, 3)), 0), [])

    def test_distinct_records_exclusions_cache_and_guide_export(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "shared_uploads").mkdir()
            source = root / "shared_uploads" / "notes.csv"
            rows = pd.DataFrame({"id": ["duplicate"] * 12, "note": [f"Lawyer discussed case {i}. Doctor followed up." for i in range(11)] + [" "]})
            rows.to_csv(source, index=False)
            original = source.read_bytes()
            request = EvaluationSamplingRequest(task_id="a" * 24, file_path="notes.csv", text_col=["note"], queries={"A": ["lawyer"], "B": ["doctor"]}, quotas={"A": 3, "B": 3})
            model = FixtureModel()
            first = EvaluationSampler(request, root, model).run()
            ids = [r["recordId"] for r in first["records"]]
            self.assertEqual(len(ids), 6)
            self.assertEqual(len(set(ids)), 6)
            self.assertEqual(first["eligibleRecords"], 11)
            calls = len(model.calls)
            request.excluded = ids
            request.export_guide = True
            second = EvaluationSampler(request, root, model).run()
            second_ids = {r["recordId"] for r in second["records"]}
            self.assertEqual(len(second_ids), 5)
            self.assertFalse(second_ids.intersection(ids))
            self.assertEqual(len(model.calls) - calls, 2, "second round should embed queries only")
            self.assertEqual(source.read_bytes(), original)
            guide = pd.read_csv(root / "guide_datasets" / "notes.csv")
            rest = pd.read_csv(root / "rest_datasets" / "notes.csv")
            self.assertEqual(set(guide.record_id), second_ids)
            self.assertFalse(set(rest.record_id).intersection(ids))

    def test_search_expands_past_excluded_nearest_sentences(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "shared_uploads").mkdir()
            pd.DataFrame({"note": ["Lawyer." * 3] * 600}).to_csv(root / "shared_uploads" / "notes.csv", index=False)
            request = EvaluationSamplingRequest(task_id="b" * 24, file_path="notes.csv", text_col=["note"], queries={"A": ["lawyer"]}, quotas={"A": 10}, excluded=[f"r{i}" for i in range(599)])
            result = EvaluationSampler(request, root, FixtureModel()).run()
            self.assertEqual([r["recordId"] for r in result["records"]], ["r599"])

    def test_rejects_path_traversal(self):
        with self.assertRaises(ValueError):
            EvaluationSamplingRequest(task_id="b" * 24, file_path="../notes.csv", text_col=["note"], queries={}, quotas={})

    def test_multiple_queries_expand_past_long_narratives(self):
        # Query A initially sees only 500 sentences owned by r0. Query B
        # supplies enough lower-scoring distinct rows to fill the union, but r1
        # is still the second most relevant record and must enter coverage.
        vectors = normalized([[1, 0, 0]] * 500 + [[0.99, -0.1, 0.1]] + [[0.6, 0.7, 0.3]] * 52)
        owners = np.array([0] * 500 + list(range(1, 54)))
        index = faiss.IndexFlatIP(3)
        index.add(vectors)
        queries = normalized([[1, 0, 0], [0, 1, 0]])
        candidates = relevant_candidates(index, queries, owners, set(range(54)), 50)
        self.assertEqual(candidates[:2], [0, 1])
        self.assertEqual(len(candidates), 50)


if __name__ == "__main__":
    unittest.main()
