import type { DatasetColumnConfig, NormalizedRecord } from "../../types/dashboard";

export function normalizeDataset(
  rows: Record<string, unknown>[],
  config: DatasetColumnConfig,
): NormalizedRecord[] {
  return rows.map((row, index) => {
    const text = String(row[config.textColumn] ?? "");
    const label = config.labelColumn ? String(row[config.labelColumn] ?? "") : undefined;
    const id = config.idColumn ? String(row[config.idColumn] ?? index) : String(index);
    const timestamp = config.timestampColumn
      ? parseTimestamp(row[config.timestampColumn])
      : undefined;

    return { id, text, label, timestamp, raw: row };
  });
}

function parseTimestamp(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
