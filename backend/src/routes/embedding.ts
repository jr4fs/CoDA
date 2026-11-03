import { Router, Response } from "express";
import axios from "axios";
import { AuthRequest, authenticateToken } from "../middleware/auth.middleware";
import { EmbedDatasetRequest } from "@common/types/embedding";
import { ObjectId } from "mongodb";
import { getCollection } from "../services/database.service";
import type { Task } from "@common/types/tasks";

const router = Router();
const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

//Adding user authentication, making this a protected route
router.use(authenticateToken);

router.post("/sample", async (req: AuthRequest, res: Response) => {
    try {
        const payload: EmbedDatasetRequest = req.body;
        if (!ObjectId.isValid(payload.taskId || "")) return res.status(400).json({ message: "A valid task ID is required" });
        const task = await getCollection<Task>(process.env.TASKS_COLLECTION_NAME || "TaskDetails").findOne({ _id: new ObjectId(payload.taskId) as any, userID: req.user!.userId });
        if (!task) return res.status(404).json({ message: "Task not found" });
        if (task.evaluationBuild) return res.status(409).json({ message: "Use the evaluation builder for this task; its evaluation records must remain excluded from guide sampling." });
        payload.file_path = task.file;
        payload.userId = task.userID;
        const { data } = await axios.post(`${ML_BASE_URL}/embedding/sample`, payload);
        res.json(data);
    } catch (error: any) {
        const status = error.response?.status ?? 500;
        const error_msg = error.response?.data?.detail ?? "Sampling request failed";
        res.status(status).json({ success: false, message: error_msg });
    }
});

export default router;
