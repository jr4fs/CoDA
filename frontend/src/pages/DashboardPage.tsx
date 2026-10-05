import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { AnnotationItem } from "@common/types/annotations";
import type { Task } from "@common/types/tasks";

import SessionDetails from "@/components/dashboard/SessionDetails";
import TaskSummaryCard from "@/components/dashboard/TaskSummaryCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { getTaskAnnotations } from "@/services/annotations.service";
import { getValEvalProgress, runValEvaluation } from "@/services/metrics.service";
import { getTaskById } from "@/services/tasks.service";
import { isDashboardTabId, type DashboardTabId } from "@/types/dashboard";
import { getSessionSummary, type SessionSummary } from "@/utils/dashboard/sessionMetrics";

const DEFAULT_TAB: DashboardTabId = "session-details";

export default function DashboardPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [task, setTask] = useState<Task | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const requestedTab = searchParams.get("tab");
  const activeTab = isDashboardTabId(requestedTab) ? requestedTab : DEFAULT_TAB;

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([getTaskById(taskId), getTaskAnnotations(taskId)])
      .then(([taskData, annotationData]) => {
        if (cancelled) return;

        const loadedTask: Task = taskData.task ?? taskData;
        const loadedAnnotations = annotationData.annotations ?? [];
        setTask(loadedTask);
        setAnnotations(loadedAnnotations);
        setSessionSummary(getSessionSummary(loadedAnnotations));
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load dashboard data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const updateProgress = async () => {
      try {
        const nextProgress = await getValEvalProgress(taskId);
        if (cancelled) return false;

        setProgress({ completed: nextProgress.completed, total: nextProgress.total });

        const stillRunning = nextProgress.total > 0 && !nextProgress.done &&
          nextProgress.completed < nextProgress.total;
        setIsRunning(stillRunning);

        if (!stillRunning && intervalId) clearInterval(intervalId);
        return stillRunning;
      } catch {
        return false;
      }
    };

    void updateProgress().then((stillRunning) => {
      if (!cancelled && stillRunning) {
        intervalId = setInterval(() => void updateProgress(), 1500);
      }
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [taskId]);

  const handleTabChange = (value: string) => {
    if (!isDashboardTabId(value)) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", value);
    setSearchParams(nextParams);
  };

  const handleRunEvaluation = async () => {
    if (!taskId) return;

    setIsRunning(true);
    setProgress({ completed: 0, total: 0 });

    const pollInterval = setInterval(async () => {
      try {
        const nextProgress = await getValEvalProgress(taskId);
        setProgress({ completed: nextProgress.completed, total: nextProgress.total });
        if (nextProgress.done) clearInterval(pollInterval);
      } catch {
        // A later poll can recover from a transient request failure.
      }
    }, 1500);

    try {
      const result = await runValEvaluation(taskId);
      clearInterval(pollInterval);

      if (result.success && result.evalResults) {
        setTask((currentTask) => currentTask ? { ...currentTask, evalResults: result.evalResults } : currentTask);
        toast.success("Evaluation complete");
      } else {
        toast.error(result.message || "Evaluation failed");
      }
    } catch {
      clearInterval(pollInterval);
      toast.error("Evaluation failed");
    } finally {
      setIsRunning(false);
    }
  };

  if (loading) {
    return (
      <main className="dashboard-shell grid place-items-center px-6 py-12">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
          Loading task dashboard…
        </div>
      </main>
    );
  }

  if (!task) {
    return (
      <main className="dashboard-shell grid place-items-center px-6 py-12">
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-card-foreground">
            Task not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This task may have been removed or you may not have access to it.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex h-9 items-center justify-center rounded-md !border-0 bg-primary !px-4 !py-0 !text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => navigate("/home")}
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  const progressPercent = progress.total ? (progress.completed / progress.total) * 100 : 0;

  return (
    <main className="dashboard-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1138px] flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="!text-[26px] font-semibold !leading-normal text-foreground">
            Task Dashboard
          </h1>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="!border-0 !p-0 !text-[12px] font-normal !leading-normal text-primary hover:underline focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ← Back
          </button>
        </header>

        <TaskSummaryCard
          task={task}
          summary={sessionSummary}
          isRunning={isRunning}
          onRunEvaluation={handleRunEvaluation}
          onCreateTask={() => navigate("/new-codebook")}
        />

        {isRunning && (
          <section
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            aria-label="Evaluation progress"
          >
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>
                {progress.total > 0
                  ? `${progress.completed} of ${progress.total} rows evaluated`
                  : "Starting final evaluation…"}
              </span>
              {progress.total > 0 && (
                <span className="font-dashboard text-foreground">
                  {Math.round(progressPercent)}%
                </span>
              )}
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPercent)}
            >
              <div
                className="h-full rounded-full bg-success transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </section>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-3">
          <TabsList className="h-auto w-fit justify-start gap-3 rounded-none bg-transparent p-0">
            <DashboardTabTrigger value="session-details">
              Session Details
            </DashboardTabTrigger>
            <DashboardTabTrigger value="model-performance">
              Model Performance
            </DashboardTabTrigger>
            <DashboardTabTrigger value="data-analysis">
              Data Analysis
            </DashboardTabTrigger>
          </TabsList>

          <TabsContent value="session-details">
            <SessionDetails
              task={task}
              annotations={annotations}
              evaluationTotal={progress.total}
            />
          </TabsContent>

          <TabsContent value="model-performance">
            <DashboardPlaceholder>Model performance coming next.</DashboardPlaceholder>
          </TabsContent>

          <TabsContent value="data-analysis">
            <DashboardPlaceholder>Data analysis coming next.</DashboardPlaceholder>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function DashboardTabTrigger({ value, children }: { value: DashboardTabId; children: string }) {
  return (
    <TabsTrigger
      value={value}
      className="relative h-auto flex-none rounded-none !border-0 bg-transparent !px-0 !py-2 !text-[12px] font-normal text-[#404040] shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-transparent after:content-[''] hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
    >
      {children}
    </TabsTrigger>
  );
}

function DashboardPlaceholder({ children }: { children: string }) {
  return <p className="py-3 text-xs text-muted-foreground">{children}</p>;
}
