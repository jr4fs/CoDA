import type {
  DatasetColumnConfig,
  NormalizedRecord,
} from "../../types/dashboard";

export function normalizeDataset(
  rows: Record<string, unknown>[],
  config: DatasetColumnConfig,
): NormalizedRecord[] {
  return rows.map((row) => {
    const text = cleanString(row[config.textColumn]);

    const label = config.labelColumn
      ? cleanString(row[config.labelColumn])
      : undefined;

    const id = config.idColumn
      ? cleanString(row[config.idColumn])
      : "";

    const timestamp = config.timestampColumn
      ? parseTimestamp(row[config.timestampColumn])
      : undefined;

    return {
      id,
      text,
      label,
      timestamp,
      raw: row,
    };
  });
}

export function countMultiLabelRows(rows: Record<string, unknown>[], labelColumn: string): number {
  return rows.filter((row) => cleanString(row[labelColumn]).split(",").filter(Boolean).length > 1).length;
}

export function detectDatasetColumns(
  rows: Record<string, unknown>[],
): DatasetColumnConfig | undefined {
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) return undefined;

  const idColumn = findColumn(headers, (header) => {
    const name = normalizeHeader(header);
    return /(^| )(id|identifier|case number|case no|record id|participant id|client id|patient id|youth id)( |$)/.test(name)
      || /(^| )id$/.test(name)
      || /(^| )(id number|id no|identifier)$/.test(name);
  });
  const timestampColumn = findColumn(headers, (header) =>
    /(^| )(date|timestamp|time|created at|updated at|event date|entry date)( |$)/.test(
      normalizeHeader(header),
    ),
  );
  const labelColumn = findColumn(headers, (header) =>
    /(^| )(generated label|tasklabel|task label|label|classification|category)( |$)/.test(
      normalizeHeader(header),
    ),
  );
  const textColumn = headers.find(
    (header) => header !== idColumn && header !== timestampColumn && header !== labelColumn,
  );

  if (!textColumn) return undefined;

  const dates = timestampColumn
    ? rows.map((row) => row[timestampColumn]).filter((value) => cleanString(value) !== "")
    : [];
  const timestampIsUsable = dates.length > 0
    && dates.filter((value) => parseTimestamp(value) !== undefined).length / dates.length >= 0.8;

  return {
    textColumn,
    ...(labelColumn ? { labelColumn } : {}),
    ...(idColumn ? { idColumn } : {}),
    ...(timestampIsUsable && timestampColumn ? { timestampColumn } : {}),
  };
}

function parseTimestamp(value: unknown): Date | undefined {
  const input = cleanString(value);
  if (!input) return undefined;

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.exec(input);
  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  let date: Date;

  if (isoDate) {
    const [, year, month, day] = isoDate;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const calendarDate = new Date(Date.UTC(y, m - 1, d));
    if (
      calendarDate.getUTCFullYear() !== y
      || calendarDate.getUTCMonth() !== m - 1
      || calendarDate.getUTCDate() !== d
    ) return undefined;
    date = new Date(input.length === 10 ? `${input}T00:00:00Z` : input);
  } else if (usDate) {
    const [, month, day, year] = usDate;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y
      || date.getUTCMonth() !== m - 1
      || date.getUTCDate() !== d
    ) return undefined;
  } else {
    return undefined;
  }

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function cleanString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function findColumn(
  headers: string[],
  matches: (header: string) => boolean,
): string | undefined {
  return headers.find(matches);
}
