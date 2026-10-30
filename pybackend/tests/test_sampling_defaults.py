import unittest

from models.embedding_schemas import EmbedDatasetRequest


class SamplingDefaultsTests(unittest.TestCase):
    def test_representative_sampling_defaults_on_with_explicit_opt_out(self):
        payload = {
            "file_path": "notes.csv",
            "text_col": ["text"],
            "label_col": "label",
            "labels": [{"name": "Legal", "definition": "Legal interaction"}],
        }

        self.assertTrue(EmbedDatasetRequest(**payload).use_representative_sampling)
        self.assertFalse(
            EmbedDatasetRequest(**payload, use_representative_sampling=False).use_representative_sampling
        )


if __name__ == "__main__":
    unittest.main()
