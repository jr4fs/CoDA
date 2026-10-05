from pathlib import Path

import numpy as np
import pandas as pd
import re
from models.embedding_schemas import EmbedDatasetRequest
from typing import List, Optional, Tuple
from .rep_sampling import RepresentativeSampling
from .coverage_sampling import CoverageBasedSampling
from .model_singleton import get_embedding_model
from .sampling_utils import apply_candidate_cap
from ..database.database_service import get_collection
from datetime import datetime, timezone
from utils.runtime_config import is_ui_dev_mode

class DataManagerService:
    def __init__(self, request: EmbedDatasetRequest):
        self.request: EmbedDatasetRequest = request
        self.project_root = Path(__file__).resolve().parents[3]
        rest_dir = self.project_root / 'rest_datasets'
        guide_dir = self.project_root / 'guide_datasets'
        rest_dir.mkdir(parents=True, exist_ok=True)
        guide_dir.mkdir(parents=True, exist_ok=True)
        self.rest_file_path = str(rest_dir / request.file_path)
        self.guide_file_path = str(guide_dir / request.file_path)
    
    def upsample(self):
        upsampling_payload = EmbedDatasetRequest(
            file_path = str(self.project_root / 'shared_uploads' / self.request.file_path),
            text_col = self.request.text_col,
            id_col = self.request.id_col,
            split_to_sentences = self.request.split_to_sentences,
            labels = self.request.labels,
            label_col = self.request.label_col,
        )
        print(self.rest_file_path)
        obj = RepresentativeSampling(upsampling_payload)
        upsampled_result = obj.run()
        upsampled_result.to_csv(self.rest_file_path, index=False)

    def run_sampling(self):
        if is_ui_dev_mode():
            self.random_sample_for_ui_dev()
            return
        if self.request.use_representative_sampling:
            self.upsample()
        self.coverage_sample()

    def random_sample_for_ui_dev(self):
        source_path = self.project_root / 'shared_uploads' / self.request.file_path
        df = pd.read_csv(source_path)
        df.to_csv(self.rest_file_path, index=False)

        sample_n = min(self.request.coverage_n or 150, len(df))
        guide_df = df.sample(n=sample_n, random_state=42).reset_index(drop=True)
        guide_df.to_csv(self.guide_file_path, index=False)

        if self.request.taskId and self.request.userId:
            try:
                records = guide_df.replace({np.nan: None}).to_dict(orient='records')
                annotations_to_insert = []
                for idx, row in enumerate(records):
                    clean_row = {str(k): str(v) for k, v in row.items() if v is not None}
                    annotation = {
                        "taskId": self.request.taskId,
                        "sampleId": idx + 1,
                        "sampleContent": clean_row,
                        "labels": [],
                        "source": "guide",
                        "aiAnnotation": None,
                        "createdBy": self.request.userId,
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }
                    annotations_to_insert.append(annotation)

                collection = get_collection("AnnotationDetails")
                collection.delete_many({
                    "taskId": self.request.taskId,
                    "source": "guide"
                })
                if annotations_to_insert:
                    collection.insert_many(annotations_to_insert)
                    print(f"Successfully inserted {len(annotations_to_insert)} random guide annotations into MongoDB.")
            except Exception as e:
                print(f"Failed to insert random guide annotations to MongoDB: {e}")
    
    def coverage_sample(self):
        rest_path = Path(self.rest_file_path)
        source_path = rest_path
        if not rest_path.exists():
            source_path = self.project_root / 'shared_uploads' / self.request.file_path
        df = pd.read_csv(source_path)
        if not rest_path.exists():
            df.to_csv(rest_path, index=False)  # persist the FULL remaining set
        # Cap the candidate pool (in-memory only) before embedding — no-op unless
        # SAMPLING_CANDIDATE_CAP is set. The full rest set above is untouched.
        df = apply_candidate_cap(df)
        obj = CoverageBasedSampling(
            df = df,
            model = get_embedding_model()
        )
        

        text_col = "text_combined"
        if text_col not in df.columns:
            if self.request.text_col:
                text_col = self.request.text_col[0]
            else:
                text_col = "text"
        coverage_n = self.request.coverage_n or 150
        coverage_sampling_results = obj.sample(n=coverage_n, text_col=text_col)
        coverage_sampling_results.to_csv(self.guide_file_path, index=False)

        # Push the guide dataset into MongoDB AnnotationDetails
        if self.request.taskId and self.request.userId:
            try:
                # We need to drop NaN values and ensure it's a dict of strings/primitives
                records = coverage_sampling_results.replace({np.nan: None}).to_dict(orient='records')
                
                annotations_to_insert = []
                for idx, row in enumerate(records):
                    # Remove None values
                    clean_row = {str(k): str(v) for k, v in row.items() if v is not None}
                    
                    annotation = {
                        "taskId": self.request.taskId,
                        "sampleId": idx + 1,
                        "sampleContent": clean_row,
                        "labels": [],
                        "source": "guide",
                        "aiAnnotation": None,
                        "createdBy": self.request.userId,
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }
                    annotations_to_insert.append(annotation)
                
                if annotations_to_insert:
                    collection = get_collection("AnnotationDetails")
                    collection.delete_many({
                        "taskId": self.request.taskId,
                        "source": "guide"
                    })
                    collection.insert_many(annotations_to_insert)
                    print(f"Successfully inserted {len(annotations_to_insert)} guide annotations into MongoDB.")
            except Exception as e:
                print(f"Failed to insert guide annotations to MongoDB: {e}")
