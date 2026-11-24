import Papa from "papaparse";

export function findIdColumn(columns: string[]): string {
  const exact = columns.filter((column) => column.trim().toLowerCase() === "id");
  if (exact.length === 1) return exact[0];
  const candidates = columns.filter((column) => /(?:^|[^a-z0-9])id(?:$|[^a-z0-9])|identifier/i.test(column.trim()) || /[a-z0-9]Id$/.test(column.trim()));
  if (candidates.length !== 1) throw new Error(candidates.length ? "Multiple possible ID columns found; use a single unambiguous ID column." : "No ID column found in the dataset.");
  return candidates[0];
}

export function separateDatasets(allCsv: string, valCsv: string, allId: string, valId: string, excludedRows: number[] = []) {
  const all = Papa.parse<Record<string, string>>(allCsv, { header: true, skipEmptyLines: true });
  const val = Papa.parse<Record<string, string>>(valCsv, { header: true, skipEmptyLines: true });
  if (all.errors.length || val.errors.length) throw new Error("Could not parse the dataset CSV files.");
  if (!all.meta.fields?.includes(allId) || !val.meta.fields?.includes(valId)) throw new Error("The configured record ID column is missing from a dataset.");
  const ids = new Set(val.data.map((row) => (row[valId] ?? "").trim()).filter(Boolean));
  const missingVal = val.data.filter((row) => !(row[valId] ?? "").trim()).length;
  const excluded = new Set(excludedRows);
  const remaining = all.data.filter((row, index) => !excluded.has(index) && !ids.has((row[allId] ?? "").trim()));
  const missingAll = remaining.filter((row) => !(row[allId] ?? "").trim()).length;
  if (!remaining.length) throw new Error("No D_all rows remain after removing D_val matches.");
  return { csv: Papa.unparse({ fields: all.meta.fields, data: remaining }), removed: all.data.length - remaining.length, missingAll, missingVal };
}
