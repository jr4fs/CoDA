import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { AnnotationItem } from "@common/types/annotations";
import type { Task } from "@common/types/tasks";

import SessionDetails from "@/components/dashboard/SessionDetails";
import TaskSummaryCard from "@/components/dashboard/TaskSummaryCard";
import ModelPerformance from "@/components/dashboard/ModelPerformance";
import DataAnalysis from "@/components/dashboard/DataAnalysis";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { getTaskAnnotations } from "@/services/annotations.service";
import { fetchEvaluationBuilder } from "@/services/evaluationBuilder.service";
import {
  downloadMetricsFile,
  cancelValEval,
  getValEvalProgress,
  runValEvaluation,
} from "@/services/metrics.service";
import { downloadAnnotationOutputFile, downloadTaskDataset, getAutoLabelProgress, getTaskById } from "@/services/tasks.service";
import { downloadContent } from "@/utils/downloadContent";
import { Download } from "lucide-react";
import { buildCodebookExport } from "@/utils/dashboard/codebookExport";
import {
  isDashboardTabId,
  type DashboardTabId,
} from "@/types/dashboard";
import {
  getSessionSummary,
  type SessionSummary,
} from "@/utils/dashboard/sessionMetrics";

const DEFAULT_TAB: DashboardTabId = "session-details";
const downloadButtonClass = "inline-flex min-h-10 items-center gap-2 rounded-md border border-[#319b58] bg-white px-4 text-xs font-medium text-[#247a43] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function DashboardPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [task, setTask] = useState<Task | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(
    null,
  );
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [evaluationReviewed, setEvaluationReviewed] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [fullProgress, setFullProgress] = useState({ completed: 0, total: 0 });
  const [fullError, setFullError] = useState<string | null>(null);
  const evaluationRunRef = useRef(0);

  const requestedTab = searchParams.get("tab");
  const activeTab = isDashboardTabId(requestedTab)
    ? requestedTab
    : DEFAULT_TAB;

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setEvaluationReviewed(null);

    getTaskById(taskId)
      .then(async (taskData) => {
        const loaded: Task = taskData.task ?? taskData;
        const annotationData = loaded.dashboardOnly ? { annotations: [] } : await getTaskAnnotations(taskId);
        if (cancelled) return;

        const loadedTask: Task = taskData.task ?? taskData;
        setTask(loadedTask);
        const loadedAnnotations = annotationData.annotations ?? [];
        setAnnotations(loadedAnnotations);
        setSessionSummary(getSessionSummary(loadedAnnotations));
        if (loadedTask.evaluationBuild) {
          void fetchEvaluationBuilder(taskId)
            .then((state) => {
              if (!cancelled) setEvaluationReviewed(state.reviewedCount);
            })
            .catch(() => {
              if (!cancelled) setEvaluationReviewed(null);
            });
        }
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
    if (!taskId || !task || task.dashboardOnly) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const updateProgress = async () => {
      try {
        const nextProgress = await getValEvalProgress(taskId);
        if (cancelled) return false;

        setProgress({
          completed: nextProgress.completed,
          total: nextProgress.total,
        });

        const stillRunning =
          nextProgress.total > 0 &&
          !nextProgress.done &&
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
  }, [taskId, task]);

  useEffect(() => {
    setFullError(null);
    setFullProgress({ completed: 0, total: 0 });
    if (!taskId || task?.finalInferenceStatus !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getAutoLabelProgress(taskId);
        if (cancelled) return;
        setFullProgress({ completed: next.completed, total: next.total });
        if (next.done && (next.error || next.cancelled || next.outputFile)) {
          if (next.error) setFullError(next.error);
          try {
            const refreshed = await getTaskById(taskId);
            if (!cancelled) setTask(refreshed.task ?? refreshed);
            return;
          } catch { /* Retry the refresh on the next poll. */ }
        }
      } catch { /* Retry transient failures. */ }
      if (!cancelled) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [taskId, task?.finalInferenceStatus]);

  const handleTabChange = (value: string) => {
    if (!isDashboardTabId(value)) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", value);
    setSearchParams(nextParams);
  };

  const handleRunEvaluation = async () => {
    if (!taskId) return;
    const runId = ++evaluationRunRef.current;

    setIsRunning(true);
    setProgress({ completed: 0, total: 0 });

    const pollInterval = setInterval(async () => {
      try {
        const nextProgress = await getValEvalProgress(taskId);
        setProgress({
          completed: nextProgress.completed,
          total: nextProgress.total,
        });
        if (nextProgress.done) clearInterval(pollInterval);
      } catch {
        // A later poll can recover from a transient request failure.
      }
    }, 1500);

    try {
      const result = await runValEvaluation(taskId, task?.codebook, "final");
      clearInterval(pollInterval);
      if (runId !== evaluationRunRef.current) return;

      if (result.success && result.evalResults) {
        setTask((currentTask) =>
          currentTask
            ? {
                ...currentTask,
                evalResults: result.evalResults,
                evaluationHistory: result.evaluationSnapshot
                  ? [
                      ...(currentTask.evaluationHistory ?? []),
                      result.evaluationSnapshot,
                    ]
                  : currentTask.evaluationHistory,
              }
            : currentTask,
        );
        // Reload the saved history as well as the latest metrics. The response
        // remains a fallback if the refresh fails after a successful evaluation.
        try {
          const refreshed = await getTaskById(taskId);
          if (runId === evaluationRunRef.current) setTask(refreshed.task ?? refreshed);
        } catch {
          // The evaluation response already populated the current results.
        }
        toast.success("Evaluation complete");
      } else {
        toast.error(result.message || "Evaluation failed");
      }
    } catch (error) {
      clearInterval(pollInterval);
      if (runId !== evaluationRunRef.current) return;
      const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      toast.error(typeof message === "string" ? message : "Final evaluation could not finish. No results were saved.");
    } finally {
      if (runId === evaluationRunRef.current) setIsRunning(false);
    }
  };

  const handleCancelEvaluation = async () => {
    if (!taskId) return;
    try {
      await cancelValEval(taskId);
      evaluationRunRef.current += 1;
      setIsRunning(false);
      toast.success("D_val evaluation cancelled");
    } catch {
      toast.error("Could not cancel D_val evaluation. Please try again.");
    }
  };

  const handleDownloadPredictions = async (filename: string) => {
    try {
      const blob = await downloadMetricsFile(filename);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Prediction results could not be downloaded.");
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
            className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => navigate("/home")}
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (task.dashboardOnly) return (
    <main className="dashboard-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1138px] flex-col gap-6">
        <header><h1 className="text-xl font-semibold">{task.name}</h1><p className="mt-1 text-sm text-muted-foreground">{task.description}</p></header>
        <DataAnalysis task={task} />
      </div>
    </main>
  );

  const progressPercent =
    progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

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
            className="border-0 p-0 !text-[12px] font-normal !leading-normal text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ← Back
          </button>
        </header>

        <TaskSummaryCard
          task={task}
          summary={sessionSummary}
          isRunning={isRunning}
          onRunEvaluation={handleRunEvaluation}
          onOpenFullInference={() => navigate(`/codebook-creation/${taskId}?results=1`)}
        />

        <section aria-label="Download results" className="flex flex-wrap items-center gap-3">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Download results</span>
          <button type="button" disabled={!task.finalInferenceFile} className={downloadButtonClass} onClick={async () => {
            if (!task.finalInferenceFile) return;
            try {
              const blob = await downloadAnnotationOutputFile(task.finalInferenceFile);
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url; link.download = task.finalInferenceFile; link.click(); URL.revokeObjectURL(url);
            } catch { toast.error("D_all predictions could not be downloaded."); }
          }}><Download size={15} aria-hidden="true" /> D_all predictions</button>
          <button type="button" disabled={!task.evalResults?.predictionsFilename} className={downloadButtonClass} onClick={() => task.evalResults?.predictionsFilename && void handleDownloadPredictions(task.evalResults.predictionsFilename)}><Download size={15} aria-hidden="true" /> D_val predictions</button>
          <button type="button" disabled={!Object.keys(task.codebookVersions ?? {}).length} className={downloadButtonClass} onClick={() => {
            downloadContent(`codebook-versions-${task._id}.json`, JSON.stringify(buildCodebookExport(task, annotations), null, 2));
          }}><Download size={15} aria-hidden="true" /> Batch codebooks</button>
        </section>

        {task.datasetSeparation && (task.datasetSeparation.missingAll > 0 || task.datasetSeparation.missingVal > 0 || (task.datasetSeparation.fullMissing ?? 0) > 0) && <section role="status" className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          Overlap is unverified for {task.datasetSeparation.missingAll} D_all and {task.datasetSeparation.missingVal} D_val rows with missing {task.datasetSeparation.matchBy === "text" ? "case notes" : "IDs"}.
          {(task.datasetSeparation.fullMissing ?? 0) > 0 && ` The full dataset also has ${task.datasetSeparation.fullMissing} rows with missing case notes.`}
        </section>}
        <div className="flex flex-wrap gap-3">
          {(["d_val", "d_all"] as const).map((kind) => <button key={kind} type="button" disabled={kind === "d_val" && !task.valFile} className="rounded-md border border-border bg-card px-3 py-2 text-xs disabled:opacity-50" onClick={async () => {
            try {
              const blob = await downloadTaskDataset(taskId!, kind);
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${kind}-${taskId}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            } catch { toast.error(`Could not download ${kind}.`); }
          }}>Download {kind}</button>)}
        </div>

        {isRunning && (
          <section
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            aria-label="Evaluation progress"
          >
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>
                {progress.total > 0
                  ? `D_val: ${progress.completed} of ${progress.total} rows evaluated`
                  : "Starting D_val evaluation…"}
              </span>
              <div className="flex items-center gap-4">
                {progress.total > 0 && <span className="font-dashboard text-foreground">{Math.round(progressPercent)}%</span>}
                <button type="button" onClick={handleCancelEvaluation} className="min-h-10 rounded-md px-2 text-destructive hover:bg-muted">
                  Cancel D_val
                </button>
              </div>
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

        {(task.finalInferenceStatus || fullError) && (
          <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm" aria-label="D_all inference progress" role="status">
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>{fullError ? `D_all inference failed: ${fullError}` : task.finalInferenceStatus === "ready" ? "D_all inference complete" : task.finalInferenceStatus === "error" ? "D_all inference failed" : task.finalInferenceStatus === "cancelled" ? "D_all inference cancelled" : fullProgress.total > 0 ? `D_all: ${fullProgress.completed} of ${fullProgress.total} rows labeled` : "Starting D_all inference…"}</span>
              {task.finalInferenceStatus === "running" && !fullError && fullProgress.total > 0 && <span className="font-dashboard text-foreground">{Math.round(Math.min(100, fullProgress.completed / fullProgress.total * 100))}%</span>}
            </div>
            {task.finalInferenceStatus === "running" && !fullError && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="D_all progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fullProgress.total > 0 ? Math.round(Math.min(100, fullProgress.completed / fullProgress.total * 100)) : 0}>
              <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${fullProgress.total > 0 ? Math.min(100, fullProgress.completed / fullProgress.total * 100) : 0}%` }} />
            </div>}
          </section>
        )}

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="gap-3"
        >
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
              evaluationReviewed={evaluationReviewed}
            />
          </TabsContent>

          <TabsContent value="model-performance">
              <ModelPerformance task={task} annotations={annotations} onDownloadPredictions={handleDownloadPredictions} />
          </TabsContent>

          <TabsContent value="data-analysis">
            <DataAnalysis task={task} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function DashboardTabTrigger({
  value,
  children,
}: {
  value: DashboardTabId;
  children: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="relative h-auto flex-none rounded-none border-0 bg-transparent px-0 py-2 !text-[12px] font-normal text-[#404040] shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-transparent after:content-[''] hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
    >
      {children}
    </TabsTrigger>
  );
}
