from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import pandas as pd

class Label(BaseModel):
    name: str = Field(..., min_length=1)
    definition: str = Field(..., min_length=1)
    keywords: List[str] = Field(default_factory=list)

class EmbedDatasetRequest(BaseModel):
    file_path: str = Field(..., min_length=1)
    text_col: List[str] = Field(..., min_length=1)
    id_col: Optional[str] = None
    split_to_sentences: Optional[bool] = True
    labels: List[Label]
    label_col: str = Field(..., min_length=1)
    taskId: Optional[str] = None
    userId: Optional[str] = None
    coverage_n: Optional[int] = Field(None, ge=1)
    use_representative_sampling: Optional[bool] = True

class EmbedDatasetResponse(BaseModel):
    success: bool
    val_created: bool
    rest_created: bool
    file_name: str = Field(..., min_length=1)
    val_data: List[Dict[str, Any]] 
    
