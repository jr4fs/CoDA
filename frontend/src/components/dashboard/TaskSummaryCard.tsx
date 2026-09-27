import type { Task } from "@common/types/tasks";
import type { SessionSummary } from "@/utils/dashboard/sessionMetrics";

interface TaskSummaryCardProps {
  task: Task;
  summary: SessionSummary | null;
  isRunning: boolean;
  onRunEvaluation: () => void;
  onCreateTask: () => void;
}

export default function TaskSummaryCard({
  task,
  summary,
  isRunning,
  onRunEvaluation,
  onCreateTask,
}: TaskSummaryCardProps) {
  const totalCodebookRules = task.codebook?.length ?? 0;

  return (
    <section className="rounded-[14px] border border-[#f3f4f6] bg-white p-[25px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
        {/* Metrics + task */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <SummaryMetric
              label="Samples Reviewed"
              value={summary?.samplesReviewed ?? "—"}
              subtitle={
                summary
                  ? `Across ${summary.batchesReviewed} batches`
                  : "No reviewed samples"
              }
            />

            <SummaryMetric
              label="Rules Created"
              value={summary?.rulesCreated ?? "—"}
              subtitle={`${totalCodebookRules} total codebook rules`}
            />

            <SummaryMetric
              label="Predictions Correct"
              value={summary?.predictionsCorrect ?? "—"}
              subtitle={
                summary && summary.samplesReviewed > 0
                  ? `${Math.round(
                      (summary.predictionsCorrect / summary.samplesReviewed) *
                        100,
                    )}% of samples`
                  : "No reviewed samples"
              }
            />

            <SummaryMetric
              label="Session Time"
              value={summary ? formatSessionTime(summary.sessionTimeMs) : "—"}
              subtitle="Active review time"
            />
          </div>

          {/* Task description */}
          <div className="mt-4">
            <p className="text-xs font-medium text-[#1a1a1a]">Task</p>

            <p className="mt-1 max-w-[700px] text-xs leading-[1.3] text-[#666]">
              {task.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-1 items-center justify-center gap-4">
          <button
            type="button"
            onClick={onRunEvaluation}
            disabled={isRunning}
            className="whitespace-nowrap rounded-md border-0 bg-[#319b58] px-4 py-2.5 text-xs font-medium leading-4 text-white transition-colors hover:bg-[#287f49] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Running..." : "Run final evaluation"}
          </button>

          <button
            type="button"
            onClick={onCreateTask}
            className="whitespace-nowrap rounded-md border border-[#319b58] px-4 py-2.5 text-xs font-medium leading-4 text-[#319b58] transition-colors hover:bg-emerald-50"
          >
            Create new task
          </button>
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-[#808080]">{label}</p>

      <p className="mt-1 text-xl font-medium leading-normal text-[#1a1a1a]">
        {value}
      </p>

      <p className="mt-1 truncate text-[10px] text-[#808080]">{subtitle}</p>
    </div>
  );
}

function formatSessionTime(milliseconds: number): string {
  const totalMinutes = Math.round(milliseconds / 60000);

  if (totalMinutes < 60) {
    return `${totalMinutes}min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}
