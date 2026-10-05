import { Router } from "express";
import {
  createTask,
  getUserTasks,
  getTaskByID,
  getDataAnalysisData,
  uploadTaskFile,
  getCsvData,
  checkValFileExists,
  saveTaskCodebook,
  exportCodebookSnapshot,
  uploadTaskBundle,
  deleteTask,
  createAutoLabelTask,
  uploadAnnotationOutput,
  downloadAnnotationOutput,
  startAutoLabelJob,
  getAutoLabelProgress,
  completeAutoLabel,
  startFinalInference,
  markCodebookComplete,
  saveFinalInferenceResult,
} from "../services/tasks.service";
import { uploadCSV, uploadBundle } from "../utils/fileUpload";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

//Adding user authentication, making this a protected route
router.use(authenticateToken);

// Upload CSV file (returns filename to use in task creation)
// Expects form-data with field name "file"
router.post("/upload", uploadCSV.single("file"), uploadTaskFile);

// Upload D_val, D_all, task JSON, and labels JSON
router.post(
  "/upload-bundle",
  uploadBundle.fields([
    { name: "d_val", maxCount: 1 },
    { name: "d_all", maxCount: 1 },
    { name: "labels_json", maxCount: 1 },
    { name: "task_json", maxCount: 1 },
  ]),
  uploadTaskBundle,
);

// Unified task creation endpoint (upload + create + async sampling kickoff)
router.post(
  "/create",
  uploadBundle.fields([
    { name: "d_val", maxCount: 1 },
    { name: "d_all", maxCount: 1 },
    { name: "labels_json", maxCount: 1 },
    { name: "task_json", maxCount: 1 },
  ]),
  uploadTaskBundle,
);

// Create a new task
router.post("/createTask", createTask);

// Upload a labeled output CSV to annotation_outputs/
router.post("/upload-output", uploadCSV.single("file"), uploadAnnotationOutput);

// Download a labeled output CSV from annotation_outputs/
router.get("/download-output/:filename", downloadAnnotationOutput);

// Create an auto-label task record (stores metadata + output file reference)
router.post("/createAutoLabelTask", createAutoLabelTask);

// Save codebook for a task
router.post("/saveCodebook", saveTaskCodebook);
// Export codebook + last prompt to server filesystem
router.post("/exportCodebook", exportCodebookSnapshot);

// Get all tasks for a user
router.get("/getTasks", getUserTasks);

// Get a single task's details
router.get("/getTask/:taskId", getTaskByID);

// Load the persisted labeled dataset used by the Data Analysis tab.
router.get("/data-analysis/:taskId", getDataAnalysisData);

// Delete a task and associated artifacts
router.delete("/delete/:taskId", deleteTask);

// Get CSV file when reloading a task
router.get("/csv/:fileName", getCsvData);

// Check if validation file exists
router.get("/checkValFile/:fileName", checkValFileExists);

// Backend-driven auto-label job endpoints
router.post("/auto-label", startAutoLabelJob);
router.get("/auto-label/progress/:taskId", getAutoLabelProgress);
router.patch("/auto-label/complete/:taskId", completeAutoLabel);

// Run inference over d_all with the latest codebook (final codebook-dev step).
// Progress is polled via the shared /auto-label/progress/:taskId endpoint.
router.post("/final-inference", startFinalInference);
// Persist the final-inference output file path (so it survives a reload).
router.post("/final-inference/save", saveFinalInferenceResult);

// Mark a codebook-development task complete (locks it read-only).
router.post("/complete", markCodebookComplete);

export default router;
