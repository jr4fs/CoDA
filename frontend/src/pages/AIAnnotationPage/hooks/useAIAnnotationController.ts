import { RuleSynthesisItem, RuleSynthesisRequest } from "@common/types/ruleSynthesis";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAITaskData } from "../../../hooks/useAITaskData";
import { toast } from "../../../lib/toast";
import {
  downloadMetricsFile,
  generateBatchMetrics,
  generateMetadataMetrics,
  generateSampleMetrics,
  getValEvalProgress,
  runValEvaluation,
} from "../../../services/metrics.service";
import { ruleSynthesis } from "../../../services/ruleSynthesis.service";
import {
  downloadAnnotationOutputFile,
  exportCodebookSnapshot,
  getAutoLabelProgress,
  markCodebookComplete,
  saveFinalInferenceResult,
  saveTaskCodebook,
  startFinalInference,
  uploadOutputFile,
} from "../../../services/tasks.service";
import { downloadContent } from "../../../utils/downloadContent";
import { INTRO_STORAGE_KEY } from "../constants";
import { MetricsFiles } from "../types";
import { getSampleText } from "../utils";
import { useAnnotationReviewFlow } from "./useAnnotationReviewFlow";
import { useCodebookManager } from "./useCodebookManager";
import { useIntroState } from "./useIntroState";
import { useSamplingStatus } from "./useSamplingStatus";

// Macro-averaged F1 over (predicted, ground-truth) label-set pairs — the simple
// mean of per-label F1, matching the backend's val-eval macroF1.
function computeMacroF1(
  pairs: { predicted: string[]; truth: string[] }[],
  labelNames: string[],
): number {
  if (pairs.length === 0 || labelNames.length === 0) return 0;
  let f1Sum = 0;
  for (const label of labelNames) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const { predicted, truth } of pairs) {
      const inPred = predicted.includes(label);
      const inTruth = truth.includes(label);
      if (inPred && inTruth) tp += 1;
      else if (inPred) fp += 1;
      else if (inTruth) fn += 1;
    }
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
    f1Sum += prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
  }
  return f1Sum / labelNames.length;
}

export const useAIAnnotationController = () => {
  const navigate = useNavigate();
  const { loading, task, guideAnnotations, refreshTaskData } = useAITaskData();

  const introState = useIntroState({ storageKey: INTRO_STORAGE_KEY });
  const samplingState = useSamplingStatus({
    taskId: task?._id,
    taskStatus: task?.status,
    refreshTaskData,
  });

  const codebookState = useCodebookManager({ task });

  const reviewState = useAnnotationReviewFlow({
    task,
    guideAnnotations,
    codebook: codebookState.codebook,
    getCodebookSnapshot: codebookState.getCodebookSnapshot,
    setLastPromptUsed: codebookState.setLastPromptUsed,
  });

  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [metricsFiles, setMetricsFiles] = useState<MetricsFiles>({});
  const [reviewCompleted, setReviewCompleted] = useState(false);
  const [isRunningValEval, setIsRunningValEval] = useState(false);
  const [valEvalProgress, setValEvalProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [predictedAccuracy, setPredictedAccuracy] = useState<number | null>(null);
  // Final macro precision/recall/F1 on the held-out validation set (d_val),
  // shown in the completion popup.
  const [valMetrics, setValMetrics] = useState<{
    precision: number;
    recall: number;
    f1: number;
  } | null>(null);

  // Final step: run inference over d_all with the latest codebook.
  const [finalInferencePhase, setFinalInferencePhase] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [finalInferenceProgress, setFinalInferenceProgress] = useState({ completed: 0, total: 0 });
  const [finalLabeledRows, setFinalLabeledRows] = useState<Array<Record<string, string>>>([]);
  // Server path of a persisted final-inference output (set after a run or on
  // reload), so the labeled dataset can be re-downloaded from the server.
  const [finalInferenceFile, setFinalInferenceFile] = useState<string | null>(null);
  const finalInferencePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baselineRequestedForTaskRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (finalInferencePollRef.current) clearInterval(finalInferencePollRef.current);
    },
    [],
  );

  // Capture the initial codebook on entry to AI review. This covers both the
  // manual-seed flow and tasks that proceed directly from upload. The backend
  // keeps the operation idempotent and refuses to create a baseline after a
  // human review has been completed.
  useEffect(() => {
    if (!task?._id || task.codebookComplete) return;
    if (baselineRequestedForTaskRef.current === task._id) return;
    if (
      task.evaluationHistory?.some(
        (snapshot) => snapshot.stage === "baseline",
      )
    ) {
      return;
    }
    if (
      guideAnnotations.some(
        (annotation) => typeof annotation.aiAnnotation?.isCorrect === "boolean",
      )
    ) {
      return;
    }

    baselineRequestedForTaskRef.current = task._id;
    void runValEvaluation(
      task._id,
      task.codebook ?? [],
      "baseline",
    ).catch((error) => {
      console.error("Failed to initialize baseline evaluation:", error);
    });
  }, [guideAnnotations, task]);

  // Rehydrate persisted state once per task load: completion (locks the UI),
  // held-out validation metrics, and any saved final-inference output.
  const hydratedTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!task?._id || hydratedTaskIdRef.current === task._id) return;
    hydratedTaskIdRef.current = task._id;

    if (task.codebookComplete) setReviewCompleted(true);

    if (task.metricsFiles) setMetricsFiles(task.metricsFiles);

    if (task.evalResults) {
      const { macroF1, macroPrecision, macroRecall } = task.evalResults;
      if (typeof macroF1 === "number") setPredictedAccuracy(macroF1);
      if (
        typeof macroPrecision === "number" &&
        typeof macroRecall === "number" &&
        typeof macroF1 === "number"
      ) {
        setValMetrics({ precision: macroPrecision, recall: macroRecall, f1: macroF1 });
      }
    }

    if (task.finalInferenceFile) {
      setFinalInferenceFile(task.finalInferenceFile);
      setFinalInferencePhase("done");
    }
  }, [task]);

  useEffect(() => {
    if (!task?._id) return;
    let id: ReturnType<typeof setInterval>;
    getValEvalProgress(task._id).then((p) => {
      if (p.total > 0 && !p.done && p.completed < p.total) {
        setIsRunningValEval(true);
        setValEvalProgress({ completed: p.completed, total: p.total });
        id = setInterval(async () => {
          try {
            const prog = await getValEvalProgress(task._id!);
            setValEvalProgress({ completed: prog.completed, total: prog.total });
            if (prog.done || prog.completed >= prog.total) { clearInterval(id); setIsRunningValEval(false); }
          } catch {}
        }, 1500);
      }
    }).catch(() => {});
    return () => clearInterval(id);
  }, [task?._id]);

  const handleDownloadMetrics = async (filename?: string) => {
    if (!filename) return;
    try {
      const blob = await downloadMetricsFile(filename);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download metrics file.");
    }
  };

  const handleCommitBatch = async (): Promise<string[]> => {
    reviewState.setIsLoading(true);
    let committedCodebook = codebookState.codebook;

    try {
      const startIdx = reviewState.currentBatchIndex * reviewState.batchSize;
      const endIdx = startIdx + reviewState.batchSize;

      const batchResultsList = Object.entries(reviewState.batchResults).filter(([idx]) => {
        const i = Number.parseInt(idx, 10);
        return i >= startIdx && i < endIdx;
      });

      const batchCorrect = batchResultsList.filter(([, res]) => res.isCorrect === true).length;
      const batchAttempted = batchResultsList.length;
      setTotalCorrect((prev) => prev + batchCorrect);
      setTotalAttempted((prev) => prev + batchAttempted);

      const ruleSynthesisItems: RuleSynthesisItem[] = batchResultsList
        .filter(([, result]) => {
          return (
            result.isCorrect === false ||
            result.spanFeedback === false ||
            result.reasoningFeedback === false
          );
        })
        .map(([idx, result]) => {
          const i = Number.parseInt(idx, 10);
          const sample = reviewState.annotationsForReview[i]?.sampleContent as
            | Record<string, string>
            | undefined;

          return {
            sample_text: getSampleText(sample, task?.columns?.[0]),
            ai_labels: result.label,
            ai_reasoning: result.reason,
            ai_span_text: result.span_text,
            ground_truth_labels: result.correctLabel
              ? [result.correctLabel]
              : task?.labels.map((item) => item.name) || [],
            user_feedback: result.feedback,
            user_label_feedback: result.isCorrect || false,
            user_span_feedback: result.spanFeedback || true,
            user_reasoning_feedback: result.reasoningFeedback || true,
          };
        });

      let nextCodebook = [...codebookState.codebook];
      if (ruleSynthesisItems.length > 0 && task) {
        const request: RuleSynthesisRequest = {
          payload: ruleSynthesisItems,
          task_type: "rule_synthesis",
          model_name: task.modelName || "mistral:7b",
        };
        const response = await ruleSynthesis(request);
        if (response.success) {
          nextCodebook = [...nextCodebook, ...response.rules];
        }
      }

      nextCodebook = [
        ...nextCodebook.filter((rule) => !codebookState.stagedRulesDeletion.includes(rule)),
        ...codebookState.stagedRules,
      ];

      codebookState.setCodebook(nextCodebook);
      codebookState.setStagedRules([]);
      codebookState.setStagedRulesDeletion([]);
      committedCodebook = nextCodebook;
    } catch (error) {
      console.error("Failed to synthesize rules:", error);
      toast.error("Failed to synthesize new rules for this batch");
    } finally {
      reviewState.setIsLoading(false);
    }

    return committedCodebook;
  };

  // Finalize the review session: generate metrics, export the codebook, open the
  // completion popup, and kick off the held-out (d_val) evaluation. Shared by the
  // normal "complete the last batch" path and the "Exit" button.
  const finalizeReview = async (committedCodebook: string[]) => {
    if (!task?._id) return;

    const [sampleRes, metadataRes, batchRes] = await Promise.all([
      generateSampleMetrics(task._id),
      generateMetadataMetrics(task._id),
      generateBatchMetrics(task._id),
    ]);

    const files: MetricsFiles = {
      sample: sampleRes.filename,
      metadata: metadataRes.filename,
      batch: batchRes.filename,
    };
    setMetricsFiles(files);

    try {
      await exportCodebookSnapshot(
        task._id,
        committedCodebook.length > 0 ? committedCodebook : codebookState.codebook,
        codebookState.lastPromptUsed,
      );
    } catch (error: any) {
      console.error("Failed to export codebook:", error);
      toast.error(error?.message || "Failed to export codebook on server");
    }

    setMetricsModalOpen(true);
    setReviewCompleted(true);

    // Persist completion (and the metrics filenames, so the popup's download
    // buttons still work after a reload) to keep the task locked/read-only.
    try {
      await markCodebookComplete(task._id, files);
    } catch (error: any) {
      console.error("Failed to persist completion:", error);
    }
    window.dispatchEvent(new Event("tasks:updated"));

    // Compute final metrics on the held-out validation set (d_val) with the
    // final codebook, shown in the completion popup.
    void runValEval("final");
  };

  const handleNextOrCommit = async () => {
    if (reviewCompleted) {
      setMetricsModalOpen(true);
      return;
    }

    const shouldGenerateMetrics = reviewState.isLastBatch;
    let committedCodebook: string[] = [];

    if (reviewState.currentBatchProgress === reviewState.actualBatchSize) {
      committedCodebook = await handleCommitBatch();
      if (task?._id) {
        try {
          await saveTaskCodebook(task._id, committedCodebook);
        } catch (error: any) {
          toast.error(error?.message || "Failed to auto-save codebook after batch commit");
        }
      }
    }

    await reviewState.handleNextClick();

    if (shouldGenerateMetrics && task?._id) {
      await finalizeReview(committedCodebook);
    }
  };

  // Exit the review loop early: treat the session as done (same as completing the
  // whole sample set) and go straight to the completion popup. Any feedback in the
  // in-progress batch is committed first so it isn't lost.
  const handleExitReview = async () => {
    if (reviewCompleted) {
      setMetricsModalOpen(true);
      return;
    }

    let committedCodebook = codebookState.codebook;
    if (reviewState.currentBatchProgress > 0) {
      committedCodebook = await handleCommitBatch();
      if (task?._id) {
        try {
          await saveTaskCodebook(task._id, committedCodebook);
        } catch (error: any) {
          toast.error(error?.message || "Failed to auto-save codebook on exit");
        }
      }
    }

    await finalizeReview(committedCodebook);
  };

  const rowsToCsv = (rows: Array<Record<string, string>>) => {
    if (rows.length === 0) return "";
    const csvEscape = (val: string) =>
      /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
    const headers = Object.keys(rows[0]);
    return [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => csvEscape(r[h] ?? "")).join(",")),
    ].join("\n");
  };

  const downloadLabeledRows = (
    rows: Array<Record<string, string>>,
    filename: string,
  ) => {
    if (rows.length === 0) return;
    downloadContent(filename, rowsToCsv(rows), "text/csv");
  };

  // Save the labeled full-dataset output to the server so it survives a reload.
  const persistFinalInference = async (
    taskId: string,
    rows: Array<Record<string, string>>,
  ) => {
    try {
      const file = new File([rowsToCsv(rows)], `labeled_d_all_${taskId}.csv`, {
        type: "text/csv",
      });
      const upload = await uploadOutputFile(file);
      if (upload.success && upload.filePath) {
        await saveFinalInferenceResult(taskId, upload.filePath);
        setFinalInferenceFile(upload.filePath);
        window.dispatchEvent(new Event("tasks:updated"));
      }
    } catch (error) {
      console.error("Failed to persist final inference output:", error);
    }
  };

  const handleRunFinalInference = async () => {
    if (!task?._id || finalInferencePhase === "running") return;

    const taskId = task._id;
    const filename = `labeled_d_all_${task.name || taskId}.csv`;
    setFinalInferencePhase("running");
    setFinalInferenceProgress({ completed: 0, total: 0 });
    setFinalLabeledRows([]);

    try {
      const res = await startFinalInference(taskId, codebookState.codebook);
      if (!res.success) {
        toast.error(res.message || "Failed to start inference");
        setFinalInferencePhase("error");
        return;
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to start inference");
      setFinalInferencePhase("error");
      return;
    }

    if (finalInferencePollRef.current) clearInterval(finalInferencePollRef.current);
    finalInferencePollRef.current = setInterval(async () => {
      try {
        const progress = await getAutoLabelProgress(taskId);
        setFinalInferenceProgress({ completed: progress.completed, total: progress.total });
        if (progress.done) {
          if (finalInferencePollRef.current) clearInterval(finalInferencePollRef.current);
          finalInferencePollRef.current = null;
          if (progress.error) {
            toast.error(progress.error);
            setFinalInferencePhase("error");
            return;
          }
          const rows = progress.rows ?? [];
          setFinalLabeledRows(rows);
          setFinalInferencePhase("done");
          if (rows.length > 0) {
            downloadLabeledRows(rows, filename);
            // Persist the labeled output on the server so it survives a reload.
            void persistFinalInference(taskId, rows);
            toast.success("Inference complete — labeled dataset downloaded.");
          } else {
            toast.success("Inference complete.");
          }
        }
      } catch {
        // ignore transient polling errors
      }
    }, 1500);
  };

  const handleDownloadFinalInference = async () => {
    if (!task?._id) return;
    // Fresh run this session: download from the in-memory rows.
    if (finalLabeledRows.length > 0) {
      downloadLabeledRows(finalLabeledRows, `labeled_d_all_${task.name || task._id}.csv`);
      return;
    }
    // Rehydrated after a reload: fetch the persisted file from the server.
    if (finalInferenceFile) {
      try {
        const blob = await downloadAnnotationOutputFile(finalInferenceFile);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalInferenceFile.split("/").pop() ?? "labeled_d_all.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Failed to download labeled dataset.");
      }
    }
  };

  const runValEval = async (stage: "checkpoint" | "final") => {
    if (!task?._id) return;
    setIsRunningValEval(true);
    setValEvalProgress({ completed: 0, total: 0 });

    const taskId = task._id;
    const pollInterval = setInterval(async () => {
      try {
        const progress = await getValEvalProgress(taskId);
        setValEvalProgress({ completed: progress.completed, total: progress.total });
        if (progress.done) clearInterval(pollInterval);
      } catch {
        // ignore transient polling errors
      }
    }, 1500);

    try {
      const res = await runValEvaluation(
        taskId,
        codebookState.codebook,
        stage,
      );
      clearInterval(pollInterval);
      if (res.success) {
        if (res.macroF1 != null) setPredictedAccuracy(res.macroF1);
        if (
          res.macroPrecision != null &&
          res.macroRecall != null &&
          res.macroF1 != null
        ) {
          setValMetrics({
            precision: res.macroPrecision,
            recall: res.macroRecall,
            f1: res.macroF1,
          });
        }
        toast.success("Evaluation complete");
      } else {
        toast.error(res.message || "Evaluation failed");
      }
    } catch {
      clearInterval(pollInterval);
      toast.error("Evaluation failed");
    } finally {
      setIsRunningValEval(false);
    }
  };

  const handleRunValEval = () => runValEval("checkpoint");

  const goHome = () => navigate("/");

  const isReady = useMemo(
    () => Boolean(task && reviewState.annotationsForReview.length > 0),
    [task, reviewState.annotationsForReview.length],
  );

  // Live macro-F1 on the examples the user has annotated so far (d_guide),
  // reconstructing ground truth from their correct/incorrect marks. Correct →
  // truth is the AI's labels; incorrect with a chosen label → that label.
  // Incorrect without a chosen correction can't be scored, so it's skipped.
  const annotatedMetrics = useMemo(() => {
    const labelNames = task?.labels?.map((l) => l.name) ?? [];
    if (labelNames.length === 0) return null;

    const pairs: { predicted: string[]; truth: string[] }[] = [];
    for (const result of Object.values(reviewState.batchResults)) {
      if (result.isCorrect === null || result.isCorrect === undefined) continue;
      const predicted = Array.isArray(result.label) ? result.label : [];
      let truth: string[];
      if (result.isCorrect) truth = predicted;
      else if (result.correctLabel) truth = [result.correctLabel];
      else continue;
      pairs.push({ predicted, truth });
    }

    if (pairs.length === 0) return null;
    return { f1: computeMacroF1(pairs, labelNames), count: pairs.length };
  }, [reviewState.batchResults, task?.labels]);

  return {
    loading,
    task,
    isReady,
    effectiveStatus: samplingState.effectiveStatus,
    samplingErrorMsg: samplingState.samplingErrorMsg,
    samplingQueuePosition: samplingState.queuePosition,

    ...introState,

    metricsModalOpen,
    metricsFiles,
    setMetricsModalOpen,
    handleDownloadMetrics,
    isRunningValEval,
    valEvalProgress,
    valMetrics,
    handleRunValEval,

    finalInferencePhase,
    finalInferenceProgress,
    finalLabeledRows,
    finalInferenceHasResult: finalLabeledRows.length > 0 || finalInferenceFile !== null,
    handleRunFinalInference,
    handleDownloadFinalInference,

    isLoading: reviewState.isLoading,
    generatedLabels: reviewState.generatedLabels,
    generatedSpanText: reviewState.generatedSpanText,
    generatedReasoning: reviewState.generatedReasoning,
    currentIndex: reviewState.currentIndex,
    totalSamples: reviewState.totalSamples,
    currentSampleText: reviewState.currentSampleText,
    batchResults: reviewState.batchResults,
    spanTextFeedback: reviewState.spanTextFeedback,
    reasoningFeedback: reviewState.reasoningFeedback,

    totalCorrect,
    totalAttempted,
    annotatedMetrics,
    predictedAccuracy,

    codebook: codebookState.codebook,
    stagedRules: codebookState.stagedRules,
    stagedRulesDeletion: codebookState.stagedRulesDeletion,
    newRule: codebookState.newRule,

    currentBatchProgress: reviewState.currentBatchProgress,
    actualBatchSize: reviewState.actualBatchSize,
    currentBatchStartIndex: reviewState.currentBatchStartIndex,
    isCommitStep: reviewState.currentBatchProgress === reviewState.actualBatchSize,
    isCompleteStep:
      reviewCompleted &&
      reviewState.currentIndex === Math.max(reviewState.totalSamples - 1, 0),
    // Once the review is completed the codebook + sample review are locked.
    reviewCompleted,
    readOnly: reviewCompleted,
    nextDisabled: reviewState.nextDisabled,

    handleExportCodebookFromModal: async () => {
      if (!task?._id) return;
      try {
        await exportCodebookSnapshot(
          task._id,
          codebookState.codebook,
          codebookState.lastPromptUsed,
        );
        toast.success("Codebook exported.");
      } catch (error: any) {
        toast.error(error?.message || "Failed to export codebook.");
      }
    },

    handleNextOrCommit,
    handleExitReview,
    goPrev: reviewState.goPrev,
    goHome,

    setCurrentCorrect: reviewState.setCurrentCorrect,
    setSpanTextFeedback: reviewState.setSpanTextFeedback,
    setReasoningFeedback: reviewState.setReasoningFeedback,
    setCurrentCorrectLabel: reviewState.setCurrentCorrectLabel,
    setCurrentFeedback: reviewState.setCurrentFeedback,

    addRule: codebookState.addRule,
    setNewRule: codebookState.setNewRule,
    handleExportCodebook: codebookState.handleExportCodebook,
    editRule: codebookState.editRule,
    toggleDeleteRule: codebookState.toggleDeleteRule,
    removeStagedRule: codebookState.removeStagedRule,
  };
};
