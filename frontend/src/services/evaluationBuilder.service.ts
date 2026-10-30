import type {
  EvaluationBuilderState,
  EvidenceSpan,
} from "@common/types/evaluationBuilder";
import { apiClient } from "../lib/apiClient";

const url = (id: string) => `/api/tasks/${encodeURIComponent(id)}/evaluation`;
export const fetchEvaluationBuilder = async (id: string) =>
  (await apiClient.get<EvaluationBuilderState>(url(id))).data;
export const nextEvaluationRound = async (id: string) =>
  apiClient.post(`${url(id)}/next`);
export const freezeEvaluation = async (id: string) =>
  apiClient.post(`${url(id)}/freeze`);
export const completeEvaluationRound = async (
  id: string,
  roundNumber: number,
  revision: number,
) =>
  (
    await apiClient.post<EvaluationBuilderState>(`${url(id)}/complete-round`, {
      roundNumber,
      revision,
    })
  ).data;
export const saveEvaluationReview = async (
  id: string,
  roundNumber: number,
  revision: number,
  recordId: string,
  labels: string[],
  spans: EvidenceSpan[],
) =>
  (
    await apiClient.put<EvaluationBuilderState>(`${url(id)}/review`, {
      roundNumber,
      revision,
      recordId,
      labels,
      spans,
    })
  ).data;
