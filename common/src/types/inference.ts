import { LabelItem } from "./tasks";

export interface InferenceRequest {
  labels: LabelItem[];
  task_definition: string;
  text: string;
  model_name: string;
  user_input?: string;
  task_type: string;
}

export interface InferenceResponse {
  model_name: string;
  label: string[];
  span_text: string;
  reason: string;
  raw_response?: string;
  system_prompt?: string;
  user_prompt?: string;
  task_type: string;
  tokens: number;
  time: number;
}

export interface BatchInferenceRequest extends InferenceRequest {
  ground_truth_labels: LabelItem[];
}

export interface BatchInferenceResponse {
  model_name: string;
  is_correct: boolean;
  tokens: number;
  time: number;
}

export interface BatchInferenceSummary {
  results: BatchInferenceResponse[];
  accuracy: number;
}

