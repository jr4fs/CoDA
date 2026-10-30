import type { Task } from "@common/types/tasks";
import type { EvaluationRecord } from "@common/types/evaluationBuilder";
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
      quotas,
      excluded,
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
  const queries = initialQueries(task);
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
  const result = await sample(task, queries, quotas, excluded);
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
  const zeroCounts = Object.fromEntries(
    task.labels.map((label) => [label.name, 0]),
  );
  const quotas = allocateQuotas(
    zeroCounts,
    1,
    Math.min(
      task.evaluationBuild!.guideSize,
      (task.evaluationBuild!.eligibleRecords ?? 0) - records.length,
    ),
  );
  // Evaluation evidence never enters guide queries or the model's label definitions.
  const guide = await sample(
    task,
    initialQueries(task),
    quotas,
    records.map((r) => r.recordId),
    true,
  );
  if (!guide.records.length)
    throw new Error(
      "No guide records are available outside the evaluation set.",
    );
  const filter = {
    ...taskFilter(task._id!, task.userID),
    "evaluationBuild.jobId": jobId,
  };
  if (!(await tasks().findOne(filter))) return;
  const annotations = getCollection(
    process.env.ANNOTATION_COLLECTION_NAME || "AnnotationDetails",
  );
  await annotations.bulkWrite(
    guide.records.map((record, index) => ({
      updateOne: {
        filter: { taskId: task._id, source: "guide", sampleId: index + 1 },
        update: {
          $setOnInsert: {
            taskId: task._id,
            source: "guide",
            sampleId: index + 1,
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
    })),
  );
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
