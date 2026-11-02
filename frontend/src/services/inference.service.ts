import { apiClient } from "../lib/apiClient";
import { InferenceRequest, InferenceResponse, BatchInferenceRequest, BatchInferenceSummary } from '@common/types/inference';
import { AxiosError } from "axios";

export interface ModelOption {
  value: string;
  label: string;
}

export async function getAvailableModels(): Promise<ModelOption[]> {
  const { data } = await apiClient.get<ModelOption[]>("/api/inference/models");
  return data;
}

export async function inference(
  payload: InferenceRequest
): Promise<InferenceResponse> {
  try {
    const { data } = await apiClient.post<InferenceResponse>(
      "/api/inference/",
      payload
    );
    return data;
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error("[AI Annotation] API Error:", error.response?.data || error.message);
      throw error;
    }
    throw error;
  }
}

export async function batchInference(
  payload: BatchInferenceRequest[]
): Promise<BatchInferenceSummary> {
  try {
    const { data } = await apiClient.post<BatchInferenceSummary>(
      "/api/inference/batch-inference",
      payload
    );
    return data;
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error("[Batch AI Annotation] API Error:", error.response?.data || error.message);
      throw error;
    }
    throw error;
  }
}
