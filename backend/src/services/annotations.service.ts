import { Request, Response } from "express";
import { AnnotationItem, AddAnnotationRequest, UpdateValAnnotationRequest } from "@common/types/annotations";
import type { Task } from "@common/types/tasks";
import { ObjectId } from "mongodb";
import { getCollection } from "./database.service";
import { AuthRequest } from "./tasks.service";
import dotenv from "dotenv";
dotenv.config();

const ANNOTATION_COLLECTION = process.env.ANNOTATION_COLLECTION_NAME || "AnnotationDetails";

interface AnnotationValidation {
    valid: boolean;
    errors: string[];
}

function validateAnnotationPayload(payload: AddAnnotationRequest): AnnotationValidation {
    const errors: string[] = [];
    if (!payload.taskId) {
        errors.push("Task ID is required");
    }
    if (!payload.annotationSampleRow || Object.keys(payload.annotationSampleRow).length < 1) {
        errors.push("Sample empty/not found");
    }
    if (!payload.labels || payload.labels.length < 1) {
        errors.push("Labels empty");
    }
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

export async function addAnnotation(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized - user not authenticated"
        });
    }

    const payload: AddAnnotationRequest = {
        taskId: req.body.taskId,
        sampleId: req.body.sampleId,
        annotationSampleRow: req.body.annotationSampleRow,
        labels: req.body.labels
    };

    const validation = validateAnnotationPayload(payload);
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            message: `Validation failed: ${validation.errors.join(", ")}`
        });
    }

    try {
        const collection = getCollection<AnnotationItem>(ANNOTATION_COLLECTION);

        const newAnnotation: AnnotationItem = {
            taskId: payload.taskId,
            sampleId: req.body.sampleId,
            sampleContent: payload.annotationSampleRow,
            labels: payload.labels,
            source: "val",
            aiAnnotation: null,
            createdBy: userId,
            createdAt: new Date().toISOString()
        };

        const result = await collection.insertOne(newAnnotation);

        return res.status(201).json({
            success: true,
            message: "Annotation saved successfully",
            annotationId: result.insertedId.toString()
        });
    } catch (error: any) {
        console.error("Error saving annotation:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to save annotation"
        });
    }
}

export async function updateGuideAnnotation(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized - user not authenticated"
        });
    }

    const payload = req.body as any; // Cast to UpdateGuideAnnotationRequest

    if (!payload.taskId || !payload.sampleId) {
        return res.status(400).json({
            success: false,
            message: "taskId and sampleId are required to update guide annotations"
        });
    }

    try {
        const collection = getCollection<AnnotationItem>(ANNOTATION_COLLECTION);
        // Find existing annotation for this user and sample
        const existing = await collection.findOne({
            taskId: payload.taskId,
            sampleId: payload.sampleId,
            createdBy: userId,
            source: "guide"
        });

        if (existing) {
            const task = await getCollection<Task>(process.env.TASKS_COLLECTION_NAME || "TaskDetails")
                .findOne({ _id: new ObjectId(payload.taskId) as any, userID: userId });
            if (!task) return res.status(404).json({ success: false, message: "Task not found" });
            if (task.samplingVersion === 2) {
                const labels = payload.labels;
                const allowed = new Set(task.labels.map((label) => label.name));
                if (!Array.isArray(labels) || !labels.length || new Set(labels).size !== labels.length ||
                    labels.some((label) => typeof label !== "string" || !allowed.has(label)) ||
                    (task.type === "Single-class" && labels.length !== 1)) {
                    return res.status(400).json({ success: false, message: "Choose a valid final label set for this guide example" });
                }
                if (typeof payload.aiAnnotation?.isCorrect !== "boolean") {
                    return res.status(400).json({ success: false, message: "Confirm the prediction before continuing" });
                }
            }
            const updateDoc: any = { updatedAt: new Date().toISOString() };
            if (payload.labels !== undefined) updateDoc.labels = payload.labels;
            if (payload.aiAnnotation !== undefined) updateDoc.aiAnnotation = payload.aiAnnotation;

            await collection.updateOne(
                { _id: existing._id },
                { $set: updateDoc }
            );

            return res.status(200).json({
                success: true,
                message: "Guide annotation updated successfully",
                annotationId: existing._id?.toString()
            });
        } else {
            return res.status(404).json({
                success: false,
                message: "Guide annotation not found"
            });
        }
    } catch (error: any) {
        console.error("Error updating guide annotation:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update guide annotation"
        });
    }
}

export async function getTaskAnnotations(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized - user not authenticated"
        });
    }
    const { taskId } = req.params;
    if (!taskId) {
        return res.status(400).json({
            success: false,
            message: "Invalid - task ID cannot be empty"
        });
    }

    try {
        const collection = getCollection<AnnotationItem>(ANNOTATION_COLLECTION);
        const result = await collection.find({
            "taskId": taskId,
            "createdBy": userId,
            "source": "guide"
        }).toArray();

        if (!result || result.length === 0) {
            return res.status(200).json({
                success: true,
                taskId: taskId,
                annotations: [],
                message: "No annotations found for this task"
            });
        }
        return res.status(200).json({
            success: true,
            taskId: taskId,
            annotations: result,
            message: `Annotations found for ${taskId}`
        });
    } catch (error: any) {
        console.error(`Error fetching annotations for task (${taskId}):, ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch annotations"
        });
    }
}
export async function updateValAnnotation(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized - user not authenticated"
        });
    }

    const { annotationId, labels } = req.body as UpdateValAnnotationRequest;

    if (!annotationId || !labels || labels.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Annotation ID and labels are required"
        });
    }

    try {
        const collection = getCollection<AnnotationItem>(ANNOTATION_COLLECTION);

        const result = await collection.updateOne(
            { _id: new ObjectId(annotationId) as any, createdBy: userId, source: "val" },
            { $set: { labels, updatedAt: new Date().toISOString() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Annotation not found or you don't have permission to update it"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Annotation updated successfully"
        });
    } catch (error: any) {
        console.error("Error updating annotation:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update annotation"
        });
    }
}
