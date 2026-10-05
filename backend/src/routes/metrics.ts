import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  generateSampleMetrics,
  generateMetadataMetrics,
  generateBatchMetrics,
  runValEvaluation,
  cancelValEvaluation,
  getValEvalProgress,
  getModelPerformance,
  downloadMetricsFile,
} from "../services/metrics.service";

const router = Router();

router.use(authenticateToken);

router.post("/samples", generateSampleMetrics);
router.post("/metadata", generateMetadataMetrics);
router.post("/batches", generateBatchMetrics);
router.post("/val-eval", runValEvaluation);
router.post("/val-eval/cancel", cancelValEvaluation);
router.get("/val-eval/progress/:taskId", getValEvalProgress);
router.get("/model-performance/:taskId", getModelPerformance);
router.get("/download/:filename", downloadMetricsFile);

export default router;
