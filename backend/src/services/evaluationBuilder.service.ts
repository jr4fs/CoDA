import type { Response } from "express";
import type { AuthRequest } from "./tasks.service";
import { validateReview } from "../utils/evaluationBuilder";
import { tasks, rounds, timeout, taskFilter, BuilderError, ownedTask, getBuilderState, acquireJob } from "./evaluationBuilder.store";
import { generateRound, finishEvaluation, failJob } from "./evaluationBuilder.jobs";

function respondError(error: unknown, res: Response) {
  const status = error instanceof BuilderError ? error.status : 500;
  console.error("Evaluation builder:", error);
  return res
    .status(status)
    .json({
      success: false,
      message:
        error instanceof Error ? error.message : "Evaluation builder failed",
    });
}

export async function getEvaluationBuilder(req: AuthRequest, res: Response) {
  try {
    let task = await ownedTask(req);
    const build = task.evaluationBuild!;
    if (
      ["sampling", "freezing"].includes(build.phase) &&
      Date.now() - Date.parse(build.jobStartedAt || "1970-01-01") >
        timeout + 60_000
    ) {
      await tasks().updateOne(
        {
          ...taskFilter(task._id!, task.userID),
          "evaluationBuild.jobId": build.jobId,
        },
        {
          $set: {
            "evaluationBuild.phase": "error",
            "evaluationBuild.error":
              "Sampling was interrupted. Retry to resume from saved reviews.",
          },
        },
      );
      task = await ownedTask(req);
    }
    return res.json(await getBuilderState(task));
  } catch (error) {
    return respondError(error, res);
  }
}

export async function nextEvaluationRound(req: AuthRequest, res: Response) {
  try {
    const task = await ownedTask(req);
    if (task.evaluationBuild!.frozenAt)
      throw new BuilderError("The evaluation set is frozen.", 409);
    const current = await getBuilderState(task);
    if (current.round?.status === "draft") {
      // A crash after the durable round write can leave the job status stale.
      if (task.evaluationBuild!.phase === "error")
        await tasks().updateOne(taskFilter(task._id!, task.userID), {
          $set: { "evaluationBuild.phase": "collecting" },
        });
      return res.json(current);
    }
    if (current.targetsMet || current.exhausted)
      throw new BuilderError(
        "Review the summary and finish building the evaluation set.",
        409,
      );
    const jobId = await acquireJob(task, "sampling");
    void generateRound(current.task, jobId)
      .catch((error) => failJob(task, jobId, error))
      .catch((error) =>
        console.error("Could not persist sampling failure", error),
      );
    return res.status(202).json({ success: true });
  } catch (error) {
    return respondError(error, res);
  }
}

export async function saveEvaluationReview(req: AuthRequest, res: Response) {
  try {
    const task = await ownedTask(req);
    if (task.evaluationBuild!.frozenAt)
      throw new BuilderError("The evaluation set is frozen.", 409);
    const { roundNumber, revision, recordId, labels, spans } = req.body;
    const round = await rounds().findOne({
      _id: `${task._id}:${roundNumber}`,
      status: "draft",
    });
    if (!round)
      throw new BuilderError("This round is no longer editable.", 409);
    const index = round.records.findIndex((r) => r.recordId === recordId);
    if (index < 0) throw new BuilderError("Record is not in this round.");
    const record = { ...round.records[index], labels, spans, reviewed: true };
    const error = validateReview(
      record,
      task.labels,
      task.type === "Single-class",
    );
    if (error) throw new BuilderError(error);
    const saved = await rounds().updateOne(
      { _id: round._id, status: "draft", revision },
      { $set: { [`records.${index}`]: record }, $inc: { revision: 1 } },
    );
    if (!saved.modifiedCount)
      throw new BuilderError(
        "This round changed in another tab. Reload before saving.",
        409,
      );
    return res.json(await getBuilderState(task));
  } catch (error) {
    return respondError(error, res);
  }
}

export async function completeEvaluationRound(req: AuthRequest, res: Response) {
  try {
    const task = await ownedTask(req);
    if (task.evaluationBuild!.frozenAt)
      throw new BuilderError("The evaluation set is frozen.", 409);
    const round = await rounds().findOne({
      _id: `${task._id}:${req.body.roundNumber}`,
    });
    if (!round) throw new BuilderError("Round not found.", 404);
    if (round.status === "complete") return res.json(await getBuilderState(task));
    if (
      !round.records.length ||
      round.records.some(
        (r) =>
          !r.reviewed ||
          validateReview(r, task.labels, task.type === "Single-class"),
      )
    )
      throw new BuilderError(
        "Review every record and highlight the required evidence first.",
      );
    const result = await rounds().updateOne(
      { _id: round._id, status: "draft", revision: req.body.revision },
      {
        $set: { status: "complete", completedAt: new Date().toISOString() },
        $inc: { revision: 1 },
      },
    );
    if (!result.modifiedCount)
      throw new BuilderError(
        "The round changed. Refresh before completing it.",
        409,
      );
    return res.json(await getBuilderState(task));
  } catch (error) {
    return respondError(error, res);
  }
}

export async function freezeEvaluation(req: AuthRequest, res: Response) {
  try {
    const task = await ownedTask(req);
    if (task.evaluationBuild!.phase === "frozen")
      return res.json({ success: true });
    const current = await getBuilderState(task);
    if (
      current.round?.status === "draft" ||
      (!current.targetsMet && !current.exhausted) ||
      !current.reviewedCount
    )
      throw new BuilderError(
        "Complete the evaluation rounds before continuing.",
        409,
      );
    if (current.remainingCount === 0)
      throw new BuilderError(
        "All usable records were reviewed. There are no separate records left for codebook development; the evaluation set is saved, but this dataset cannot continue to guide review.",
        409,
      );
    const jobId = await acquireJob(task, "freezing");
    void finishEvaluation(current.task, jobId)
      .catch((error) => failJob(task, jobId, error))
      .catch((error) =>
        console.error("Could not persist sampling failure", error),
      );
    return res.status(202).json({ success: true });
  } catch (error) {
    return respondError(error, res);
  }
}
