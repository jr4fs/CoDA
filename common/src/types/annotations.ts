export interface AnnotationItem {
  _id?: string;
  taskId: string;
  sampleId: number;
  sampleContent: Record<string, string>;
  labels: string[];
  source: "val" | "guide";
  aiAnnotation: AIAssisted | null;
  createdBy: string; //userId
  createdAt: string; //ISO string
}

export interface AIAssisted {
  batchID: string | null;
  batchNum?: number | null;
  label: string[];
  reason: string;
  span_text: string;
  isCorrect: boolean | null;
  feedback: string;
  spanFeedback: boolean | null;
  reasoningFeedback: boolean | null;
  correctLabel?: string | null;
  correctLabels?: string[];
  predictionRaw?: string | null;
  timeToCompleteMs?: number | null;
  codebookSnapshot?: string[];
  guidelinesAdded?: string[];
  guidelinesDeprecated?: string[];
  guidelinesRevised?: Array<{ from: string; to: string }>;
}

export interface AddAnnotationRequest {
  taskId: string;
  sampleId: number;
  annotationSampleRow: Record<string, string>;
  labels: string[];
}

export interface AddAnnotationResponse {
  success: boolean;
  message: string;
  annotationId: string;
}

export interface UpdateValAnnotationRequest {
  annotationId: string;
  labels: string[];
}

export interface UpdateValAnnotationResponse {
  success: boolean;
  message: string;
}

export interface UpdateGuideAnnotationRequest {
  taskId: string;
  sampleId: number;
  sampleContent: Record<string, string>;
  labels?: string[]; // user labels (optional if AI only initially)
  source: "val" | "guide";
  aiAnnotation: AIAssisted | null;
}

export interface UpdateGuideAnnotationResponse {
  success: boolean;
  message: string;
  annotationId?: string;
}

export interface GetTaskAnnotationsResponse {
  success: boolean;
  taskId?: string;
  annotations?: AnnotationItem[];
  message?: string;
}
