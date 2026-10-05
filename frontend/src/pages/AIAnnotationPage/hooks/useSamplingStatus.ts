import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../../lib/toast";
import { getTaskById } from "../../../services/tasks.service";
import { SAMPLING_ERROR_MESSAGE } from "../constants";
import { SamplingStatus } from "../types";

interface UseSamplingStatusArgs {
  taskId?: string;
  taskStatus?: string;
  refreshTaskData: () => Promise<void>;
}

export function useSamplingStatus({ taskId, taskStatus, refreshTaskData }: UseSamplingStatusArgs) {
  const [polledStatus, setPolledStatus] = useState<SamplingStatus>(null);
  const [samplingErrorMsg, setSamplingErrorMsg] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const samplingNotifiedRef = useRef(false);

  useEffect(() => {
    if (!taskId) return;

    const currentStatus =
      polledStatus ??
      (taskStatus as "sampling_pending" | "ready" | "sampling_error" | undefined);

    if (currentStatus === "ready" || currentStatus === "sampling_error") return;

    let mounted = true;

    const pollStatus = async () => {
      try {
        const response = await getTaskById(taskId);
        const latestStatus = (response.task?.status ?? "sampling_pending") as
          | "sampling_pending"
          | "ready"
          | "sampling_error";

        if (!mounted) return;
        setPolledStatus(latestStatus);
        const position = response.task?.samplingQueuePosition;
        setQueuePosition(typeof position === "number" ? position : null);

        if (latestStatus === "ready") {
          await refreshTaskData();
          window.dispatchEvent(new Event("tasks:updated"));
          if (!samplingNotifiedRef.current) {
            toast.success("Sampling completed. Task is ready.");
            samplingNotifiedRef.current = true;
          }
          return;
        }

        if (latestStatus === "sampling_error") {
          setSamplingErrorMsg(SAMPLING_ERROR_MESSAGE);
          if (!samplingNotifiedRef.current) {
            toast.error("Sampling failed for this task.");
            samplingNotifiedRef.current = true;
          }
        }
      } catch (error) {
        console.error("Failed to poll task status:", error);
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(() => void pollStatus(), 15_000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [taskId, taskStatus, polledStatus, refreshTaskData]);

  const effectiveStatus = useMemo(() => {
    return (
      polledStatus ??
      (taskStatus as "sampling_pending" | "ready" | "sampling_error" | undefined)
    );
  }, [polledStatus, taskStatus]);

  return {
    samplingErrorMsg,
    effectiveStatus,
    queuePosition,
  };
}
