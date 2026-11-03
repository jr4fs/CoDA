// hooks/useTaskData.ts
import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getTaskById, getCsvData } from "../services/tasks.service";
import { getTaskAnnotations } from "../services/annotations.service";
import { Task } from "@common/types/tasks";
import { AnnotationItem } from "@common/types/annotations";

interface CsvRow {
  [key: string]: string;
}

interface NavProps {
  csvData?: CsvRow[];
  headers?: string[];
  fileName?: string;
  task?: Task;
  subsampledCsv?: CsvRow[];
  restData?: CsvRow[];
  guideData?: CsvRow[];
  annotations?: AnnotationItem[];
}

export const useTaskData = () => {
  const { taskId } = useParams<{ taskId?: string }>();
  const location = useLocation();
  const navProps = location.state as NavProps | undefined;

  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [subsampledData, setSubsampledData] = useState<CsvRow[]>([]);
  const [restData, setRestData] = useState<CsvRow[]>([]);
  const [guideData, setGuideData] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);

  const fetchData = useCallback(async () => {
      const hasNavState = Boolean(
        navProps?.csvData ||
        navProps?.headers ||
        navProps?.fileName ||
        navProps?.task ||
        navProps?.subsampledCsv ||
        navProps?.restData ||
        navProps?.guideData ||
        navProps?.annotations,
      );

      if (hasNavState) {
        console.log("Using navigation state data");
        if (navProps?.csvData) {
          setCsvData(navProps.csvData);
        }
        if (navProps?.headers) {
          setHeaders(navProps.headers);
        }
        if (navProps?.fileName) {
          setFileName(navProps.fileName);
        }
        if (navProps?.subsampledCsv) {
          setSubsampledData(navProps.subsampledCsv);
        }
        if (navProps?.restData) {
          setRestData(navProps.restData);
        }
        if (navProps?.guideData) {
          setGuideData(navProps.guideData);
        }
        if (navProps?.task) {
          setTask(navProps.task);
        }
        if (navProps?.annotations) {
          setAnnotations(navProps.annotations);
        }
      }

      const effectiveTaskId = taskId || navProps?.task?._id;
      if (!effectiveTaskId) {
        if (!hasNavState) {
          console.log("No taskId and no navProps - empty state");
        }
        return;
      }

      const needsTask = !navProps?.task;
      const needsCsv = !navProps?.csvData || !navProps?.headers;
      const needsAnnotations = !navProps?.annotations;

      if (!needsTask && !needsCsv && !needsAnnotations) {
        return;
      }

      console.log("Fetching task from backend:", effectiveTaskId);
      setLoading(true);
      try {
        const taskResponse = needsTask
          ? await getTaskById(effectiveTaskId)
          : { task: navProps?.task };

        if (needsTask && taskResponse.task) {
          setTask(taskResponse.task);
        }

        const taskFile = taskResponse.task?.file || navProps?.fileName;
        const taskValFile = taskResponse.task?.valFile;
        if (taskFile && needsCsv) {
          const csvResponse = await getCsvData(taskFile, taskValFile);
          setCsvData((prev) => (prev.length ? prev : csvResponse.data || []));
          setSubsampledData((prev) =>
            prev.length ? prev : csvResponse.guide_data || [],
          );
          setRestData((prev) =>
            prev.length ? prev : csvResponse.rest_data || [],
          );
          setGuideData((prev) =>
            prev.length ? prev : csvResponse.guide_data || [],
          );
          setHeaders((prev) =>
            prev.length ? prev : csvResponse.headers || [],
          );
          setFileName(taskFile);
        }

        if (needsAnnotations) {
          const annotationsResponse = await getTaskAnnotations(effectiveTaskId);
          if (annotationsResponse.success) {
            setAnnotations(annotationsResponse.annotations || []);
          }
        }
      } catch (error) {
        console.error("Failed to fetch task data:", error);
      } finally {
        setLoading(false);
      }
    }, [taskId, navProps]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    loading,
    csvData,
    subsampledData,
    restData,
    guideData,
    headers,
    fileName,
    task,
    annotations,
    refreshTaskData: fetchData,
  };
};
