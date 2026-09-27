export const DASHBOARD_TAB_IDS = [
  "session-details",
  "model-performance",
  "data-analysis",
] as const;

export type DashboardTabId = (typeof DASHBOARD_TAB_IDS)[number];

export function isDashboardTabId(
  value: string | null,
): value is DashboardTabId {
  return DASHBOARD_TAB_IDS.some((tabId) => tabId === value);
}

export interface DatasetColumnConfig {
  textColumn: string;
  labelColumn?: string;
  idColumn?: string;
  timestampColumn?: string;
}

export interface NormalizedRecord {
  id: string;
  text: string;

  label?: string;
  timestamp?: Date;

  // preserve original record
  raw: Record<string, unknown>;
}
