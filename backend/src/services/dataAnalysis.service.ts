import type { Response } from "express";
import { ObjectId } from "mongodb";
import fs from "fs/promises";
import path from "path";
import type { Task } from "@common/types/tasks";
import type { AuthRequest } from "./tasks.service";
import { getCollection } from "./database.service";
import { getAnnotationOutputPath, getUploadsPath } from "../utils/fileUpload";
import { loadAnalysis, loadAnalysisRecords, summarizeAnalysis } from "../utils/dataAnalysis";

const collectionName = process.env.TASKS_COLLECTION_NAME || "TaskDetails";

async function ownedTask(req: AuthRequest, res: Response): Promise<Task | null> {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return null;
  }
  if (!ObjectId.isValid(req.params.taskId)) {
    res.status(400).json({ success: false, message: "Invalid task ID" });
    return null;
  }
  const task = await getCollection<Task>(collectionName).findOne({ _id: new ObjectId(req.params.taskId) as any, userID: req.user.userId });
  if (!task) res.status(404).json({ success: false, message: "Task not found" });
  return task;
}

async function sources(task: Task, userId: string, taskId: string) {
  const rawName = task.restFile || task.file;
  if (!rawName) return null;
  const rawFile = getUploadsPath(path.basename(rawName));
  try { await fs.access(rawFile); } catch { return null; }
  let predictionFile: string | null = null;
  if (task.finalInferenceFile && task.finalInferenceStatus !== "running") {
    const name = path.basename(task.finalInferenceFile);
    const prefix = `${Buffer.from(userId).toString("base64url")}-${taskId}-`;
    if (name.startsWith(prefix)) {
      const candidate = getAnnotationOutputPath(name);
      try { await fs.access(candidate); predictionFile = candidate; } catch { /* Inference has not produced a durable file yet. */ }
    }
  }
  return { rawFile, predictionFile };
}

export async function getDataAnalysisSummary(req: AuthRequest, res: Response) {
  try {
    const task = await ownedTask(req, res);
    if (!task) return;
    const files = await sources(task, req.user!.userId, req.params.taskId);
    if (!files) return res.status(200).json({ success: true, status: "unavailable", source: "d_all" });
    const names = task.labels.map((label) => label.name);
    const textColumn = task.columns?.[0] ?? "text";
    const raw = await loadAnalysis(files.rawFile, names, textColumn, false);
    const predicted = files.predictionFile ? await loadAnalysis(files.predictionFile, names, textColumn, true) : null;
    const usable = predicted?.totalEntries === raw.totalEntries ? predicted : null;
    const search = String(req.query.search ?? "");
    const sort = String(req.query.sort ?? "latest");
    const label = String(req.query.label ?? "");
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 25);
    const response = summarizeAnalysis(raw, usable, {
      search, sort, label: names.includes(label) ? label : undefined, page, pageSize,
    });
    if (task.finalInferenceStatus === "error" || (task.finalInferenceStatus === "ready" && !usable) || (predicted && !usable)) response.predictionStatus = "error";
    return res.status(200).json(response);
  } catch (error) {
    console.error("Error loading D_all analytics:", error);
    return res.status(500).json({ success: false, message: "Failed to load full-dataset analytics" });
  }
}

export async function getDataAnalysisIdRecords(req: AuthRequest, res: Response) {
  try {
    const task = await ownedTask(req, res);
    if (!task) return;
    const files = await sources(task, req.user!.userId, req.params.taskId);
    if (!files) return res.status(404).json({ success: false, message: "Full dataset unavailable" });
    const names = task.labels.map((label) => label.name);
    const textColumn = task.columns?.[0] ?? "text";
    const raw = await loadAnalysis(files.rawFile, names, textColumn, false);
    const predicted = files.predictionFile ? await loadAnalysis(files.predictionFile, names, textColumn, true) : null;
    const usable = predicted?.totalEntries === raw.totalEntries ? predicted : null;
    const source = usable ? files.predictionFile! : files.rawFile;
    const records = await loadAnalysisRecords(source, (usable ?? raw).columns, req.params.id, names, Boolean(usable));
    return res.status(200).json({ success: true, records });
  } catch (error) {
    console.error("Error loading D_all ID records:", error);
    return res.status(500).json({ success: false, message: "Failed to load record history" });
  }
}
