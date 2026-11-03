export interface AnalysisOverview {
  totalEntries: number;
  uniqueIds: number;
  averageEntriesPerId: number;
  missingIds: number;
}

export interface AnalysisLabelCount {
  label: string;
  count: number;
  proportion: number;
}

export interface AnalysisPeriod {
  period: string;
  total: number;
  counts: Record<string, number>;
  proportions: Record<string, number>;
}

export interface AnalysisId {
  id: string;
  activityCount: number;
  labelCounts: Record<string, number>;
  lastActivity?: string;
}

export interface DataAnalysisResponse {
  success: boolean;
  status: "ready" | "unavailable";
  source: "d_all";
  predictionStatus: "pending" | "ready" | "error";
  overview: AnalysisOverview;
  distribution: AnalysisLabelCount[];
  overTime: AnalysisPeriod[];
  hasTimestamp: boolean;
  classifiedCount: number;
  multiLabelCount: number;
  unclassifiedCount: number;
  datedClassifiedCount: number;
  ids: AnalysisId[];
  totalIds: number;
  page: number;
  pageSize: number;
}

export interface AnalysisRecord {
  id: string;
  text: string;
  labels: string[];
  timestamp?: string;
}
