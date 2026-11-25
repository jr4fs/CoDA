import Papa from "papaparse";

export function separateDatasets(allCsv: string, valCsv: string, allId: string, valId: string, excludedRows: number[] = [], matchText = false) {
  const all = Papa.parse<Record<string, string>>(allCsv, { header: true, skipEmptyLines: true });
  const val = Papa.parse<Record<string, string>>(valCsv, { header: true, skipEmptyLines: true });
  if ([...all.errors, ...val.errors].some((error) => error.code !== "UndetectableDelimiter")) throw new Error("Could not parse the dataset CSV files.");
  if (!all.meta.fields?.includes(allId) || !val.meta.fields?.includes(valId)) throw new Error("The matching column is missing from a dataset.");
  const key = (value: string | undefined) => matchText ? (value ?? "").trim().replace(/\s+/g, " ") : (value ?? "").trim();
  const ids = new Set(val.data.map((row) => key(row[valId])).filter(Boolean));
  const missingVal = val.data.filter((row) => !key(row[valId])).length;
  const excluded = new Set(excludedRows);
  const remaining = all.data.filter((row, index) => !excluded.has(index) && !ids.has(key(row[allId])));
  const missingAll = remaining.filter((row) => !key(row[allId])).length;
  if (!remaining.length) throw new Error("No D_all rows remain after removing D_val matches.");
  return { csv: Papa.unparse({ fields: all.meta.fields, data: remaining }), removed: all.data.length - remaining.length, missingAll, missingVal };
}
