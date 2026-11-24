import Papa from "papaparse";

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
