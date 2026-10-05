import {
  AutoLabelProgressResponse,
  CreateAutoLabelTaskRequest,
  CreateAutoLabelTaskResponse,
  CreateTaskRequest,
  CreateTaskResponse,
  StartAutoLabelJobRequest,
  StartAutoLabelJobResponse,
  TaskQueryResponse,
  UploadFileResponse,
  UpdateTaskRequest,
  Task,
} from "@common/types/tasks";
import { apiClient } from "../lib/apiClient";

export async function createTask(
  payload: CreateTaskRequest | UpdateTaskRequest,
): Promise<CreateTaskResponse> {
  const { data } = await apiClient.post<CreateTaskResponse>(
    "/api/tasks/createTask",
    payload,
  );
  return data;
}

export async function getUserTasks(): Promise<TaskQueryResponse> {
  const { data } =
    await apiClient.get<TaskQueryResponse>(`/api/tasks/getTasks`);
  return data;
}

export interface DataAnalysisDataResponse {
  success: boolean;
  status: "ready" | "pending";
  rows: Array<Record<string, string>>;
  headers: string[];
}

export async function getDataAnalysisData(
  taskId: string,
): Promise<DataAnalysisDataResponse> {
  const { data } = await apiClient.get<DataAnalysisDataResponse>(
    `/api/tasks/data-analysis/${encodeURIComponent(taskId)}`,
  );
  return data;
}

export async function saveTaskCodebook(taskId: string, codebook: string[]) {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    "/api/tasks/saveCodebook",
    { taskId, codebook },
  );
  return data;
}

export async function exportCodebookSnapshot(
  taskId: string,
  codebook: string[],
  lastPrompt: string,
) {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    "/api/tasks/exportCodebook",
    { taskId, codebook, lastPrompt },
  );
  return data;
}

export async function uploadFile(file: File): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<UploadFileResponse>(
    "/api/tasks/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  console.log(data);
  return data;
}

export async function uploadTaskBundle(params: {
  dValFile: File;
  dAllFile: File;
  taskJsonFile?: File;
  taskName?: string;
  taskDescription?: string;
  taskType?: "Multiclass" | "Single-class";
  labelsJsonFile: File;
  textColumn: string;
  labelColumn: string;
  modelName: string;
  coverageN?: number;
  useRepresentativeSampling?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<{
  success: boolean;
  message?: string;
  taskId?: string;
  fileName?: string;
  restFileName?: string;
  valFileName?: string;
  valSummary?: {
    rows: number;
    columns: string[];
  };
  restSummary?: {
    rows: number;
    columns: string[];
  };
  task?: Task;
}> {
  const formData = new FormData();
  formData.append("d_val", params.dValFile);

  // Gzip the large unlabeled CSV in the browser to cut upload time (text CSVs
  // compress ~5-10x). The server decompresses when d_all_gzip=true. Falls back to
  // the raw file if the browser lacks CompressionStream.
  let dAllPart: Blob = params.dAllFile;
  let dAllGzip = false;
  if (typeof CompressionStream !== "undefined") {
    try {
      const compressed = params.dAllFile.stream().pipeThrough(new CompressionStream("gzip"));
      dAllPart = await new Response(compressed).blob();
      dAllGzip = true;
    } catch {
      dAllPart = params.dAllFile;
      dAllGzip = false;
    }
  }
  // Keep the original .csv filename so the server derives the stored name correctly.
  formData.append("d_all", dAllPart, params.dAllFile.name);
  formData.append("d_all_gzip", String(dAllGzip));

  if (params.taskJsonFile) {
    formData.append("task_json", params.taskJsonFile);
  }
  if (params.taskName) {
    formData.append("task_name", params.taskName);
  }
  if (params.taskDescription) {
    formData.append("task_description", params.taskDescription);
  }
  if (params.taskType) {
    formData.append("task_type", params.taskType);
  }
  formData.append("labels_json", params.labelsJsonFile);
  formData.append("text_column", String(params.textColumn));
  formData.append("label_column", String(params.labelColumn));
  formData.append("model_name", String(params.modelName));
  formData.append(
    "coverage_n",
    String(
      params.coverageN ??
        (Number(import.meta.env.VITE_DEFAULT_COVERAGE_SAMPLES) || 15),
    ),
  );
  formData.append(
    "use_representative_sampling",
    String(Boolean(params.useRepresentativeSampling)),
  );

  const { data } = await apiClient.post("/api/tasks/create", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (event) => {
      if (params.onProgress && event.total) {
        params.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function getTaskById(taskId: string) {
  const { data } = await apiClient.get(`/api/tasks/getTask/${taskId}`);
  return data;
}

export async function getCsvData(fileName: string, valFileName?: string) {
  const valQuery = valFileName
    ? `?valFile=${encodeURIComponent(valFileName)}`
    : "";
  const { data } = await apiClient.get(
    `/api/tasks/csv/${encodeURIComponent(fileName)}${valQuery}`,
  );
  return data;
}

export async function checkValFileExists(fileName: string): Promise<boolean> {
  const { data } = await apiClient.get<{ success: boolean; exists: boolean }>(
    `/api/tasks/checkValFile/${encodeURIComponent(fileName)}`,
  );
  return data.exists;
}

export async function downloadAnnotationOutputFile(filename: string): Promise<Blob> {
  const response = await apiClient.get(
    `/api/tasks/download-output/${encodeURIComponent(filename)}`,
    { responseType: "blob" },
  );
  return response.data as Blob;
}

export async function uploadOutputFile(file: File, taskId: string): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("taskId", taskId);
  const { data } = await apiClient.post<UploadFileResponse>(
    "/api/tasks/upload-output",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function createAutoLabelTask(
  payload: CreateAutoLabelTaskRequest,
): Promise<CreateAutoLabelTaskResponse> {
  const { data } = await apiClient.post<CreateAutoLabelTaskResponse>(
    "/api/tasks/createAutoLabelTask",
    payload,
  );
  return data;
}

export async function startAutoLabelJob(
  payload: StartAutoLabelJobRequest,
): Promise<StartAutoLabelJobResponse> {
  const { data } = await apiClient.post<StartAutoLabelJobResponse>(
    "/api/tasks/auto-label",
    payload,
  );
  return data;
}

export async function getAutoLabelProgress(
  taskId: string,
): Promise<AutoLabelProgressResponse> {
  const { data } = await apiClient.get<AutoLabelProgressResponse>(
    `/api/tasks/auto-label/progress/${taskId}`,
    { timeout: 5_000 },
  );
  return data;
}

// Run inference over the task's full unlabeled dataset (d_all) with the latest
// codebook. Poll getAutoLabelProgress(taskId) for completion + labeled rows.
export async function startFinalInference(
  taskId: string,
  codebook: string[],
): Promise<{ success: boolean; taskId?: string; message?: string }> {
  const { data } = await apiClient.post<{
    success: boolean;
    taskId?: string;
    message?: string;
  }>("/api/tasks/final-inference", { taskId, codebook }, { timeout: 60_000 });
  return data;
}

// Persist the final-inference output file path so it survives a reload.
export async function saveFinalInferenceResult(
  taskId: string,
  outputFile: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    "/api/tasks/final-inference/save",
    { taskId, outputFile },
  );
  return data;
}

// Mark a codebook-development task complete (locks it read-only). Optionally
// persists the generated metrics filenames so the completion popup's download
// buttons still work after a reload.
export async function markCodebookComplete(
  taskId: string,
  metricsFiles?: { sample?: string; batch?: string; metadata?: string },
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    "/api/tasks/complete",
    { taskId, metricsFiles },
  );
  return data;
}

export async function completeAutoLabelTask(
  taskId: string,
  outputFile: string,
): Promise<{ success: boolean }> {
  const { data } = await apiClient.patch<{ success: boolean }>(
    `/api/tasks/auto-label/complete/${taskId}`,
    { outputFile },
  );
  return data;
}

export async function deleteTaskById(taskId: string): Promise<{
  success: boolean;
  message?: string;
  deletedTaskId?: string;
  deletedFilesCount?: number;
  deletedAnnotationsCount?: number;
}> {
  const { data } = await apiClient.delete(`/api/tasks/delete/${taskId}`);
  return data;
}
