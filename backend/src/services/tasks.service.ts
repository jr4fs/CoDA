import { Request, Response } from "express";
import { CreateAutoLabelTaskRequest, CreateTaskRequest, StartAutoLabelJobRequest, Task } from "@common/types/tasks";
import { EmbedDatasetRequest } from "@common/types/embedding";
import { AnonymizeConfig } from "@common/types/anonymize";
import { getCollection } from "./database.service";
import {
  fileExists,
  restFileExists,
  valFileExists,
  guideFileExists,
  ensureRestDatasetsDir,
  ensureValDatasetsDir,
  getRestDatasetPath,
  getValDatasetPath,
  ensureUploadsDir,
  generateUploadFilename,
  getUploadsPath,
  ensureAnnotationOutputsDir,
  getAnnotationOutputPath,
} from "../utils/fileUpload";
import { ObjectId } from "mongodb";
import Papa from "papaparse";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import zlib from "zlib";
import { AnnotationItem } from "@common/types/annotations";
import { createDemoBaseline } from "../utils/demoBaseline";
dotenv.config();

interface TaskValidation {
  valid: boolean;
  errors: string[];
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    username: string;
  };
}

const TASKS_COLLECTION = process.env.TASKS_COLLECTION_NAME || "TaskDetails";
const ANNOTATION_COLLECTION =
  process.env.ANNOTATION_COLLECTION_NAME || "AnnotationDetails";
const ANONYMIZE_CONFIG_COLLECTION = "AnonymizeConfig";
const CONFIG_DOC_ID = "global";

const TASK_JSON_REQUIRED_KEYS = ["taskname", "description"];
const GENERATED_CODEBOOKS_DIR = "generated_codebooks";
const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
// Backstop so a hung ML request can't leave a task pending forever. A dropped
// connection (e.g. pybackend restart) already rejects fast; this bounds true hangs.
const SAMPLING_TIMEOUT_MS = Number(process.env.SAMPLING_TIMEOUT_MS) || 20 * 60 * 1000;
// Default total number of samples to draw when the request doesn't specify one.
const DEFAULT_COVERAGE_SAMPLES = Number(process.env.DEFAULT_COVERAGE_SAMPLES) || 15;

function toSafeFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureUniqueFilePath(
  dir: string,
  baseName: string,
  ext: string,
): Promise<string> {
  const basePath = path.join(dir, `${baseName}${ext}`);
  try {
    await fs.access(basePath);
  } catch {
    return basePath;
  }

  let counter = 1;
  while (true) {
    const candidate = path.join(dir, `${baseName} ${counter}${ext}`);
    try {
      await fs.access(candidate);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

/**
 * Fetches the global anonymize config from DB (or returns null if none exists)
 */
async function getAnonymizeConfigFromDB(): Promise<AnonymizeConfig | null> {
  try {
    const collection = getCollection<AnonymizeConfig>(
      ANONYMIZE_CONFIG_COLLECTION,
    );
    return await collection.findOne({ _id: CONFIG_DOC_ID as any });
  } catch (error) {
    console.error("Error fetching anonymize config:", error);
    return null;
  }
}

function parseCsvBuffer(buffer: Buffer): any[] {
  try {
    const csvText = buffer.toString("utf-8");
    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parseResult.errors.length > 0) {
      console.warn("CSV parsing warnings:", parseResult.errors);
    }

    return Array.isArray(parseResult.data) ? parseResult.data : [];
  } catch (error) {
    console.error("Error in parseCsvBuffer:", error);
    throw error;
  }
}

// Read ONLY the header row of a CSV (Papa `preview` stops after one row) so large
// uploads don't get fully materialized on the event loop just to validate columns.
function getCsvColumns(buffer: Buffer): string[] {
  const result = Papa.parse(buffer.toString("utf-8"), {
    header: true,
    preview: 1,
    skipEmptyLines: true,
  });
  return ((result.meta?.fields as string[] | undefined) ?? []).map((f) => f);
}

// Approximate a CSV's data-row count by scanning newlines — cheap and non-blocking
// vs. building every row object. Used only for the informational upload summary,
// so exactness (quoted fields with embedded newlines) is not required.
function countCsvDataRows(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  let newlines = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x0a) newlines++;
  }
  const endsWithNewline = buffer[buffer.length - 1] === 0x0a;
  const lines = endsWithNewline ? newlines : newlines + 1;
  return Math.max(0, lines - 1); // exclude the header row
}

function parseTaskJson(buffer: Buffer): {
  name: string;
  description: string;
  type: Task["type"];
} {
  try {
    const raw = buffer.toString("utf-8");
    const taskJson = JSON.parse(raw) as {
      taskname?: string;
      taskName?: string;
      name?: string;
      description?: string;
      type?: string;
    };

    const name = taskJson.taskname || taskJson.taskName || taskJson.name || "";
    const description = taskJson.description || "";
    const type: Task["type"] =
      taskJson.type === "Single-class" ? "Single-class" : "Multiclass";

    if (!name.trim() || !description.trim()) {
      throw new Error(
        `Task JSON must include ${TASK_JSON_REQUIRED_KEYS.join(", ")}`,
      );
    }

    return { name: name.trim(), description: description.trim(), type };
  } catch (error) {
    console.error("Error in parseTaskJson:", error);
    throw error;
  }
}

function parseLabelsJson(buffer: Buffer) {
  try {
    const raw = buffer.toString("utf-8");
    const labelsJson = JSON.parse(raw) as {
      labels?: Array<{
        name?: string;
        description?: string;
        keywords?: string[];
        guidelines?: unknown;
      }>;
    };

    const labels = Array.isArray(labelsJson.labels) ? labelsJson.labels : [];
    if (labels.length === 0) {
      throw new Error("Labels JSON must include a non-empty labels array");
    }

    return labels.map((label, idx) => {
      const name = label.name?.trim() || "";
      const definition = label.description?.trim() || "";
      const keywords = Array.isArray(label.keywords)
        ? label.keywords.map((kw) => kw.trim()).filter(Boolean)
        : [];
      const guidelines = Array.isArray(label.guidelines)
        ? label.guidelines
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
            .join("\n")
        : typeof label.guidelines === "string"
          ? label.guidelines.trim()
          : undefined;

      if (!name || !definition || keywords.length === 0) {
        throw new Error(
          `Label ${idx + 1} must include name, description, and keywords`,
        );
      }

      return {
        name,
        definition,
        keywords,
        ...(guidelines ? { guidelines } : {}),
      };
    });
  } catch (error) {
    console.error("Error in parseLabelsJson:", error);
    throw error;
  }
}

function getRowTextValue(row: Record<string, unknown>): string {
  const candidates = ["text", "clean_text", "raw_text"];
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getColumnsFromRows(rows: Array<Record<string, unknown>>): string[] {
  if (rows.length === 0) return [];
  const clean_cols = Object.keys(rows[0]).filter(
    (key) => String(key).trim() !== "",
  );
  return clean_cols;
}

// On boot, any task still "sampling_pending" is orphaned: its in-flight sampling
// request died with the previous process (there is no running job to resume). Mark
// them failed so the UI stops spinning. New tasks created after boot are unaffected.
export async function failOrphanedSampling() {
  try {
    const coll = getCollection<Task>(TASKS_COLLECTION);
    const res = await coll.updateMany(
      { status: "sampling_pending" },
      {
        $set: {
          status: "sampling_error",
          updatedAt: new Date().toISOString(),
        } as Partial<Task>,
      },
    );
    if (res.modifiedCount > 0) {
      console.log(
        `[startup] Marked ${res.modifiedCount} orphaned sampling_pending task(s) as sampling_error`,
      );
    }
  } catch (error) {
    console.error("[startup] failOrphanedSampling error:", error);
  }
}

async function triggerSamplingInBackground(
  params: {
    taskId: string;
    userID: string;
    payload: EmbedDatasetRequest;
  },
) {
  const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
  const filter = { _id: new ObjectId(params.taskId) as any, userID: params.userID };

  try {
    await axios.post(`${ML_BASE_URL}/embedding/sample`, params.payload, {
      timeout: SAMPLING_TIMEOUT_MS,
    });
    await taskDetailsCollection.updateOne(filter, {
      $set: {
        status: "ready",
        updatedAt: new Date().toISOString(),
      } as Partial<Task>,
    });
    console.log(`[sampling] Completed taskId=${params.taskId}`);
  } catch (error: any) {
    const detail = error?.response?.data?.detail || error?.message || "Unknown sampling error";
    console.error(`[sampling] Failed taskId=${params.taskId}: ${detail}`);
    await taskDetailsCollection.updateOne(filter, {
      $set: {
        status: "sampling_error",
        updatedAt: new Date().toISOString(),
      } as Partial<Task>,
    });
  }
}

// Validates task creation request payload
function validateTaskPayload(payload: CreateTaskRequest): TaskValidation {
  const errors: string[] = [];

  if (!payload.name || payload.name.trim().length === 0) {
    errors.push("Task name is required");
  }

  if (!payload.description || payload.description.trim().length === 0) {
    errors.push("Task description is required");
  }

  if (!payload.type || !["Multiclass", "Single-class"].includes(payload.type)) {
    errors.push("Task type must be either 'Multiclass' or 'Single-class'");
  }

  if (!Array.isArray(payload.labels) || payload.labels.length === 0) {
    errors.push("At least one label is required");
  } else {
    payload.labels.forEach(
      (label: { name?: string; keywords?: string[] }, idx: number) => {
        if (!label.name || label.name.trim().length === 0) {
          errors.push(`Label ${idx + 1}: Label name is required`);
        }
        if (!Array.isArray(label.keywords) || label.keywords.length === 0) {
          errors.push(
            `Label ${idx + 1}: Keywords must be an array and must contain at least one keyword`,
          );
        }
      },
    );
  }

  if (!payload.file || payload.file.trim().length === 0) {
    errors.push("File path is required");
  } else if (!fileExists(payload.file)) {
    errors.push("File does not exist or has been deleted");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Creates a new task and stores it in the TaskDetails collection
export async function createTask(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;

  if (!userID) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - user not authenticated",
    });
  }

  try {
    const payload: CreateTaskRequest = {
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      labels: req.body.labels,
      codebook: Array.isArray(req.body.codebook)
        ? req.body.codebook
        : undefined,
      codebookSourceTaskId:
        typeof req.body.codebookSourceTaskId === "string"
          ? req.body.codebookSourceTaskId
          : undefined,
      codebookSourceTaskName:
        typeof req.body.codebookSourceTaskName === "string"
          ? req.body.codebookSourceTaskName
          : undefined,
      file: req.body.file,
      columns: req.body.columns,
      userID: userID,
    };

    // Validate payload
    const validation = validateTaskPayload(payload);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Task Creation Validation failed",
        errors: {
          payload: validation.errors,
        },
      });
    }

    const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
    const taskId = req.body.taskId?.toString().trim();

    console.log(`[createTask] userID: ${userID}, taskId in request: ${taskId}`);

    // Create task document
    const taskData: Omit<Task, "_id"> = {
      name: payload.name,
      description: payload.description,
      type: payload.type,
      labels: payload.labels,
      ...(Array.isArray(payload.codebook)
        ? { codebook: payload.codebook }
        : {}),
      ...(payload.codebookSourceTaskId
        ? { codebookSourceTaskId: payload.codebookSourceTaskId }
        : {}),
      ...(payload.codebookSourceTaskName
        ? { codebookSourceTaskName: payload.codebookSourceTaskName }
        : {}),
      file: payload.file,
      columns: payload.columns,
      userID: userID,
      labelColumn: "",
      modelName: "",
      status:
        req.body.status === "sampling_pending" ||
        req.body.status === "sampling_error" ||
        req.body.status === "ready"
          ? req.body.status
          : "ready",
      createdAt: req.body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (taskId) {
      console.log(`[createTask] Attempting update for taskId: ${taskId}`);
      const updateDoc: Partial<Task> = {
        name: taskData.name,
        description: taskData.description,
        type: taskData.type,
        labels: taskData.labels,
        file: taskData.file,
        columns: taskData.columns,
        userID: taskData.userID,
        status: taskData.status,
        updatedAt: taskData.updatedAt,
      };

      if (Array.isArray(payload.codebook)) {
        updateDoc.codebook = payload.codebook;
      }

      if (payload.codebookSourceTaskId) {
        updateDoc.codebookSourceTaskId = payload.codebookSourceTaskId;
      }

      if (payload.codebookSourceTaskName) {
        updateDoc.codebookSourceTaskName = payload.codebookSourceTaskName;
      }

      const result = await taskDetailsCollection.updateOne(
        { _id: new ObjectId(taskId) as any, userID: userID },
        { $set: updateDoc },
      );
      console.log(
        `[createTask] Update result: matchedCount=${result.matchedCount}, modifiedCount=${result.modifiedCount}`,
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Task not found or you don't have permission to update it",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Task updated successfully",
        taskId: taskId,
        task: {
          _id: taskId,
          ...taskData,
        },
      });
    }

    console.log(`[createTask] No taskId provided, performing insertOne`);
    const result = await taskDetailsCollection.insertOne(taskData);
    console.log(`[createTask] insertOne success: ${result.insertedId}`);

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      taskId: result.insertedId.toString(),
      task: {
        _id: result.insertedId.toString(),
        ...taskData,
      },
    });
  } catch (error: any) {
    console.error("Error creating task:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create task",
    });
  }
}

// Retrieves all tasks for a specific user
export async function getUserTasks(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    const taskDetailsCollection = getCollection<Task>("TaskDetails");
    const tasks = await taskDetailsCollection
      .find({ userID: userID })
      .toArray();
    const tasksWithStatus = tasks.map((task) => ({
      ...task,
      status: task.status ?? "ready",
    }));

    return res.status(200).json({
      success: true,
      tasks: tasksWithStatus,
      count: tasksWithStatus.length,
    });
  } catch (error: any) {
    console.error("Error retrieving tasks:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve tasks",
    });
  }
}

// Retrieves all tasks for a specific user
export async function getTaskByID(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;
    const { taskId } = req.params;

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid - No task ID found",
      });
    }
    const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
    const task = await taskDetailsCollection.findOne({
      _id: new ObjectId(taskId) as any,
      userID: userID,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    let demoBaseline = task.demoBaseline;
    if (!demoBaseline && task.valFile) {
      try {
        const rows = parseCsvBuffer(await fs.readFile(getValDatasetPath(path.basename(task.valFile))));
        demoBaseline = createDemoBaseline(rows, task.columns?.[0] ?? "text", task.labelColumn, task.labels.map((label) => label.name));
      } catch {
        // Older tasks without an accessible evaluation CSV remain partial.
      }
    }

    return res.status(200).json({
      success: true,
      task: {
        ...task,
        demoBaseline,
        status: task.status ?? "ready",
      },
    });
  } catch (error: any) {
    console.error("Error retrieving task:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve task",
    });
  }
}

// Summarize the uploaded labeled evaluation set; full-dataset inference is not required.
export async function getDataAnalysisData(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  const { taskId } = req.params;

  if (!userID) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (!ObjectId.isValid(taskId)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }

  try {
    const taskCollection = getCollection<Task>(TASKS_COLLECTION);
    const task = await taskCollection.findOne({ _id: new ObjectId(taskId) as any, userID });
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });

    const fileReference = task.valFile;
    if (!fileReference) {
      return res.status(200).json({ success: true, status: "pending", rows: [], headers: [] });
    }
    const safeName = path.basename(fileReference);
    const filePath = getValDatasetPath(safeName);
    const csvText = await fs.readFile(filePath, "utf-8");
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    if (parsed.errors.length > 0) console.warn("Data analysis CSV parsing warnings:", parsed.errors);

    return res.status(200).json({
      success: true,
      status: "ready",
      rows: Array.isArray(parsed.data) ? parsed.data : [],
      headers: parsed.meta.fields ?? [],
    });
  } catch (error: any) {
    console.error("Error retrieving data analysis dataset:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve data analysis dataset",
    });
  }
}

export async function saveTaskCodebook(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;
    const { taskId, codebook } = req.body as {
      taskId?: string;
      codebook?: unknown;
    };

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid - No task ID found",
      });
    }

    if (!Array.isArray(codebook)) {
      return res.status(400).json({
        success: false,
        message: "Invalid codebook payload",
      });
    }

    const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
    const result = await taskDetailsCollection.updateOne(
      { _id: new ObjectId(taskId) as any, userID: userID },
      {
        $set: {
          codebook,
          updatedAt: new Date().toISOString(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to update it",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Codebook saved",
    });
  } catch (error: any) {
    console.error("Error saving codebook:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save codebook",
    });
  }
}

// Mark a codebook-development task as complete (review finished). After this the
// codebook + sample review are locked read-only in the UI.
export async function markCodebookComplete(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  const { taskId, metricsFiles } = req.body as {
    taskId?: string;
    metricsFiles?: { sample?: string; batch?: string; metadata?: string };
  };

  if (!userID) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (!taskId) return res.status(400).json({ success: false, message: "taskId is required" });

  try {
    const collection = getCollection<Task>(TASKS_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(taskId) as any, userID },
      {
        $set: {
          codebookComplete: true,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(metricsFiles ? { metricsFiles } : {}),
        },
      },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error marking codebook complete:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to mark complete" });
  }
}

// Persist the server path of the final full-dataset (d_all) inference output so
// it survives a reload and can be re-downloaded.
export async function saveFinalInferenceResult(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  const { taskId, outputFile } = req.body as { taskId?: string; outputFile?: string };

  if (!userID) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (!taskId) return res.status(400).json({ success: false, message: "taskId is required" });
  if (!outputFile) return res.status(400).json({ success: false, message: "outputFile is required" });
  if (!ObjectId.isValid(taskId)) return res.status(400).json({ success: false, message: "Invalid task ID" });
  const safeOutputFile = path.basename(outputFile);
  if (!safeOutputFile.startsWith(annotationOutputPrefix(userID, taskId))) {
    return res.status(400).json({ success: false, message: "Output file does not belong to this task" });
  }

  try {
    const collection = getCollection<Task>(TASKS_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(taskId) as any, userID },
      { $set: { finalInferenceFile: safeOutputFile, updatedAt: new Date().toISOString() } },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error saving final inference result:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to save result" });
  }
}

export async function exportCodebookSnapshot(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;
    const { taskId, codebook, lastPrompt } = req.body as {
      taskId?: string;
      codebook?: unknown;
      lastPrompt?: unknown;
    };

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid - No task ID found",
      });
    }

    if (!Array.isArray(codebook)) {
      return res.status(400).json({
        success: false,
        message: "Invalid codebook payload",
      });
    }

    if (lastPrompt != null && typeof lastPrompt !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid last prompt payload",
      });
    }

    const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
    const task = await taskDetailsCollection.findOne({
      _id: new ObjectId(taskId) as any,
      userID: userID,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to update it",
      });
    }

    const projectRoot = path.resolve(__dirname, "../../../");
    const outputDir = path.join(projectRoot, GENERATED_CODEBOOKS_DIR);
    await fs.mkdir(outputDir, { recursive: true });

    const safeName = toSafeFilename(task.name || "task") || "task";
    const baseName = `${safeName}_codebook_and_prompt`;
    const filePath = await ensureUniqueFilePath(outputDir, baseName, ".txt");
    const filename = path.basename(filePath);

    const codebookText = (codebook as string[])
      .map((rule) => `- ${rule}`)
      .join("\n");
    const content = [
      "## CODEBOOK ##",
      codebookText,
      "",
      "## LAST PROMPT ##",
      typeof lastPrompt === "string" ? lastPrompt : "",
      "",
    ].join("\n");

    await fs.writeFile(filePath, content, "utf-8");

    return res.status(200).json({
      success: true,
      filename,
    });
  } catch (error: any) {
    console.error("Error exporting codebook snapshot:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to export codebook",
    });
  }
}

/*
 * Handles CSV file upload using multer
 * Returns the stored filename to be used in task creation
 */
export async function uploadTaskFile(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file provided",
      });
    }

    ensureUploadsDir();
    const filename = generateUploadFilename(req.file.originalname);
    const outputPath = getUploadsPath(filename);
    await fs.writeFile(outputPath, req.file.buffer, "utf-8");

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      filePath: filename,
    });
  } catch (error: any) {
    console.error("Error uploading file:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload file",
      error: error,
    });
  }
}

/*
 * Uploads D_val, D_all, task JSON, and labels JSON
 * D_all in rest_datasets, D_val in val_datasets
 * Creates the task and queues sampling
 */
export async function uploadTaskBundle(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  console.log(`[uploadTaskBundle] Started by user: ${userID}`);

  if (!userID) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized - user not authenticated",
    });
  }

  try {
    const files = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;

    const dValFile = files?.d_val?.[0];
    const dAllFile = files?.d_all?.[0];
    const taskJsonFile = files?.task_json?.[0];
    const labelsJsonFile = files?.labels_json?.[0];
    const taskNameField = req.body.task_name as string | undefined;
    const taskDescriptionField = req.body.task_description as string | undefined;
    const taskTypeField = req.body.task_type as string | undefined;
    const textColumn = req.body.text_column as string | undefined;
    const labelColumn = req.body.label_column as string | undefined;
    const modelName = req.body.model_name as string | undefined;

    if (
      !dValFile ||
      !dAllFile ||
      !labelsJsonFile ||
      !labelColumn
    ) {
      console.error("[uploadTaskBundle] Missing files:", {
        d_val: !!dValFile,
        d_all: !!dAllFile,
        task_json: !!taskJsonFile,
        task_name: !!taskNameField,
        task_description: !!taskDescriptionField,
        labels_json: !!labelsJsonFile,
        labelColumn: !!labelColumn,
      });
      return res.status(400).json({
        success: false,
        message:
          "Missing fields. Expected d_val, d_all, labels_json, label column, and either task_json or task_name + task_description",
      });
    }

    let taskJsonRaw = "";
    let taskInfo: {
      name: string;
      description: string;
      type: Task["type"];
    };
    if (taskJsonFile) {
      console.log("[uploadTaskBundle] Parsing task_json...");
      taskJsonRaw = taskJsonFile.buffer.toString("utf-8");
      taskInfo = parseTaskJson(taskJsonFile.buffer);
      console.log("[uploadTaskBundle] Task Info parsed from file:", taskInfo.name);
    } else {
      const name = String(taskNameField ?? "").trim();
      const description = String(taskDescriptionField ?? "").trim();
      if (!name || !description) {
        return res.status(400).json({
          success: false,
          message:
            "Task name and description are required when task_json is not provided.",
        });
      }
      const type: Task["type"] =
        taskTypeField === "Single-class" ? "Single-class" : "Multiclass";
      taskInfo = { name, description, type };
      taskJsonRaw = JSON.stringify(
        { taskname: name, description, type },
        null,
        2,
      );
      console.log("[uploadTaskBundle] Task Info parsed from form fields:", taskInfo.name);
    }

    // Parse Labels JSON
    console.log("[uploadTaskBundle] Parsing labels_json...");
    const labelsJsonRaw = labelsJsonFile.buffer.toString("utf-8");
    const labels = parseLabelsJson(labelsJsonFile.buffer);
    console.log("[uploadTaskBundle] Labels parsed, count:", labels.length);

    // Parse the labeled (val) set fully — it is small. Do NOT materialize the
    // unlabeled (rest/d_all) set: it can be hundreds of thousands of rows and
    // parsing it synchronously freezes the event loop (and the whole UI). We read
    // only its header for validation and estimate its row count from newlines.
    // The client may gzip the (large) unlabeled CSV to speed the upload; decompress
    // here before parsing/writing. `d_all_gzip` is a form field set by the frontend.
    let dAllBuffer = dAllFile.buffer;
    if (String((req.body as any)?.d_all_gzip).toLowerCase() === "true") {
      try {
        dAllBuffer = zlib.gunzipSync(dAllFile.buffer);
        console.log(
          `[uploadTaskBundle] Decompressed d_all: ${dAllFile.buffer.length} -> ${dAllBuffer.length} bytes`,
        );
      } catch (e) {
        console.error("[uploadTaskBundle] gunzip failed:", e);
        return res.status(400).json({
          success: false,
          message: "Uploaded dataset was marked gzip but could not be decompressed.",
        });
      }
    }

    console.log("[uploadTaskBundle] Parsing val CSV + reading rest header...");
    const valRows = parseCsvBuffer(dValFile.buffer) as Array<
      Record<string, unknown>
    >;
    const restColumns = getCsvColumns(dAllBuffer);
    const restRowCount = countCsvDataRows(dAllBuffer);
    console.log(
      `[uploadTaskBundle] Parsed. Val rows: ${valRows.length}, Rest rows (approx): ${restRowCount}`,
    );

    // Validate Columns
    console.log("[uploadTaskBundle] Validating columns...");
    const valColumns = getColumnsFromRows(valRows);

    if (textColumn && !valColumns.includes(textColumn)) {
      return res.status(400).json({
        success: false,
        message: `The labeled CSV has no "${textColumn}" text column. Enter its exact header under Text column name.`,
      });
    }
    if (!valColumns.includes(labelColumn)) {
      return res.status(400).json({
        success: false,
        message: `The labeled CSV has no "${labelColumn}" label column. Enter its exact header under Label column name.`,
      });
    }
    if (textColumn && !restColumns.includes(textColumn)) {
      return res.status(400).json({
        success: false,
        message: `The unlabeled CSV has no "${textColumn}" text column. Enter its exact header under Text column name.`,
      });
    }

    // Ensure Directories and Write Files
    console.log("[uploadTaskBundle] Step 5: Saving files to disk...");
    ensureRestDatasetsDir();
    ensureValDatasetsDir();

    const uploadFilename = generateUploadFilename(dAllFile.originalname);
    const valFilename = generateUploadFilename(dValFile.originalname);
    const sharedUploadsPath = getUploadsPath(uploadFilename);
    const valPath = getValDatasetPath(valFilename);

    console.log(`[uploadTaskBundle] Writing dall file to ${sharedUploadsPath}`);
    await fs.writeFile(sharedUploadsPath, dAllBuffer, "utf-8");
    console.log(`[uploadTaskBundle] Writing val file to ${valPath}`);
    await fs.writeFile(valPath, dValFile.buffer, "utf-8");

    // DB: Create Task
    console.log("[uploadTaskBundle] Creating task in MongoDB...");
    const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
    const taskData: Omit<Task, "_id"> = {
      name: taskInfo.name,
      description: taskInfo.description,
      type: taskInfo.type,
      labels,
      taskJsonRaw,
      labelsJsonRaw,
      file: uploadFilename,
      restFile: uploadFilename,
      valFile: valFilename,
      valFileName: dValFile.originalname,
      inputFileName: dAllFile.originalname,
      columns: textColumn ? [textColumn] : ["text"],
      userID: userID,
      labelColumn: labelColumn,
      modelName: modelName ?? "",
      status: "sampling_pending",
      demoBaseline: createDemoBaseline(valRows, textColumn ?? "text", labelColumn, labels.map((label) => label.name)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const insertResult = await taskDetailsCollection.insertOne(taskData);
    const taskId = insertResult.insertedId.toString();
    console.log("[uploadTaskBundle] Task created with ID:", taskId);

    const samplingPayload: EmbedDatasetRequest = {
      file_path: uploadFilename,
      text_col: [textColumn ?? "text"],
      label_col: labelColumn,
      model_name: modelName ?? "",
      labels: taskData.labels,
      taskId,
      userId: userID,
      coverage_n:
        Number(req.body.coverage_n) > 0
          ? Number(req.body.coverage_n)
          : DEFAULT_COVERAGE_SAMPLES,
      use_representative_sampling:
        String(req.body.use_representative_sampling).toLowerCase() === "true",
    };

    void triggerSamplingInBackground({
      taskId,
      userID,
      payload: samplingPayload,
    });

    console.log("[uploadTaskBundle] Bundle upload completed successfully.");
    return res.status(200).json({
      success: true,
      message: "Task created successfully. Sampling has been queued.",
      taskId,
      fileName: uploadFilename,
      restFileName: uploadFilename,
      valFileName: valFilename,
      valSummary: {
        rows: valRows.length,
        columns: valColumns,
      },
      restSummary: {
        rows: restRowCount,
        columns: restColumns,
      },
      task: {
        _id: taskId,
        ...taskData,
      },
    });
  } catch (error: any) {
    console.error("[uploadTaskBundle] Unexpected error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload bundle",
    });
  }
}

// Helper function to read and parse CSV
async function readCsvFile(filePath: string): Promise<any[]> {
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");

    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep all values as strings
    });

    if (parseResult.errors.length > 0) {
      console.warn("CSV parsing warnings:", parseResult.errors);
    }

    return parseResult.data;
  } catch (error) {
    console.error("Error reading CSV file:", error);
    return [];
  }
}

export async function getCsvData(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    const { fileName } = req.params;
    const valFileName =
      typeof req.query.valFile === "string" ? req.query.valFile : fileName;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "Invalid - file name required",
      });
    }

    const response = {
      file: [] as any[],
      val_file: [] as any[],
      rest_file: [] as any[],
      guide_file: [] as any[],
      headers: [] as string[],
    };

    // Read all files using PapaParse
    const mainFile = fileExists(fileName);
    const valFile = valFileExists(valFileName);
    const restFile = restFileExists(fileName);
    const guideFile = guideFileExists(fileName);

    if (mainFile.exists) {
      response.file = await readCsvFile(mainFile.path);
      if (response.file.length > 0) {
        response.headers = Object.keys(response.file[0]);
      }
    }

    if (valFile.exists) {
      response.val_file = await readCsvFile(valFile.path);
      // If we only have val data, use its headers
      if (response.headers.length === 0 && response.val_file.length > 0) {
        response.headers = Object.keys(response.val_file[0]);
      }
    }

    if (restFile.exists) {
      response.rest_file = await readCsvFile(restFile.path);
      if (response.file.length === 0 && response.rest_file.length > 0) {
        response.file = response.rest_file;
        response.headers = Object.keys(response.rest_file[0]);
      }
    }

    if (guideFile.exists) {
      response.guide_file = await readCsvFile(guideFile.path);
      if (response.file.length === 0 && response.rest_file.length > 0) {
        response.file = response.rest_file;
        response.headers = Object.keys(response.rest_file[0]);
      }
    }

    if (response.file.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No files found",
      });
    }

    return res.status(200).json({
      success: true,
      data: response.file,
      val_data: response.val_file,
      rest_data: response.rest_file,
      guide_data: response.guide_file,
      headers: response.headers,
      fileName: fileName,
    });
  } catch (error: any) {
    console.error("Error retrieving file:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve file",
      error: error,
    });
  }
}

export async function checkValFileExists(req: AuthRequest, res: Response) {
  try {
    const { fileName } = req.params;
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "File name is required",
      });
    }

    const check = valFileExists(fileName);

    return res.status(200).json({
      success: true,
      exists: check.exists,
    });
  } catch (error: any) {
    console.error("Error checking validation file existence:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
}

async function deleteFileIfPresent(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function deleteTask(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;
    const { taskId } = req.params;

    if (!userID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - user not authenticated",
      });
    }

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required",
      });
    }

    if (!ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID format",
      });
    }

    const taskDetailsCollection = getCollection<Task>(TASKS_COLLECTION);
    const annotationCollection = getCollection<AnnotationItem>(
      ANNOTATION_COLLECTION,
    );
    const taskObjectId = new ObjectId(taskId);

    const task = await taskDetailsCollection.findOne({
      _id: taskObjectId as any,
      userID,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to delete it",
      });
    }

    const candidateFilenames = new Set<string>();
    if (task.file) candidateFilenames.add(task.file);
    if (task.restFile) candidateFilenames.add(task.restFile);
    if (task.valFile) candidateFilenames.add(task.valFile);

    const candidatePaths = new Set<string>();
    for (const filename of candidateFilenames) {
      candidatePaths.add(fileExists(filename).path);
      candidatePaths.add(restFileExists(filename).path);
      candidatePaths.add(valFileExists(filename).path);
      candidatePaths.add(guideFileExists(filename).path);
    }

    const deletedFiles: string[] = [];
    for (const filePath of candidatePaths) {
      const deleted = await deleteFileIfPresent(filePath);
      if (deleted) {
        deletedFiles.push(filePath);
      }
    }

    const [annotationDeleteResult, taskDeleteResult] = await Promise.all([
      annotationCollection.deleteMany({ taskId, createdBy: userID }),
      taskDetailsCollection.deleteOne({ _id: taskObjectId as any, userID }),
    ]);

    if (taskDeleteResult.deletedCount === 0) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete task record",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      deletedTaskId: taskId,
      deletedFilesCount: deletedFiles.length,
      deletedAnnotationsCount: annotationDeleteResult.deletedCount,
    });
  } catch (error: any) {
    console.error("Error deleting task:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete task",
    });
  }
}

export async function downloadAnnotationOutput(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  const filename = req.params.filename;
  if (!filename) return res.status(400).json({ success: false, message: "filename is required" });

  try {
    const safeName = path.basename(filename);
    const escapedName = safeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const storedPathPattern = new RegExp(`(?:^|[\\\\/])${escapedName}$`);
    const taskCollection = getCollection<Task>(TASKS_COLLECTION);
    const task = await taskCollection.findOne({
      userID: userId,
      $or: [
        { finalInferenceFile: storedPathPattern },
        { outputFile: storedPathPattern },
      ],
    });
    if (!task) return res.status(404).json({ success: false, message: "Output file not found" });
    const filePath = getAnnotationOutputPath(safeName);
    return res.download(filePath, safeName);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to download" });
  }
}

export async function uploadAnnotationOutput(req: AuthRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized - user not authenticated" });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file provided" });
  }
  const taskId = String(req.body.taskId ?? "");
  if (!ObjectId.isValid(taskId)) {
    return res.status(400).json({ success: false, message: "Valid taskId is required" });
  }

  try {
    const taskCollection = getCollection<Task>(TASKS_COLLECTION);
    const task = await taskCollection.findOne({ _id: new ObjectId(taskId) as any, userID: userId });
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });

    ensureAnnotationOutputsDir();
    const filename = `${annotationOutputPrefix(userId, taskId)}${generateUploadFilename(req.file.originalname)}`;
    const outputPath = getAnnotationOutputPath(filename);
    await fs.writeFile(outputPath, req.file.buffer);
    return res.status(200).json({ success: true, filePath: filename });
  } catch (error: any) {
    console.error("Error saving annotation output:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to save annotation output" });
  }
}

export async function createAutoLabelTask(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  if (!userID) {
    return res.status(401).json({ success: false, message: "Unauthorized - user not authenticated" });
  }

  try {
    const body = req.body as CreateAutoLabelTaskRequest;
    const safeOutputFile = path.basename(body.outputFile);
    if (!safeOutputFile.startsWith(annotationOutputOwnerPrefix(userID))) {
      return res.status(400).json({ success: false, message: "Output file does not belong to this user" });
    }
    const taskData: Omit<Task, "_id"> = {
      name: body.name,
      description: body.description,
      type: body.type,
      labels: body.labels,
      codebook: body.codebook,
      columns: body.columns,
      file: body.file,
      outputFile: safeOutputFile,
      inputFileName: body.inputFileName,
      modelName: body.modelName,
      labelColumn: body.labelColumn,
      taskJsonRaw: body.taskJsonRaw,
      labelsJsonRaw: body.labelsJsonRaw,
      userID,
      status: "auto_label_complete",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const collection = getCollection<Task>(TASKS_COLLECTION);
    const result = await collection.insertOne(taskData);
    return res.status(201).json({ success: true, taskId: result.insertedId.toString() });
  } catch (error: any) {
    console.error("Error creating auto-label task:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to create auto-label task" });
  }
}

export async function startAutoLabelJob(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  if (!userID) return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    const body = req.body as StartAutoLabelJobRequest;
    const taskData: Omit<Task, "_id"> = {
      name: body.name,
      description: body.description,
      type: body.type,
      labels: body.labels,
      codebook: body.codebook,
      columns: [],
      file: body.filePath,
      inputFileName: body.inputFileName,
      modelName: body.modelName,
      labelColumn: body.textColumn,
      taskJsonRaw: body.taskJsonRaw,
      labelsJsonRaw: body.labelsJsonRaw,
      userID,
      status: "auto_labeling",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const collection = getCollection<Task>(TASKS_COLLECTION);
    const result = await collection.insertOne(taskData);
    const taskId = result.insertedId.toString();

    const userInput = Array.isArray(body.codebook) ? body.codebook.join("\n") : "";
    void axios.post(
      `${ML_BASE_URL}/inference/auto-label`,
      {
        file_path: body.filePath,
        text_column: body.textColumn,
        labels: body.labels,
        task_definition: body.description,
        model_name: body.modelName,
        user_input: userInput || null,
        task_type: body.type,
        job_id: taskId,
      },
      { timeout: 3_600_000 },
    ).catch((err: Error) => {
      console.error("[startAutoLabelJob] Python job error:", err.message);
    });

    return res.status(201).json({ success: true, taskId });
  } catch (error: any) {
    console.error("[startAutoLabelJob] Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to start auto-label job" });
  }
}

// Final step of codebook development: run inference over the task's full
// unlabeled dataset (d_all / restFile) using the latest codebook as the prompt,
// extracting a label for every row. Runs on the EXISTING task (no new task
// record, no status change); the client polls the shared auto-label progress
// endpoint (keyed by taskId) for completion and the labeled rows.
export async function startFinalInference(req: AuthRequest, res: Response) {
  const userID = req.user?.userId;
  if (!userID) return res.status(401).json({ success: false, message: "Unauthorized" });

  const { taskId, codebook } = req.body as { taskId?: string; codebook?: string[] };
  if (!taskId) return res.status(400).json({ success: false, message: "taskId is required" });

  try {
    const collection = getCollection<Task>(TASKS_COLLECTION);
    let taskQueryId: ObjectId | string = taskId;
    if (ObjectId.isValid(taskId)) taskQueryId = new ObjectId(taskId);
    const task = await collection.findOne({ _id: taskQueryId as any, userID });

    if (!task) return res.status(404).json({ success: false, message: "Task not found" });
    if (!task.restFile) {
      return res.status(400).json({
        success: false,
        message: "Task has no unlabeled dataset (d_all) to run inference on",
      });
    }

    const finalCodebook = Array.isArray(codebook) ? codebook : task.codebook ?? [];
    const userInput = finalCodebook.join("\n") || null;
    const textColumn = task.columns?.[0] || "text";

    // Fire-and-forget: pybackend reads d_all from shared_uploads/ and runs the
    // job in the background keyed by job_id === taskId.
    void axios
      .post(
        `${ML_BASE_URL}/inference/auto-label`,
        {
          file_path: task.restFile,
          text_column: textColumn,
          labels: task.labels,
          task_definition: task.description,
          model_name: task.modelName,
          user_input: userInput,
          task_type: task.type,
          job_id: taskId,
        },
        { timeout: 3_600_000 },
      )
      .catch((err: Error) => {
        console.error("[startFinalInference] Python job error:", err.message);
      });

    return res.status(200).json({ success: true, taskId });
  } catch (error: any) {
    console.error("[startFinalInference] Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Failed to start final inference" });
  }
}

export async function getAutoLabelProgress(req: AuthRequest, res: Response) {
  const { taskId } = req.params;
  try {
    const { data } = await axios.get(
      `${ML_BASE_URL}/inference/auto-label/progress/${taskId}`,
      { timeout: 5_000 },
    );
    return res.json(data);
  } catch {
    return res.json({ completed: 0, total: 0, done: false });
  }
}

export async function completeAutoLabel(req: AuthRequest, res: Response) {
  try {
    const userID = req.user?.userId;
    const { taskId } = req.params;
    const { outputFile } = req.body as { outputFile: string };
    if (!userID) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!ObjectId.isValid(taskId)) return res.status(400).json({ success: false, message: "Invalid task ID" });
    const safeOutputFile = path.basename(outputFile);
    if (!safeOutputFile.startsWith(annotationOutputPrefix(userID, taskId))) {
      return res.status(400).json({ success: false, message: "Output file does not belong to this task" });
    }
    const collection = getCollection<Task>(TASKS_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(taskId) as any, userID },
      { $set: { status: "auto_label_complete", outputFile: safeOutputFile, updatedAt: new Date().toISOString() } },
    );
    if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "Task not found" });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

function annotationOutputOwnerPrefix(userID: string) {
  return `${Buffer.from(userID).toString("base64url")}-`;
}

function annotationOutputPrefix(userID: string, taskId: string) {
  return `${annotationOutputOwnerPrefix(userID)}${taskId}-`;
}
