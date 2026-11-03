import type { Task } from "./tasks";

/** Offsets are half-open UTF-16 indices into the immutable record text. */
export interface EvidenceSpan {
  label: string;
  start: number;
  end: number;
  text: string;
}

export interface EvaluationRecord {
  recordId: string;
  text: string;
  sampleContent: Record<string, string>;
  labels: string[];
  spans: EvidenceSpan[];
  reviewed: boolean;
}

export interface EvaluationRound {
  dataset?: { totalRecords: number; eligibleRecords: number };
  taskId: string;
  number: number;
  revision: number;
  status: "draft" | "complete";
  records: EvaluationRecord[];
  quotas: Record<string, number>;
  createdAt: string;
  completedAt?: string;
}

export interface EvaluationBuild {
  phase: "collecting" | "sampling" | "freezing" | "frozen" | "error";
  batchSize: number;
  targetPerLabel: number;
  guideSize: number;
  round: number;
  totalRecords?: number;
  eligibleRecords?: number;
  error?: string;
  jobId?: string;
  jobStartedAt?: string;
  frozenAt?: string;
}

export interface EvaluationBuilderState {
  task: Task;
  round: EvaluationRound | null;
  counts: Record<string, number>;
  reviewedCount: number;
  remainingCount: number | null;
  targetsMet: boolean;
  exhausted: boolean;
}
