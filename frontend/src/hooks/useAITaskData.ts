import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getTaskById } from "../services/tasks.service";
import { getTaskAnnotations } from "../services/annotations.service";
import { Task } from "@common/types/tasks";
import { AnnotationItem } from "@common/types/annotations";

interface NavProps {
  task?: Task;
}

export const useAITaskData = () => {
  const { taskId } = useParams<{ taskId?: string }>();
  const location = useLocation();
  const navProps = location.state as NavProps | undefined;

  const [loading, setLoading] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [guideAnnotations, setGuideAnnotations] = useState<AnnotationItem[]>([]);

  const fetchData = useCallback(async () => {
    const effectiveTaskId = taskId || navProps?.task?._id;
    if (!effectiveTaskId) {
      return;
    }

    setLoading(true);
    try {
      const taskResponse = await getTaskById(effectiveTaskId);
      if (taskResponse.task) {
        setTask(taskResponse.task);
      }

      const annotationsResponse = await getTaskAnnotations(effectiveTaskId);
      if (annotationsResponse.success) {
        const sorted = (annotationsResponse.annotations || []).slice().sort((a, b) => {
          const aId = Number(a.sampleId) || 0;
          const bId = Number(b.sampleId) || 0;
          return aId - bId;
        });
        setGuideAnnotations(sorted);
      } else {
        setGuideAnnotations([]);
      }
    } catch (error) {
      console.error("Failed to fetch AI task data:", error);
    } finally {
      setLoading(false);
    }
  }, [taskId, navProps?.task]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    loading,
    task,
    guideAnnotations,
    refreshTaskData: fetchData,
  };
};
