import type { Task } from "@common/types/tasks";
import type { EvaluationRecord } from "@common/types/evaluationBuilder";
import type { AnnotationItem } from "@common/types/annotations";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import Papa from "papaparse";
import { getCollection } from "./database.service";
import { ensureValDatasetsDir, getValDatasetPath } from "../utils/fileUpload";
import { allocateQuotas, labelCounts } from "../utils/evaluationBuilder";
import { createDemoBaseline } from "../utils/demoBaseline";
import { tasks, rounds, timeout, taskFilter } from "./evaluationBuilder.store";

async function sample(
  task: Task,
  queries: Record<string, string[]>,
  quotas: Record<string, number>,
  excluded: string[],
  guide = false,
  examples: Record<string, string[]> = {},
  iteration = 0,
  excludedTexts: string[] = [],
  guideIds: string[] = [],
) {
  const { data } = await axios.post<{
    totalRecords: number;
    eligibleRecords: number;
    records: EvaluationRecord[];
  }>(
    `${process.env.ML_SERVICE_URL || "http://localhost:8000"}/embedding/evaluation-sample`,
    {
      task_id: task._id,
      file_path: task.file,
      text_col: task.columns,
      queries,
      examples,
      quotas,
      excluded,
      excluded_texts: excludedTexts,
      guide_ids: guideIds,
      iteration,
      seed: Number.parseInt(
        crypto.createHash("sha256")
          .update(`${task.samplingSeed ?? task._id}:${guide ? "guide" : "val"}:${iteration}`)
          .digest("hex").slice(0, 8),
        16,
      ),
      export_guide: guide,
    },
    { timeout },
  );
  return data;
}

function initialQueries(task: Task) {
  return Object.fromEntries(
    task.labels.map((label) => [
      label.name,
      [`${label.name}: ${label.definition}`, ...label.keywords],
    ]),
  );
}

function samplingQueries(task: Task) {
  return task.samplingVersion === 2
    ? Object.fromEntries(task.labels.map((label) => [label.name, label.keywords]))
    : initialQueries(task);
}

export async function failJob(task: Task, jobId: string, error: unknown) {
  console.error("Evaluation sampling failed:", error);
  const message = axios.isAxiosError(error)
    ? String(
        error.response?.data?.detail ||
          "The sampling service could not complete this round. Retry to resume.",
      )
    : error instanceof Error
      ? error.message
      : "Sampling failed. Retry to resume.";
  await tasks().updateOne(
    { ...taskFilter(task._id!, task.userID), "evaluationBuild.jobId": jobId },
    {
      $set: {
        "evaluationBuild.phase": "error",
        "evaluationBuild.error": message,
      },
    },
  );
}

export async function generateRound(task: Task, jobId: string) {
  const history = await rounds()
    .find({ taskId: task._id!, status: "complete" })
    .sort({ number: 1 })
    .toArray();
  const counts = labelCounts(task.labels, history);
  const prior: Record<string, number> = {};
  for (const round of history)
    for (const [label, count] of Object.entries(round.quotas))
      prior[label] = (prior[label] || 0) + count;
  const excluded = history.flatMap((r) =>
    r.records.map((record) => record.recordId),
  );
  const size = Math.min(
    task.evaluationBuild!.batchSize,
    Math.max(
      0,
      (task.evaluationBuild!.eligibleRecords ?? Infinity) - excluded.length,
    ),
  );
  const allocation = allocateQuotas(
    counts,
    task.evaluationBuild!.targetPerLabel,
    size,
    prior,
  );
  const quotas = Object.fromEntries(
    Object.entries(allocation).sort(([a], [b]) => counts[a] - counts[b]),
  );
  const number = history.length + 1;
  const queries = samplingQueries(task);
  for (const label of task.labels) {
    const spans = [
      ...new Set(
        history.flatMap((r) =>
          r.records.flatMap((record) =>
            record.spans
              .filter((s) => s.label === label.name)
              .map((s) => s.text),
          ),
        ),
      ),
    ];
    // Reproducible sample of at most two accumulated spans, replaced each round.
    spans.sort((a, b) =>
      crypto
        .createHash("sha256")
        .update(`${task._id}:${number}:${a}`)
        .digest("hex")
        .localeCompare(
          crypto
            .createHash("sha256")
            .update(`${task._id}:${number}:${b}`)
            .digest("hex"),
        ),
    );
    queries[label.name].push(...spans.slice(0, 2));
  }
  const examples = task.samplingVersion === 2
    ? Object.fromEntries(task.labels.map((label) => [
        label.name,
        history.flatMap((round) => round.records
          .filter((record) => record.labels.includes(label.name))
          .map((record) => record.text)),
      ]))
    : {};
  const result = await sample(
    task, queries, quotas, excluded, false, examples,
    task.samplingVersion === 2 ? history.length : -1,
  );
  const filter = {
    ...taskFilter(task._id!, task.userID),
    "evaluationBuild.jobId": jobId,
  };
  if (!(await tasks().findOne(filter))) return;
  if (result.records.length) {
    await rounds().updateOne(
      { _id: `${task._id}:${number}` },
      {
        $setOnInsert: {
          taskId: task._id!,
          number,
          revision: 0,
          status: "draft",
          quotas,
          dataset: {
            totalRecords: result.totalRecords,
            eligibleRecords: result.eligibleRecords,
          },
          records: result.records,
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }
  await tasks().updateOne(filter, {
    $set: {
      "evaluationBuild.phase": "collecting",
      "evaluationBuild.round": result.records.length ? number : history.length,
      "evaluationBuild.totalRecords": result.totalRecords,
      "evaluationBuild.eligibleRecords": result.eligibleRecords,
    },
  });
}

export async function finishEvaluation(task: Task, jobId: string) {
  const history = await rounds()
    .find({ taskId: task._id!, status: "complete" })
    .sort({ number: 1 })
    .toArray();
  const records = history.flatMap((r) => r.records);
  const filename = `evaluation_${task._id}.csv`;
  const valRows = records.map((record) => ({
    ...record.sampleContent,
    __evaluation_text: record.text,
    __evaluation_record_id: record.recordId,
    __evaluation_labels: JSON.stringify(record.labels),
    __evaluation_spans: JSON.stringify(record.spans),
  }));
  ensureValDatasetsDir();
  const destination = getValDatasetPath(filename);
  const temporary = path.join(
    path.dirname(destination),
    `.${filename}.${jobId}.tmp`,
  );
  await fs.writeFile(temporary, Papa.unparse(valRows), "utf8");
  await fs.rename(temporary, destination);
  const guideCount = await generateGuideBatch(
    task, records.map((r) => r.recordId), records.map((r) => r.text),
  );
  const savedGuideCount = guideCount || await getCollection(
    process.env.ANNOTATION_COLLECTION_NAME || "AnnotationDetails",
  ).countDocuments({ taskId: task._id, source: "guide" });
  if (!savedGuideCount)
    throw new Error(
      "No guide records are available outside the evaluation set.",
    );
  const filter = {
    ...taskFilter(task._id!, task.userID),
    "evaluationBuild.jobId": jobId,
  };
  if (!(await tasks().findOne(filter))) return;
  const baselineRows = records.map((r) => ({
    text: r.text,
    labels: JSON.stringify(r.labels),
  }));
  await tasks().updateOne(filter, {
    $set: {
      valFile: filename,
      valFileName: filename,
      labelColumn: "__evaluation_labels",
      status: "ready",
      demoBaseline: createDemoBaseline(
        baselineRows,
        "text",
        "labels",
        task.labels.map((l) => l.name),
      ),
      "evaluationBuild.phase": "frozen",
      updatedAt: new Date().toISOString(),
    },
    $unset: { "evaluationBuild.error": "" },
  });
}

export async function generateGuideBatch(
  task: Task, valIds: string[] = [], valTexts: string[] = [],
) {
  const annotations = getCollection<AnnotationItem & { recordId: string }>(
    process.env.ANNOTATION_COLLECTION_NAME || "AnnotationDetails",
  );
  const previous = await annotations.find({ taskId: task._id!, source: "guide" })
    .sort({ sampleId: 1 }).toArray();
  const budget = task.guideBudget ?? task.evaluationBuild?.guideSize ?? 15;
  if (previous.length >= budget || previous.some((item) => item.aiAnnotation?.isCorrect == null))
    return 0;
  const batchSize = task.samplingVersion === 2
    ? Math.min(5, budget - previous.length)
    : budget - previous.length;
  const counts = Object.fromEntries(task.labels.map((label) => [
    label.name, previous.filter((item) => item.labels.includes(label.name)).length,
  ]));
  const quotas = allocateQuotas(counts, Number.MAX_SAFE_INTEGER, batchSize);
  const examples = Object.fromEntries(task.labels.map((label) => [
    label.name,
    previous.filter((item) => item.labels.includes(label.name))
      .map((item) => String(item.sampleContent.text_combined ?? item.sampleContent[task.columns[0]] ?? "")),
  ]));
  let excludedTexts = valTexts;
  if (task.valFile && !valIds.length) {
    const csv = await fs.readFile(getValDatasetPath(task.valFile), "utf8");
    const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
    valIds = rows.map((row) => row.__evaluation_record_id).filter(Boolean);
    excludedTexts = rows.map((row) => row[task.columns[0]] ?? row.__evaluation_text ?? "")
      .filter(Boolean);
  }
  const previousIds = previous.map((item) => item.recordId);
  const iteration = task.samplingVersion === 2 ? (previous.length ? Math.ceil(previous.length / 5) : 0) : -1;
  const guide = await sample(
    task, samplingQueries(task), quotas, [...valIds, ...previousIds], true,
    examples, iteration, excludedTexts, previousIds,
  );
  if (guide.records.length) await annotations.bulkWrite(guide.records.map((record, index) => ({
    updateOne: {
      filter: { taskId: task._id, source: "guide", recordId: record.recordId },
      update: {
        $setOnInsert: {
          taskId: task._id,
          source: "guide",
          sampleId: previous.length + index + 1,
          recordId: record.recordId,
          sampleContent: record.sampleContent,
          labels: [],
          aiAnnotation: null,
          createdBy: task.userID,
          createdAt: new Date().toISOString(),
        },
      },
      upsert: true,
    },
  })));
  if (guide.records.length && task.samplingVersion === 2) await tasks().updateOne(
    taskFilter(task._id!, task.userID),
    { $set: { guideSamplingRound: iteration + 1 } },
  );
  return guide.records.length;
}
