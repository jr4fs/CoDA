/** New evaluation exports encode arrays as JSON; historical CSVs use commas. */
export function parseEvaluationLabels(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  const text = String(value ?? "");
  if (text.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string"))
        return parsed;
    } catch {
      /* Historical labels may begin with a bracket. */
    }
  }
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
