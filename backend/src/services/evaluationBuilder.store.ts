import type { Task } from "@common/types/tasks";
import type { EvaluationBuilderState, EvaluationRound } from "@common/types/evaluationBuilder";
import type { AuthRequest } from "./tasks.service";
import { ObjectId } from "mongodb";
import crypto from "crypto";
import { getCollection } from "./database.service";
import { labelCounts } from "../utils/evaluationBuilder";

export const tasks = () =>
  getCollection<Task>(process.env.TASKS_COLLECTION_NAME || "TaskDetails");
export const rounds = () =>
  getCollection<EvaluationRound & { _id: string }>("EvaluationRounds");
export const timeout = Number(process.env.SAMPLING_TIMEOUT_MS) || 20 * 60 * 1000;
export const taskFilter = (taskId: string, userID: string) => ({
  _id: new ObjectId(taskId) as any,
  userID,
});

export class BuilderError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function ownedTask(req: AuthRequest) {
  if (!req.user) throw new BuilderError("Unauthorized", 401);
  const id = String(req.params.taskId);
  if (!ObjectId.isValid(id)) throw new BuilderError("Invalid task ID");
  const task = await tasks().findOne(taskFilter(id, req.user.userId));
  if (!task) throw new BuilderError("Task not found", 404);
  if (!task.evaluationBuild)
    throw new BuilderError("This task uses an uploaded evaluation set.", 409);
  return { ...task, _id: id } as Task;
}

export async function getBuilderState(task: Task): Promise<EvaluationBuilderState> {
  const history = await rounds()
    .find({ taskId: task._id! })
    .sort({ number: 1 })
    .toArray();
  const complete = history.filter((r) => r.status === "complete");
  const dataset = history.find((r) => r.dataset)?.dataset;
  const hydratedTask =
    dataset && task.evaluationBuild!.eligibleRecords === undefined
      ? { ...task, evaluationBuild: { ...task.evaluationBuild!, ...dataset } }
      : task;
  const counts = labelCounts(task.labels, complete);
  const reviewedCount = complete.reduce((n, r) => n + r.records.length, 0);
  const eligible = hydratedTask.evaluationBuild!.eligibleRecords;
  return {
    task: hydratedTask,
    round: history[history.length - 1] ?? null,
    counts,
    reviewedCount,
    remainingCount:
      eligible === undefined ? null : Math.max(0, eligible - reviewedCount),
    targetsMet: task.labels.every(
      (l) => counts[l.name] >= task.evaluationBuild!.targetPerLabel,
    ),
    exhausted: eligible !== undefined && reviewedCount >= eligible,
  };
}

export async function acquireJob(task: Task, phase: "sampling" | "freezing") {
  const jobId = crypto.randomUUID();
  const result = await tasks().updateOne(
    {
      ...taskFilter(task._id!, task.userID),
      "evaluationBuild.phase": { $in: ["collecting", "error"] },
    },
    {
      $set: {
        "evaluationBuild.phase": phase,
        "evaluationBuild.jobId": jobId,
        "evaluationBuild.jobStartedAt": new Date().toISOString(),
        ...(phase === "freezing"
          ? {
              "evaluationBuild.frozenAt":
                task.evaluationBuild!.frozenAt || new Date().toISOString(),
            }
          : {}),
      },
      $unset: { "evaluationBuild.error": "" },
    },
  );
  if (!result.modifiedCount)
    throw new BuilderError(
      "Another operation is running. Refresh to see its progress.",
      409,
    );
  return jobId;
}
