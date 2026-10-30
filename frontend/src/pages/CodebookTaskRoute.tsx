import { Alert, Button, Center, Loader } from "@mantine/core";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { Task } from "@common/types/tasks";
import { getTaskById } from "../services/tasks.service";
import AnnotationPage from "./AIAnnotationPage";

/** Gate before mounting review hooks, which otherwise start baseline evaluation. */
export default function CodebookTaskRoute() {
  const { taskId } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setTask(null);
    setError(false);
    if (taskId)
      getTaskById(taskId)
        .then((result) => {
          if (!cancelled) {
            if (!result.task) setError(true);
            else setTask(result.task);
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [taskId]);
  if (!taskId) return <AnnotationPage />;
  if (error)
    return (
      <Alert color="red" m="lg">
        Unable to load task.
        <Button variant="subtle" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Alert>
    );
  if (!task)
    return (
      <Center h="80vh">
        <Loader />
      </Center>
    );
  if (task.evaluationBuild && task.evaluationBuild.phase !== "frozen")
    return <Navigate to={`/evaluation-builder/${taskId}`} replace />;
  return <AnnotationPage key={taskId} />;
}
