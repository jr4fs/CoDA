import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import axios from "axios";
import { Response } from "express";
import { AnnotationItem } from "@common/types/annotations";
import {
  EvaluationSnapshot,
  EvaluationStage,
  Task,
} from "@common/types/tasks";
import { getCollection } from "./database.service";
import { ObjectId } from "mongodb";
import { AuthRequest } from "./tasks.service";
import { ensureMetricsDir, METRICS_DIR } from "../utils/metrics";
import Papa from "papaparse";
import fsAsync from "fs/promises";

const ANNOTATION_COLLECTION =
  process.env.ANNOTATION_COLLECTION_NAME || "AnnotationDetails";

const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const METRICS_FILENAME_PATTERN = /^(?:val_eval_predictions|sample_metrics|metadata_metrics|batch_metrics|val_eval)_(.+)_\d{4}-\d{2}-\d{2}T\d{9}Z\.csv$/;

/**
 * Fetch the system prompt templates from pybackend (the single source of truth)
 * over HTTP, instead of reading pybackend's files off a shared filesystem.
 */
async function fetchPrompts(): Promise<{
  annotation_task: string;
  rule_synthesis: string;
}> {
  const { data } = await axios.get(`${ML_BASE_URL}/inference/prompts`);
  return {
    annotation_task: data?.annotation_task ?? "",
    rule_synthesis: data?.rule_synthesis ?? "",
  };
}

const SAMPLE_HEADERS = [
  "text data",
  "batch_id",
  "batch_num",
  "LM_prediction_raw",
  "LM_prediction_parsed (the label)",
  "label provided by user if user corrects the LM prediction",
  "correct/incorrect as rated by expert",
  "final 'correct' label",
  "guidelines revised",
  "guidelines added",
  "guidelines_deprecated",
  "codebook at the end of this example",
  "time to complete this example (seconds)",
  "user rates LM explanation as useful/correct for determining label",
  "user rates LM span as useful/correct for determining label",
];

const METADATA_HEADERS = [
  "unique_task_id",
  "task_json",
  "labels_json",
  "synthetizer prompt",
  "initial codebook",
  "initial prompt for generating predictions",
  "batch_size",
  "target accuracy",
  "minimum evaluation set size",
  "budget",
  "model specs (full name)",
  "size of dval",
  "distribution of dval",
];

const BATCH_HEADERS = [
  "batch_id",
  "batch_num",
  "macro f1 [d_guide -- includes items in this batch]",
  "micro f1 [d_guide -- includes items in this batch]",
  "precision_per_label [d_guide -- includes items in this batch]",
  "recall_per_label [d_guide -- includes items in this batch]",
  "f1_per_label [d_guide -- includes items in this batch]",
  "false positive rate per label [d_guide -- includes items in this batch]",
  "false negative rate per label [d_guide -- includes items in this batch]",
  "macro f1 [dval]",
  "micro f1 [dval]",
  "precision_per_label [dval]",
  "recall_per_label [dval]",
  "f1_per_label [dval]",
  "false positive rate per label [dval]",
  "false negative rate per label [dval]",
  "expert feedback given",
  "guidelines revised",
  "guidelines added",
  "guidelines_deprecated",
  "codebook at the end of the batch after lm synthesizes prompt with new feedback",
  "prompt given to lm synthesizer",
  "time to complete a single batch",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const needsQuotes = /[",\n]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function getTextData(
  sample?: Record<string, string>,
  preferredCol?: string,
): string {
  if (!sample) return "";
  const combined = sample["text_combined"];
  if (typeof combined === "string" && combined.trim()) {
    return combined.trim();
  }
  if (preferredCol && typeof sample[preferredCol] === "string") {
    const preferredText = sample[preferredCol].trim();
    if (preferredText) return preferredText;
  }
  const raw = sample["text"];
  if (typeof raw === "string") {
    return raw.trim();
  }
  for (const value of Object.values(sample)) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function formatLabelList(labels?: string[]): string {
  if (!labels || labels.length === 0) return "";
  return labels.join("|");
}

function parseCsvText(csvText: string): Array<Record<string, string>> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0) {
    console.warn("[metrics] CSV parse warnings:", parsed.errors);
  }
  return Array.isArray(parsed.data) ? parsed.data : [];
}

function getValLabelDistribution(
  rows: Array<Record<string, string>>,
  labelColumn: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const raw = row[labelColumn] ?? row.task_label ?? row.taskLabel ?? "";
    const labels = String(raw)
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    for (const label of labels) {
      counts[label] = (counts[label] || 0) + 1;
    }
  }
  return counts;
}

interface LabelPair {
  predicted: string[];
  truth: string[];
}

function computeLabelMetrics(pairs: LabelPair[], labelNames: string[]) {
  const perLabel: Record<
    string,
    { tp: number; fp: number; fn: number; tn: number }
  > = {};
  const totalSamples = pairs.length;

  for (const label of labelNames) {
    perLabel[label] = { tp: 0, fp: 0, fn: 0, tn: 0 };
  }

  for (const pair of pairs) {
    const predicted = new Set(pair.predicted);
    const truth = new Set(pair.truth);
    for (const label of labelNames) {
      const predHas = predicted.has(label);
      const truthHas = truth.has(label);
      if (predHas && truthHas) perLabel[label].tp += 1;
      else if (predHas && !truthHas) perLabel[label].fp += 1;
      else if (!predHas && truthHas) perLabel[label].fn += 1;
      else perLabel[label].tn += 1;
    }
  }

  const precision: Record<string, number> = {};
  const recall: Record<string, number> = {};
  const f1: Record<string, number> = {};
  const fpr: Record<string, number> = {};
  const fnr: Record<string, number> = {};

  let macroF1Sum = 0;
  let macroCount = 0;
  let microTp = 0;
  let microFp = 0;
  let microFn = 0;

  for (const label of labelNames) {
    const { tp, fp, fn, tn } = perLabel[label];
    // Standard precision/recall/F1 per label, plus FPR/FNR.
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Val = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
    const fprVal = fp + tn > 0 ? fp / (fp + tn) : 0;
    const fnrVal = fn + tp > 0 ? fn / (fn + tp) : 0;

    precision[label] = prec;
    recall[label] = rec;
    f1[label] = f1Val;
    fpr[label] = fprVal;
    fnr[label] = fnrVal;

    macroF1Sum += f1Val;
    macroCount += 1;
    microTp += tp;
    microFp += fp;
    microFn += fn;
  }

  const microPrec = microTp + microFp > 0 ? microTp / (microTp + microFp) : 0;
  const microRec = microTp + microFn > 0 ? microTp / (microTp + microFn) : 0;
  // Micro averages pool TP/FP/FN across all labels first (so frequent labels weigh more).
  // Macro F1 is the simple mean of per-label F1 values (each label weighs equally).
  const microF1 =
    microPrec + microRec > 0
      ? (2 * microPrec * microRec) / (microPrec + microRec)
      : 0;
  const macroF1 = macroCount > 0 ? macroF1Sum / macroCount : 0;

  return {
    macroF1,
    microF1,
    precision,
    recall,
    f1,
    fpr,
    fnr,
    perLabel,
    totalSamples,
  };
}

export async function generateSampleMetrics(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { taskId } = req.body as { taskId?: string };

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - user not authenticated",
    });
  }

  if (!taskId) {
    return res.status(400).json({
      success: false,
      message: "taskId is required",
    });
  }

  try {
    const collection = getCollection<AnnotationItem>(ANNOTATION_COLLECTION);
    const annotations = await collection
      .find({ taskId, createdBy: userId, source: "guide" })
      .sort({ sampleId: 1 })
      .toArray();

    const taskCollection = getCollection<Task>(
      process.env.TASKS_COLLECTION_NAME || "TaskDetails",
    );
    let taskQueryId: ObjectId | string = taskId;
    if (ObjectId.isValid(taskId)) {
      taskQueryId = new ObjectId(taskId);
    }
    const task = await taskCollection.findOne({
      _id: taskQueryId as any,
      userID: userId,
    });
    const preferredTextCol = task?.columns?.[0];

    ensureMetricsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const filename = `sample_metrics_${taskId}_${timestamp}.csv`;
    const filePath = path.join(METRICS_DIR, filename);

    const rows = annotations.map((annotation) => {
      const ai = annotation.aiAnnotation;
      const isCorrect = ai?.isCorrect ?? null;
      const parsedLabels = formatLabelList(ai?.label);
      const finalLabel =
        isCorrect === true
          ? parsedLabels
          : ai?.correctLabel
            ? ai.correctLabel
            : "";

      return {
        "text data": getTextData(annotation.sampleContent, preferredTextCol),
        batch_id: ai?.batchID ?? "",
        batch_num: ai?.batchNum ?? "",
        LM_prediction_raw: ai?.predictionRaw ?? "",
        "LM_prediction_parsed (the label)": parsedLabels,
        "label provided by user if user corrects the LM prediction":
          ai?.correctLabel ?? "",
        "correct/incorrect as rated by expert":
          isCorrect === null ? "" : isCorrect ? "correct" : "incorrect",
        "final 'correct' label": finalLabel,
        "guidelines revised": toJson(ai?.guidelinesRevised ?? []),
        "guidelines added": toJson(ai?.guidelinesAdded ?? []),
        guidelines_deprecated: toJson(ai?.guidelinesDeprecated ?? []),
        "codebook at the end of this example": toJson(
          ai?.codebookSnapshot ?? [],
        ),
        "time to complete this example (seconds)":
          ai?.timeToCompleteMs != null
            ? (ai.timeToCompleteMs / 1000).toFixed(3)
            : "",
        "user rates LM explanation as useful/correct for determining label":
          ai?.reasoningFeedback ?? "",
        "user rates LM span as useful/correct for determining label":
          ai?.spanFeedback ?? "",
      };
    });

    const headerLine = SAMPLE_HEADERS.map(csvEscape).join(",");
    const dataLines = rows.map((row) =>
      SAMPLE_HEADERS.map((header) => csvEscape((row as any)[header])).join(","),
    );

    fs.writeFileSync(filePath, [headerLine, ...dataLines].join("\n"), "utf-8");

    return res.status(200).json({
      success: true,
      filename,
    });
  } catch (error: any) {
    console.error("Error generating sample metrics:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate sample metrics",
    });
  }
}

export async function generateMetadataMetrics(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { taskId } = req.body as { taskId?: string };

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - user not authenticated",
    });
  }

  if (!taskId) {
    return res.status(400).json({
      success: false,
      message: "taskId is required",
    });
  }

  try {
    const taskCollection = getCollection<Task>(
      process.env.TASKS_COLLECTION_NAME || "TaskDetails",
    );
    let taskQueryId: ObjectId | string = taskId;
    if (ObjectId.isValid(taskId)) {
      taskQueryId = new ObjectId(taskId);
    }
    const task = await taskCollection.findOne({
      _id: taskQueryId as any,
      userID: userId,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const projectRoot = path.resolve(__dirname, "../../../");
    const valPath = task.valFile
      ? path.join(projectRoot, "val_datasets", task.valFile)
      : "";
    let valText = "";
    if (valPath) {
      try {
        await fsAsync.access(valPath);
        valText = await fsAsync.readFile(valPath, "utf-8");
      } catch (error) {
        console.warn("[metrics] dval file not readable:", valPath, error);
      }
    }
    const valRows = valText ? parseCsvText(valText) : [];
    const valSize = valRows.length;
    const labelColumn = task.labelColumn || "task_label";
    const distribution = getValLabelDistribution(valRows, labelColumn);

    const { rule_synthesis: rulePrompt, annotation_task: annotationPrompt } =
      await fetchPrompts();

    ensureMetricsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const filename = `metadata_metrics_${taskId}_${timestamp}.csv`;
    const filePath = path.join(METRICS_DIR, filename);

    const row = {
      unique_task_id: taskId,
      task_json: task.taskJsonRaw ?? "",
      labels_json: task.labelsJsonRaw ?? "",
      "synthetizer prompt": rulePrompt,
      "initial codebook": toJson(task.codebook ?? []),
      "initial prompt for generating predictions": annotationPrompt,
      batch_size: 5,
      "target accuracy": "",
      "minimum evaluation set size": "",
      budget: 150,
      "model specs (full name)": task.modelName ?? "",
      "size of dval": valSize,
      "distribution of dval": toJson(distribution),
    };

    const headerLine = METADATA_HEADERS.map(csvEscape).join(",");
    const dataLine = METADATA_HEADERS.map((header) =>
      csvEscape((row as any)[header]),
    ).join(",");

    await fsAsync.writeFile(filePath, `${headerLine}\n${dataLine}`, "utf-8");

    return res.status(200).json({
      success: true,
      filename,
    });
  } catch (error: any) {
    console.error("Error generating metadata metrics:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate metadata metrics",
    });
  }
}

export async function generateBatchMetrics(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { taskId } = req.body as { taskId?: string };

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - user not authenticated",
    });
  }

  if (!taskId) {
    return res.status(400).json({
      success: false,
      message: "taskId is required",
    });
  }

  try {
    const annotations = await getCollection<AnnotationItem>(
      ANNOTATION_COLLECTION,
    )
      .find({ taskId, createdBy: userId, source: "guide" })
      .sort({ sampleId: 1 })
      .toArray();

    const taskCollection = getCollection<Task>(
      process.env.TASKS_COLLECTION_NAME || "TaskDetails",
    );
    let taskQueryId: ObjectId | string = taskId;
    if (ObjectId.isValid(taskId)) {
      taskQueryId = new ObjectId(taskId);
    }
    const task = await taskCollection.findOne({
      _id: taskQueryId as any,
      userID: userId,
    });

    const labelNames = task?.labels?.map((label) => label.name) || [];
    const batches = new Map<string, AnnotationItem[]>();
    for (const annotation of annotations) {
      const batchId = annotation.aiAnnotation?.batchID;
      if (!batchId) continue;
      if (!batches.has(batchId)) batches.set(batchId, []);
      batches.get(batchId)?.push(annotation);
    }

    const { rule_synthesis: synthPrompt } = await fetchPrompts();

    ensureMetricsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const filename = `batch_metrics_${taskId}_${timestamp}.csv`;
    const filePath = path.join(METRICS_DIR, filename);

    const sortedBatches = Array.from(batches.entries())
      .map(([batchId, items]) => ({
        batchId,
        items,
        minSampleId: Math.min(...items.map((item) => item.sampleId)),
      }))
      .sort((a, b) => a.minSampleId - b.minSampleId);

    const rows = sortedBatches.map((batch, index) => {
      const { batchId, items } = batch;
      const pairs = items.map((item) => ({
        predicted: item.aiAnnotation?.label || [],
        truth: item.labels || [],
      }));
      const metrics = computeLabelMetrics(pairs, labelNames);
      const lastSample = items[items.length - 1];
      const batchNum = index + 1;

      const feedbacks = items
        .map((item) => item.aiAnnotation?.feedback)
        .filter((val): val is string => Boolean(val));

      const revised = items.flatMap(
        (item) => item.aiAnnotation?.guidelinesRevised || [],
      );
      const added = items.flatMap(
        (item) => item.aiAnnotation?.guidelinesAdded || [],
      );
      const deprecated = items.flatMap(
        (item) => item.aiAnnotation?.guidelinesDeprecated || [],
      );

      const batchTimeMs = items.reduce(
        (sum, item) => sum + (item.aiAnnotation?.timeToCompleteMs || 0),
        0,
      );

      return {
        batch_id: batchId,
        batch_num: batchNum,
        "macro f1 [d_guide -- includes items in this batch]": metrics.macroF1,
        "micro f1 [d_guide -- includes items in this batch]": metrics.microF1,
        "precision_per_label [d_guide -- includes items in this batch]": toJson(
          metrics.precision,
        ),
        "recall_per_label [d_guide -- includes items in this batch]": toJson(
          metrics.recall,
        ),
        "f1_per_label [d_guide -- includes items in this batch]": toJson(
          metrics.f1,
        ),
        "false positive rate per label [d_guide -- includes items in this batch]":
          toJson(metrics.fpr),
        "false negative rate per label [d_guide -- includes items in this batch]":
          toJson(metrics.fnr),
        "macro f1 [dval]": "",
        "micro f1 [dval]": "",
        "precision_per_label [dval]": "",
        "recall_per_label [dval]": "",
        "f1_per_label [dval]": "",
        "false positive rate per label [dval]": "",
        "false negative rate per label [dval]": "",
        "expert feedback given": toJson(feedbacks),
        "guidelines revised": toJson(revised),
        "guidelines added": toJson(added),
        guidelines_deprecated: toJson(deprecated),
        "codebook at the end of the batch after lm synthesizes prompt with new feedback":
          toJson(lastSample?.aiAnnotation?.codebookSnapshot ?? []),
        "prompt given to lm synthesizer": synthPrompt,
        "time to complete a single batch": Math.round(batchTimeMs / 1000),
      };
    });

    const headerLine = BATCH_HEADERS.map(csvEscape).join(",");
    const dataLines = rows.map((row) =>
      BATCH_HEADERS.map((header) => csvEscape((row as any)[header])).join(","),
    );

    fs.writeFileSync(filePath, [headerLine, ...dataLines].join("\n"), "utf-8");

    return res.status(200).json({
      success: true,
      filename,
    });
  } catch (error: any) {
    console.error("Error generating batch metrics:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate batch metrics",
    });
  }
}

const VAL_EVAL_HEADERS = [
  "task_id",
  "model_name",
  "codebook_snapshot",
  "val_file",
  "num_samples",
  "accuracy",
  "macro_f1",
  "micro_f1",
  "precision_per_label",
  "recall_per_label",
  "f1_per_label",
  "tp_per_label",
  "fp_per_label",
  "tn_per_label",
  "fn_per_label",
];

const VAL_EVAL_PREDICTIONS_HEADERS = [
  "sample_index",
  "text",
  "ground_truth",
  "predicted",
  "is_correct",
];

export async function runValEvaluation(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const {
    taskId,
    codebook: bodyCodebook,
    stage = "checkpoint",
  } = req.body as {
    taskId?: string;
    codebook?: string[];
    stage?: EvaluationStage;
  };

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized - user not authenticated" });
  }
  if (!taskId) {
    return res.status(400).json({ success: false, message: "taskId is required" });
  }
  if (!["baseline", "checkpoint", "final"].includes(stage)) {
    return res.status(400).json({ success: false, message: "Invalid evaluation stage" });
  }

  try {
    const taskCollection = getCollection<Task>(
      process.env.TASKS_COLLECTION_NAME || "TaskDetails",
    );
    let taskQueryId: ObjectId | string = taskId;
    if (ObjectId.isValid(taskId)) taskQueryId = new ObjectId(taskId);
    const task = await taskCollection.findOne({ _id: taskQueryId as any, userID: userId });

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!task.valFile) {
      return res.status(400).json({ success: false, message: "Task has no val file" });
    }

    const projectRoot = path.resolve(__dirname, "../../../");
    const valPath = path.join(projectRoot, "val_datasets", task.valFile);
    const valText = await fsAsync.readFile(valPath, "utf-8");
    const valRows = parseCsvText(valText);
    const evaluationKey = createHash("sha256")
      .update(
        JSON.stringify({
          valData: valText,
          modelName: task.modelName,
          labels: task.labels,
          description: task.description,
          type: task.type,
        }),
      )
      .digest("hex");
    const evaluationCodebook = Array.isArray(bodyCodebook)
      ? [...bodyCodebook]
      : [...(task.codebook ?? [])];

    if (stage === "baseline") {
      const existingBaseline = task.evaluationHistory?.find(
        (snapshot) =>
          snapshot.stage === "baseline" &&
          snapshot.evaluationKey === evaluationKey,
      );
      if (existingBaseline) {
        return res.status(200).json({
          success: true,
          evalResults: existingBaseline.results,
          evaluationSnapshot: existingBaseline,
          alreadyExists: true,
        });
      }

      const reviewedGuideSample = await getCollection<AnnotationItem>(
        ANNOTATION_COLLECTION,
      ).findOne({
        taskId,
        createdBy: userId,
        source: "guide",
        "aiAnnotation.isCorrect": { $in: [true, false] },
      });
      if (reviewedGuideSample) {
        return res.status(409).json({
          success: false,
          message:
            "A true baseline cannot be created after guide review has started.",
        });
      }
    }

    const labelColumn = task.labelColumn || "Final Label";
    const preferredTextCol = task.columns?.[0];

    const samples = valRows
      .map((row) => ({
        text: getTextData(row, preferredTextCol),
        ground_truth: String(row[labelColumn] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((s) => s.text.length > 0);

    const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
    const { data: evalData } = await axios.post(
      `${ML_BASE_URL}/inference/val-eval`,
      {
        samples,
        labels: task.labels,
        task_definition: task.description,
        model_name: task.modelName,
        user_input: evaluationCodebook.join("\n") || null,
        task_type: task.type || "annotation",
        task_id: taskId,
      },
      { timeout: 3_600_000 },
    );

    const results: Array<{ predicted: string[]; ground_truth: string[] }> = evalData.results;
    const labelNames = task.labels.map((l) => l.name);
    const pairs = results.map((r) => ({ predicted: r.predicted, truth: r.ground_truth }));
    const metrics = computeLabelMetrics(pairs, labelNames);

    const exactMatches = pairs.filter(
      (p) =>
        p.predicted.length === p.truth.length &&
        p.predicted.every((lbl) => p.truth.includes(lbl)),
    ).length;
    const accuracy = pairs.length > 0 ? exactMatches / pairs.length : 0;

    // Macro-averaged precision/recall (simple mean over labels, matching macroF1).
    const macroPrecision =
      labelNames.length > 0
        ? labelNames.reduce((sum, l) => sum + (metrics.precision[l] ?? 0), 0) /
          labelNames.length
        : 0;
    const macroRecall =
      labelNames.length > 0
        ? labelNames.reduce((sum, l) => sum + (metrics.recall[l] ?? 0), 0) /
          labelNames.length
        : 0;

    const tp: Record<string, number> = {};
    const fp: Record<string, number> = {};
    const tn: Record<string, number> = {};
    const fn: Record<string, number> = {};
    const perLabel: Record<
      string,
      {
        precision: number;
        recall: number;
        f1: number;
        tp: number;
        fp: number;
        tn: number;
        fn: number;
        support: number;
      }
    > = {};
    for (const label of labelNames) {
      tp[label] = metrics.perLabel[label]?.tp ?? 0;
      fp[label] = metrics.perLabel[label]?.fp ?? 0;
      tn[label] = metrics.perLabel[label]?.tn ?? 0;
      fn[label] = metrics.perLabel[label]?.fn ?? 0;
      perLabel[label] = {
        precision: metrics.precision[label] ?? 0,
        recall: metrics.recall[label] ?? 0,
        f1: metrics.f1[label] ?? 0,
        tp: tp[label],
        fp: fp[label],
        tn: tn[label],
        fn: fn[label],
        support: tp[label] + fn[label],
      };
    }

    ensureMetricsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const filename = `val_eval_${taskId}_${timestamp}.csv`;
    const filePath = path.join(METRICS_DIR, filename);

    const row = {
      task_id: taskId,
      model_name: task.modelName ?? "",
      codebook_snapshot: toJson(evaluationCodebook),
      val_file: task.valFile,
      num_samples: samples.length,
      accuracy,
      macro_f1: metrics.macroF1,
      micro_f1: metrics.microF1,
      precision_per_label: toJson(metrics.precision),
      recall_per_label: toJson(metrics.recall),
      f1_per_label: toJson(metrics.f1),
      tp_per_label: toJson(tp),
      fp_per_label: toJson(fp),
      tn_per_label: toJson(tn),
      fn_per_label: toJson(fn),
    };

    const headerLine = VAL_EVAL_HEADERS.map(csvEscape).join(",");
    const dataLine = VAL_EVAL_HEADERS.map((h) => csvEscape((row as any)[h])).join(",");
    await fsAsync.writeFile(filePath, `${headerLine}\n${dataLine}`, "utf-8");

    // Per-sample predictions file
    const predictionsFilename = `val_eval_predictions_${taskId}_${timestamp}.csv`;
    const predictionsFilePath = path.join(METRICS_DIR, predictionsFilename);
    const predHeaderLine = VAL_EVAL_PREDICTIONS_HEADERS.map(csvEscape).join(",");
    const predDataLines = samples.map((sample, i) => {
      const result = results[i];
      const isCorrect =
        result.predicted.length === result.ground_truth.length &&
        result.predicted.every((lbl) => result.ground_truth.includes(lbl));
      const predRow = {
        sample_index: i + 1,
        text: sample.text,
        ground_truth: formatLabelList(result.ground_truth),
        predicted: formatLabelList(result.predicted),
        is_correct: isCorrect ? "TRUE" : "FALSE",
      };
      return VAL_EVAL_PREDICTIONS_HEADERS.map((h) => csvEscape((predRow as any)[h])).join(",");
    });
    await fsAsync.writeFile(
      predictionsFilePath,
      [predHeaderLine, ...predDataLines].join("\n"),
      "utf-8",
    );

    const evalResults = {
      predictionsFilename,
      macroF1: metrics.macroF1,
      macroPrecision,
      macroRecall,
      microF1: metrics.microF1,
      wrongPredictions: samples.length - exactMatches,
      perLabel,
      accuracy,
      numSamples: samples.length,
      completedAt: new Date().toISOString(),
      evaluationKey,
    };
    const evaluationSnapshot: EvaluationSnapshot = {
      stage,
      codebook: evaluationCodebook,
      codebookHash: createHash("sha256")
        .update(JSON.stringify(evaluationCodebook))
        .digest("hex"),
      evaluationKey,
      modelName: task.modelName ?? "",
      valFile: task.valFile,
      results: evalResults,
    };
    if (stage === "baseline") {
      await taskCollection.updateOne(
        {
          _id: taskQueryId as any,
          userID: userId,
          evaluationHistory: {
            $not: {
              $elemMatch: { stage: "baseline", evaluationKey },
            },
          },
        },
        { $push: { evaluationHistory: evaluationSnapshot } },
      );
    } else {
      await taskCollection.updateOne(
        { _id: taskQueryId as any, userID: userId },
        {
          $set: { evalResults },
          $push: { evaluationHistory: evaluationSnapshot },
        },
      );
    }

    return res.status(200).json({
      success: true,
      filename,
      predictionsFilename,
      macroF1: metrics.macroF1,
      macroPrecision,
      macroRecall,
      microF1: metrics.microF1,
      wrongPredictions: samples.length - exactMatches,
      perLabel,
      accuracy,
      evalResults,
      evaluationSnapshot,
    });
  } catch (error: any) {
    console.error("Error running val evaluation:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to run val evaluation",
    });
  }
}

export async function getModelPerformance(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { taskId } = req.params;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (!taskId) {
    return res.status(400).json({ success: false, message: "taskId is required" });
  }

  try {
    const taskCollection = getCollection<Task>(
      process.env.TASKS_COLLECTION_NAME || "TaskDetails",
    );
    const taskQueryId: ObjectId | string = ObjectId.isValid(taskId)
      ? new ObjectId(taskId)
      : taskId;
    const task = await taskCollection.findOne({
      _id: taskQueryId as any,
      userID: userId,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const snapshots = task.evaluationHistory ?? [];
    return res.status(200).json({
      success: true,
      snapshots,
      baseline: [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.stage === "baseline"),
      final: [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.stage === "final"),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load model performance",
    });
  }
}

export async function cancelValEvaluation(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  const { taskId } = req.body as { taskId?: string };
  if (!taskId) return res.status(400).json({ success: false, message: "taskId is required" });

  try {
    const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
    await axios.post(`${ML_BASE_URL}/inference/val-eval/cancel/${taskId}`, {}, { timeout: 5_000 });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to cancel evaluation" });
  }
}

export async function getValEvalProgress(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const { taskId } = req.params;

  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (!taskId) return res.status(400).json({ success: false, message: "taskId is required" });

  try {
    const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
    const { data } = await axios.get(
      `${ML_BASE_URL}/inference/val-eval/progress/${taskId}`,
      { timeout: 5_000 },
    );
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to get progress" });
  }
}

export async function downloadMetricsFile(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  const filename = req.params.filename;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - user not authenticated",
    });
  }

  if (!filename) {
    return res.status(400).json({
      success: false,
      message: "filename is required",
    });
  }

  try {
    const safeName = path.basename(filename);
    const taskId = METRICS_FILENAME_PATTERN.exec(safeName)?.[1];
    if (!taskId || safeName !== filename) {
      return res.status(404).json({ success: false, message: "Metrics file not found" });
    }

    const taskQueryId = ObjectId.isValid(taskId) ? new ObjectId(taskId) : taskId;
    const task = await getCollection<Task>(process.env.TASKS_COLLECTION_NAME || "TaskDetails")
      .findOne({ _id: taskQueryId as any, userID: userId });
    if (!task) {
      return res.status(404).json({ success: false, message: "Metrics file not found" });
    }

    const filePath = path.join(METRICS_DIR, safeName);
    await fsAsync.access(filePath);
    return res.download(filePath, safeName);
  } catch (error: any) {
    console.error("Error downloading metrics file:", error);
    return res.status(error?.code === "ENOENT" ? 404 : 500).json({
      success: false,
      message: error?.code === "ENOENT" ? "Metrics file not found" : error.message || "Failed to download metrics file",
    });
  }
}
