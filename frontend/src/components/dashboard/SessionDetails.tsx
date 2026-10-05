import type { AnnotationItem } from "@common/types/annotations";
import type { Task } from "@common/types/tasks";
import { Download, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import {
  getSessionSummary,
  getManualTimeEstimate,
  getUserFeedbackSummary,
  DEMO_MANUAL_MINUTES_PER_EXAMPLE,
  MANUAL_BENCHMARK_EXAMPLES,
  type UserFeedbackSummary,
} from "@/utils/dashboard/sessionMetrics";
import {
  getRemainingIssues,
  type RemainingIssue,
} from "@/utils/dashboard/sessionInsights";

interface SessionDetailsProps {
  task: Task;
  annotations: AnnotationItem[];
  evaluationTotal: number;
}

const CARD_STYLES =
  "rounded-[14px] border border-[#f3f4f6] bg-white p-[25px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]";

export default function SessionDetails({
  task,
  annotations,
  evaluationTotal,
}: SessionDetailsProps) {
  const feedback = useMemo(
    () => getUserFeedbackSummary(annotations),
    [annotations],
  );
  const summary = useMemo(() => getSessionSummary(annotations), [annotations]);
  const issues = useMemo(
    () =>
      getRemainingIssues(
        annotations,
        task.labels.map((label) => label.name),
      ),
    [annotations, task.labels],
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FinalCodebookCard task={task} />
        <FinalLabelsCard task={task} />
        <EvaluationSetupCard
          task={task}
          annotations={annotations}
          evaluationTotal={evaluationTotal}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <UserFeedbackCard feedback={feedback} />
        <TimeSpentCard actualTimeMs={summary.sessionTimeMs} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <SessionSummaryCard
          feedback={feedback}
          rulesCreated={summary.rulesCreated}
          macroF1={task.evalResults?.macroF1}
          issueCount={issues.length}
        />
        <RemainingIssuesCard issues={issues} />
      </div>
    </div>
  );
}

function FinalCodebookCard({ task }: { task: Task }) {
  const rules = task.codebook ?? [];
  const [showAllRules, setShowAllRules] = useState(false);
  const visibleRules = showAllRules ? rules : rules.slice(0, 3);

  const exportCodebook = () => {
    const content = rules.map((rule) => `- ${rule}`).join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = `${toSafeFilename(task.name) || "codebook"}.txt`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <section
      className={`${CARD_STYLES} flex min-h-[238px] flex-col gap-4 overflow-hidden md:col-span-2 xl:col-span-2`}
    >
      <CardTitle>Final Codebook</CardTitle>

      {visibleRules.length > 0 ? (
        <ul className="grid gap-1.5 text-xs leading-[1.3] text-[#666]">
          {visibleRules.map((rule, index) => (
            <li key={`${index}-${rule}`} className="ml-[18px] list-disc">
              <span
                className={showAllRules ? undefined : "line-clamp-2"}
                title={showAllRules ? undefined : rule}
              >
                {rule}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#808080]">No final rules yet.</p>
      )}

      <div className="mt-auto flex items-end justify-between gap-4 text-xs text-[#666]">
        {rules.length > 3 ? (
          <button
            type="button"
            onClick={() => setShowAllRules((current) => !current)}
            className="inline-flex items-center gap-1 border-0 p-0 hover:text-[#1a1a1a]"
          >
            {showAllRules ? "Show Less" : "View Full"}
            <ExternalLink className="size-3" aria-hidden="true" />
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={exportCodebook}
          disabled={rules.length === 0}
          className="inline-flex items-center gap-1 border-0 p-0 hover:text-[#1a1a1a] disabled:opacity-40"
        >
          Export
          <Download className="size-3" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function FinalLabelsCard({ task }: { task: Task }) {
  return (
    <section className={`${CARD_STYLES} min-h-[238px]`}>
      <CardTitle>Final Labels</CardTitle>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {task.labels.length > 0 ? (
          task.labels.map((label) => (
            <span
              key={label.name}
              className="inline-flex min-w-16 items-center justify-center rounded-full bg-[#cce5ff] px-3 py-2 text-xs font-semibold text-[#0274e5] uppercase"
            >
              {label.name}
            </span>
          ))
        ) : (
          <p className="text-xs text-[#808080]">No final labels yet.</p>
        )}
      </div>
    </section>
  );
}

function EvaluationSetupCard({
  task,
  annotations,
  evaluationTotal,
}: {
  task: Task;
  annotations: AnnotationItem[];
  evaluationTotal: number;
}) {
  const reviewed = annotations.filter(
    (annotation) => annotation.source === "val",
  ).length;
  const budget = Math.max(
    task.evalResults?.numSamples ?? 0,
    evaluationTotal,
    reviewed,
  );

  const details = [
    ["Model", task.modelName || "—"],
    ["Budget", budget > 0 ? `${budget} Samples` : "—"],
    ["Reviewed", budget > 0 ? `${reviewed}/${budget}` : String(reviewed)],
    ["Evaluation Set", getFileName(task.valFileName ?? task.valFile)],
    ["Dataset", getFileName(task.inputFileName ?? task.file)],
  ];

  return (
    <section className={`${CARD_STYLES} min-h-[238px]`}>
      <CardTitle>Evaluation Setup</CardTitle>

      <dl className="mt-4 grid gap-3 text-xs leading-normal">
        {details.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-center justify-between gap-3">
            <dt className="shrink-0 text-[#666]">{label}</dt>
            <dd className="min-w-0 max-w-[55%] truncate text-right font-semibold text-black" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function UserFeedbackCard({
  feedback,
}: {
  feedback: UserFeedbackSummary;
}) {
  const acceptedPercent = getExactPercent(feedback.accepted, feedback.total);
  const correctedPercent = getExactPercent(feedback.corrected, feedback.total);
  const acceptedStop = acceptedPercent;
  const correctedStop = acceptedPercent + correctedPercent;
  const chartBackground =
    feedback.total > 0
      ? `conic-gradient(#33996b 0% ${acceptedStop}%, #f09d0f ${acceptedStop}% ${correctedStop}%, #9aafca ${correctedStop}% 100%)`
      : "#e5e7eb";

  const items = [
    { label: "Accepted", count: feedback.accepted, color: "#33996b" },
    { label: "Corrected", count: feedback.corrected, color: "#f09d0f" },
    { label: "Incomplete", count: feedback.incomplete, color: "#9aafca" },
  ];

  return (
    <section className={`${CARD_STYLES} min-h-[254px] xl:col-span-2`}>
      <CardTitle>User Feedback</CardTitle>

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
        <div
          className="relative size-[152px] shrink-0 rounded-full"
          style={{ background: chartBackground }}
          role="img"
          aria-label={`${feedback.accepted} accepted, ${feedback.corrected} corrected, ${feedback.incomplete} incomplete`}
        >
          <div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
            <div>
              <p className="text-2xl font-semibold leading-normal text-[#33996b]">
                {feedback.total}
              </p>
              <p className="text-xs leading-normal text-[#99a1af]">Reviewed</p>
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 flex-1 gap-4 text-sm leading-none">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3"
            >
              <dt
                className="inline-flex items-center gap-1.5"
                style={{ color: item.color }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                {item.label}
              </dt>
              <dd className="whitespace-nowrap font-medium text-black">
                {getPercent(item.count, feedback.total)}% ({item.count})
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function TimeSpentCard({ actualTimeMs }: { actualTimeMs: number }) {
  const { manualEstimateMs, savedMs } = getManualTimeEstimate(actualTimeMs);
  return (
    <section className={`${CARD_STYLES} min-h-[254px] xl:col-span-3`}>
      <CardTitle>Time Spent</CardTitle>

      <div className="mt-6 grid items-end gap-6 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <TimeValue
          value={formatDuration(actualTimeMs)}
          label="Actual Session Time"
          color="#33996b"
        />

        <div
          className="relative mx-auto w-full max-w-sm"
          role="img"
          aria-label={savedMs === null ? "Time saved is unavailable until review time is recorded" : `${formatDuration(Math.abs(savedMs))} ${savedMs >= 0 ? "less" : "more"} than estimated manual annotation time`}
        >
          <svg
            viewBox="0 0 320 160"
            className="block w-full"
            aria-hidden="true"
          >
            <path
              d="M 16 152 A 144 144 0 0 1 304 152"
              fill="none"
              stroke="#fbe4e4"
              strokeDasharray="3 6"
              strokeWidth="14"
            />
          </svg>

          <div className="absolute inset-x-0 bottom-4 text-center">
            <p className="text-[clamp(20px,2.2vw,28px)] font-semibold leading-[1.3] whitespace-nowrap text-[#99a1af]">
              {savedMs === null ? "—" : `${savedMs < 0 ? "−" : ""}${formatDuration(Math.abs(savedMs))}`}
            </p>
            <p className="text-xs leading-[15px] text-[#666]">Estimated Time Saved</p>
          </div>
        </div>

        <TimeValue
          value={formatDuration(manualEstimateMs)}
          label="Estimated Manual Benchmark"
          color="#74211b"
        />
      </div>
      <p className="mt-3 text-[11px] leading-4 text-[#667085]">
        Demo estimate: {MANUAL_BENCHMARK_EXAMPLES} manually annotated examples at {DEMO_MANUAL_MINUTES_PER_EXAMPLE} minutes each, compared with recorded active review time. Other work is not timed.
      </p>
    </section>
  );
}

function TimeValue({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center whitespace-nowrap">
      <p
        className="text-2xl font-semibold leading-[1.3]"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-[10px] leading-[15px] text-[#666]">{label}</p>
    </div>
  );
}

function SessionSummaryCard({
  feedback,
  rulesCreated,
  macroF1,
  issueCount,
}: {
  feedback: UserFeedbackSummary;
  rulesCreated: number;
  macroF1?: number;
  issueCount: number;
}) {
  const completedReviews = feedback.accepted + feedback.corrected;

  return (
    <section className={`${CARD_STYLES} min-h-[254px] xl:col-span-2`}>
      <CardTitle>Session Summary</CardTitle>

      <div className="mt-6 space-y-5 text-xs leading-5 text-[#666]">
        <p>
          {completedReviews > 0
            ? `${feedback.corrected} of ${completedReviews} completed reviews required correction.`
            : "No completed review feedback is available yet."}{" "}
          {rulesCreated > 0
            ? `${rulesCreated} codebook ${rulesCreated === 1 ? "rule was" : "rules were"} added during review.`
            : "No new codebook rules were recorded."}{" "}
          {macroF1 == null
            ? "Final evaluation has not been run yet."
            : `Final evaluation reached an overall F1 score of ${Math.round(macroF1 * 100)}.`}
        </p>

        <p>
          {issueCount > 0 ? (
            <>
              There are still{" "}
              <span className="text-[#f09d0f]">
                {issueCount} remaining {issueCount === 1 ? "issue" : "issues"}
              </span>{" "}
              that need your attention.
            </>
          ) : (
            "No remaining label issues were identified in completed reviews."
          )}
        </p>
      </div>
    </section>
  );
}

function RemainingIssuesCard({ issues }: { issues: RemainingIssue[] }) {
  return (
    <section
      className={`${CARD_STYLES} min-h-[254px] overflow-hidden xl:col-span-3`}
    >
      <div className="flex items-center justify-between gap-4">
        <CardTitle>Remaining Issues</CardTitle>
        <p className="text-xs leading-[1.3] whitespace-nowrap text-[#f09d0f]">
          {issues.length} remaining {issues.length === 1 ? "issue" : "issues"}
        </p>
      </div>

      {issues.length > 0 ? (
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          {issues.slice(0, 2).map((issue) => (
            <div key={issue.label} className="grid content-start gap-3">
              <span className="w-fit min-w-16 rounded-full bg-[#cce5ff] px-3 py-2 text-center text-xs font-semibold text-[#0274e5] uppercase">
                {issue.label}
              </span>

              <div className="grid gap-0.5 text-xs">
                <p className="text-black">
                  <span className="font-normal text-[#666]">F1 </span>
                  <span className="font-semibold">
                    {Math.round(issue.f1 * 100)}
                  </span>
                </p>
                <p className="leading-[1.3] text-[#666]">
                  {issue.confusedWith ? (
                    <>
                      Most often confused with{" "}
                      <span className="text-[#0274e5] uppercase">
                        {issue.confusedWith}
                      </span>
                    </>
                  ) : (
                    "No dominant confusion pair identified"
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[#666]">
          No remaining label issues were identified in completed reviews.
        </p>
      )}
    </section>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <h2 className="text-sm font-semibold leading-5 text-[#1e2939]">
      {children}
    </h2>
  );
}

function getPercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function getExactPercent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

function getFileName(value?: string) {
  if (!value) return "—";
  return value.split(/[\\/]/).pop() || "—";
}

function toSafeFilename(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
