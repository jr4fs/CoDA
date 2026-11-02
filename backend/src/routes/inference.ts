import { Router, Response } from "express";
import axios from "axios";
import { AuthRequest, authenticateToken } from "../middleware/auth.middleware";
import { InferenceRequest, BatchInferenceRequest } from "@common/types/inference";
import { RuleSynthesisRequest } from "@common/types/ruleSynthesis";

const router = Router();
const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

//Adding user authentication, making this a protected route
router.use(authenticateToken);

router.get("/models", async (_req: AuthRequest, res: Response) => {
    try {
        const { data } = await axios.get(`${ML_BASE_URL}/inference/models`);
        res.json(data);
    } catch (error: any) {
        res.status(error.response?.status ?? 500).json({ success: false, message: "Could not load available models" });
    }
});

router.post("/", async (req: AuthRequest, res: Response) => {
    try {
        const payload: InferenceRequest = req.body;
        const { data } = await axios.post(`${ML_BASE_URL}/inference/`, payload);
        res.json(data);
    } catch (error: any) {
        const status = error.response?.status ?? 500;
        const error_msg = error.response?.data?.detail ?? "Inference request failed";
        res.status(status).json({ success: false, message: error_msg });
    }
});

router.post("/batch-inference", async (req: AuthRequest, res: Response) => {
    try {
        const payload: BatchInferenceRequest[] = req.body;
        const { data } = await axios.post(`${ML_BASE_URL}/inference/batch-inference`, payload);
        res.json(data);
    } catch (error: any) {
        const status = error.response?.status ?? 500;
        const error_msg = error.response?.data?.detail ?? "Batch inference request failed";
        res.status(status).json({ success: false, message: error_msg });
    }
});

router.post("/rule-synthesis", async (req: AuthRequest, res: Response) => {
    try {
        const payload: RuleSynthesisRequest = req.body;
        const { data } = await axios.post(`${ML_BASE_URL}/inference/rule-synthesis`, payload);
        res.json(data);
    } catch (error: any) {
        const status = error.response?.status ?? 500;
        const error_msg = error.response?.data?.detail ?? "Rule synthesis request failed";
        res.status(status).json({ success: false, message: error_msg });
    }
});

export default router;
