import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import type { DataAnalysisResponse } from "@common/types/dataAnalysis";
import type { NormalizedRecord } from "@/types/dashboard";
import type { IdSummary } from "@/utils/dashboard/dashboardMetrics";
import type { AnalysisLabel } from "@/components/dashboard/RecordAnalyticsDialog";

/** Copy the actual Recharts SVG with its theme and label styles resolved. */
interface ChartVector { element: SVGSVGElement; width: number; height: number }

function chartVector(container: HTMLElement | null): ChartVector | null {
  const svg = container?.querySelector("svg.recharts-surface") as SVGSVGElement | null;
  if (!svg) return null;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  const properties = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline"];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    const target = copies[index] as SVGElement;
    properties.forEach((property) => target.style.setProperty(property, style.getPropertyValue(property)));
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const width = svg.viewBox.baseVal.width || svg.getBoundingClientRect().width;
  const height = svg.viewBox.baseVal.height || svg.getBoundingClientRect().height;
  if (!width || !height) throw new Error("Chart is not ready to export.");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return { element: clone, width, height };
}

function labelColor(label: AnalysisLabel): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = label.color;
  (document.querySelector(".dashboard-shell") ?? document.body).appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const rgb = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [57, 107, 198];
  return [rgb[0], rgb[1], rgb[2]];
}

class Report {
  private pdf = new jsPDF();
  private y = 20;
  private width = this.pdf.internal.pageSize.getWidth();
  private space(height: number) {
    if (this.y + height > this.pdf.internal.pageSize.getHeight() - 18) { this.pdf.addPage(); this.y = 20; }
  }
  keepWithNext(height: number) { this.space(height); }
  heading(text: string) {
    this.space(19);
    if (this.y > 20) this.y += 3;
    this.pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(30, 41, 59);
    this.pdf.text(text, 16, this.y);
    this.y += 8;
  }
  text(text: string, bold = false) {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(10).setTextColor(55, 65, 81);
    const lines: string[] = this.pdf.splitTextToSize(text || " ", this.width - 32);
    for (const line of lines) { this.space(6); this.pdf.text(line, 16, this.y); this.y += 5; }
  }
  async chart(chart: ChartVector | null, emptyMessage: string) {
    if (!chart) { this.text(emptyMessage); return; }
    const height = (this.width - 32) * chart.height / chart.width;
    this.space(height + 5);
    // svg2pdf writes PDF paths and selectable text, preserving sharpness at any zoom.
    await svg2pdf(chart.element, this.pdf, { x: 16, y: this.y, width: this.width - 32, height });
    this.y += height + 5;
  }
  legend(labels: AnalysisLabel[]) {
    this.pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(55, 65, 81);
    let x = 16;
    for (const label of labels) {
      const rgb = labelColor(label);
      const width = this.pdf.getTextWidth(label.label) + 10;
      if (x + width > this.width - 16) { this.y += 6; x = 16; }
      this.space(7);
      this.pdf.setFillColor(rgb[0], rgb[1], rgb[2]).circle(x + 1.5, this.y - 1, 1.2, "F");
      this.pdf.text(label.label, x + 4, this.y);
      x += width;
    }
    this.y += 9;
  }
  labelStrip(labels: AnalysisLabel[], counts: Record<string, number>) {
    const total = labels.reduce((sum, label) => sum + (counts[label.key] ?? 0), 0);
    if (!total) return;
    this.space(10);
    let x = 16;
    labels.forEach((label) => {
      const width = (this.width - 32) * (counts[label.key] ?? 0) / total;
      const [red, green, blue] = labelColor(label);
      this.pdf.setFillColor(red, green, blue).rect(x, this.y, width, 5, "F");
      x += width;
    });
    this.y += 10;
  }
  save(name: string) { this.pdf.save(`${name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "report"}.pdf`); }
}

export async function exportAggregateReport(taskName: string, data: DataAnalysisResponse, labels: AnalysisLabel[], charts: { proportion: HTMLElement | null; count: HTMLElement | null; distribution: HTMLElement | null }) {
  const proportion = chartVector(charts.proportion);
  const count = chartVector(charts.count);
  const distribution = chartVector(charts.distribution);
  if (data.predictionStatus === "ready" && data.hasTimestamp && data.overTime.length && (!proportion || !count)) throw new Error("Time charts are not ready.");
  if (data.predictionStatus === "ready" && data.distribution.length && !distribution) throw new Error("Distribution chart is not ready.");
  const report = new Report();
  report.heading(`${taskName} - Data analysis`);
  report.heading("Label distribution over time - Proportion");
  await report.chart(proportion, "No dated predictions are available.");
  if (proportion) report.legend(labels);
  report.heading("Label distribution over time - Count");
  await report.chart(count, "No dated predictions are available.");
  if (count) report.legend(labels);
  report.heading("Predicted label distribution");
  await report.chart(distribution, "No recognized predictions are available.");
  report.heading("Dataset overview");
  report.text(`Total records: ${data.overview.totalEntries.toLocaleString()} | Unique IDs: ${data.overview.uniqueIds.toLocaleString()} | Average records per ID: ${data.overview.averageEntriesPerId.toFixed(2)}`);
  report.text(`Classified: ${data.classifiedCount.toLocaleString()} | Unclassified: ${data.unclassifiedCount.toLocaleString()} | Multiple labels: ${data.multiLabelCount.toLocaleString()}`);
  if (data.multiLabelCount) report.text("Records may have multiple labels; label percentages may add to more than 100%.");
  report.save(`${taskName}-analysis`);
}

export async function exportRecordReport(summary: IdSummary, records: NormalizedRecord[], labels: AnalysisLabel[], chart: HTMLElement | null, filter: string) {
  const activity = chartVector(chart);
  const report = new Report();
  const dated = records.filter((record) => record.timestamp).sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());
  const date = (value?: Date) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(value) : "Unavailable";
  report.heading(`ID: ${summary.id}`);
  report.heading("Label Distribution");
  report.labelStrip(labels, summary.labelCounts);
  labels.forEach((label) => report.text(`${label.label}: ${(summary.labelCounts[label.key] ?? 0).toLocaleString()}`));
  report.heading("Key Details");
  report.text(`Total records: ${summary.activityCount.toLocaleString()} | First record: ${date(dated[0]?.timestamp)} | Latest record: ${date(summary.lastActivity)}`);
  if (dated[0]?.timestamp && summary.lastActivity) {
    const months = Math.max(0, (summary.lastActivity.getUTCFullYear() - dated[0].timestamp.getUTCFullYear()) * 12 + summary.lastActivity.getUTCMonth() - dated[0].timestamp.getUTCMonth());
    const years = Math.floor(months / 12);
    const remainder = months % 12;
    const span = [years ? `${years} ${years === 1 ? "year" : "years"}` : "", remainder ? `${remainder} ${remainder === 1 ? "month" : "months"}` : ""].filter(Boolean).join(", ") || "Less than one month";
    report.text(`Active span: ${span}`);
  } else report.text("Active span: Unavailable");
  report.heading("Activity Over Time");
  if (filter !== "all") report.text(`Chart filter: ${labels.find((label) => label.key === filter)?.label ?? filter}`);
  await report.chart(activity, "No valid activity dates are available for this record.");
  if (activity) report.legend(labels);
  report.heading("Timeline - all records");
  const timeline = [...records].sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0));
  if (!timeline.length) report.text("No record details are available.");
  timeline.forEach((record) => {
    report.keepWithNext(18);
    const names = record.labels ?? (record.label ? [record.label] : []);
    report.text(`${date(record.timestamp)} | ${names.map((name) => labels.find((label) => label.key === name)?.label ?? name).join(", ") || "Prediction unavailable"}`, true);
    report.text(record.text || "No record text is available.");
    report.text(" ");
  });
  report.save(`data-analysis-${summary.id}`);
}
