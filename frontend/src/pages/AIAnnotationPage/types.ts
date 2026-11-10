import { AnnotationItem } from "@common/types/annotations";

export interface CsvRow {
  [key: string]: string;
}

export interface AIAssisted {
  taskID: string | null;
  batchID: string | null;
  batchNum: number | null;
  label: string[];
  reason: string;
  span_text: string;
  isCorrect: boolean | null;
  feedback: string;
  spanFeedback: boolean | null;
  reasoningFeedback: boolean | null;
  correctLabel: string | null;
  correctLabels?: string[];
  predictionRaw: string | null;
  timeToCompleteMs: number | null;
  codebookSnapshot: string[];
  guidelinesAdded: string[];
  guidelinesDeprecated: string[];
  guidelinesRevised: Array<{ from: string; to: string }>;
}

export type SamplingStatus = "sampling_pending" | "ready" | "sampling_error" | null;

export interface MetricsFiles {
  sample?: string;
  metadata?: string;
  batch?: string;
}

export type BatchResults = Record<number, AIAssisted>;

export interface SampleStart {
  startedAt: number;
  codebook: string[];
}

export type SampleStarts = Record<number, SampleStart>;

export type GuideAnnotation = AnnotationItem;
