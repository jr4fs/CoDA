import { http, HttpResponse } from "msw";
import { demoAnalysisRows, demoAnnotations, demoTask } from "./demoData";

// Wildcard origin so the demo's mocked endpoints match regardless of where it is
// served from: localhost in dev, GitHub Pages, or the deployed same-origin build
// (where apiClient uses a relative baseURL). MSW resolves "*" against any origin.
const API = "*";

// Mock predictions for the demo's health-support notes. Keyword branches make
// the six sample notes representative while keeping unseen notes predictable.
type DemoPrediction = { label: string[]; span_text: string; reason: string };

function demoPrediction(text: string): DemoPrediction {
  const t = text.toLowerCase();
  if (/(refer|referral|clinic|provider|intake appointment)/.test(t)) {
    return {
      label: ["health referral"],
      span_text: text.match(/refer\w*|clinic|provider|intake appointment/i)?.[0] ?? text.slice(0, 60),
      reason: "The note describes connecting the youth with a health or counseling service.",
    };
  }
  if (/(anxiety|sleep|coping|mood|wellbeing|well-being|breathing|stressors)/.test(t)) {
    return {
      label: ["health discussion"],
      span_text: text.match(/anxiety|sleep|coping|mood|wellbeing|well-being|breathing|stressors/i)?.[0] ?? text.slice(0, 60),
      reason: "The note discusses health, emotional wellbeing, or coping without describing a referral.",
    };
  }
  return {
    label: ["neither"],
    span_text: text.slice(0, 60),
    reason: "The note focuses on practical support and does not describe a health referral or discussion.",
  };
}

function demoInferenceResponse(prediction: DemoPrediction) {
  return HttpResponse.json({
    ...prediction,
    raw_response: "mocked",
    system_prompt: "mocked-system-prompt",
    user_prompt: "mocked-user-prompt",
  });
}

async function demoInferenceHandler({ request }: { request: Request }) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  return demoInferenceResponse(demoPrediction(String(body?.text ?? "")));
}

export const handlersReady = [
  http.post(`${API}/api/account/login`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
    };
    const email = body?.email || "demo@example.com";
    const username = email.split("@")[0] || "demo";

    return HttpResponse.json({
      success: true,
      jwtToken: "demo-jwt-token",
      jwtRefreshToken: "demo-refresh-token",
      user: {
        id: "demo-user",
        name: "Demo User",
        username,
        email,
      },
      message: "Login successful",
    });
  }),
  http.post(`${API}/api/tasks/create`, () => {
    return HttpResponse.json({
      success: true,
      taskId: "demo-task-1",
      task: { ...demoTask, status: "ready" },
      fileName: "demo.csv",
      message: "Task created successfully.",
      valSummary: { rows: 120, columns: ["text", "task_label"] },
      restSummary: { rows: 880, columns: ["text"] },
    });
  }),
  http.get(`${API}/api/tasks/getTask/:taskId`, () => {
    return HttpResponse.json({ success: true, task: { ...demoTask, status: "ready" } });
  }),
  http.get(`${API}/api/tasks/data-analysis/:taskId`, () => {
    return HttpResponse.json({
      success: true,
      status: "ready",
      rows: demoAnalysisRows,
      headers: Object.keys(demoAnalysisRows[0]),
    });
  }),
  http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
    return HttpResponse.json({ success: true, annotations: demoAnnotations });
  }),
  http.get(`${API}/api/tasks/getTasks`, () => {
    return HttpResponse.json({ success: true, tasks: [{ ...demoTask, status: "ready" }], count: 1 });
  }),
  http.delete(`${API}/api/tasks/delete/:taskId`, () => {
    // Storybook no-op: keep demo task list stable after delete action.
    return HttpResponse.json({
      success: true,
      message: "No-op in demo mode",
      deletedTaskId: null,
      deletedFilesCount: 0,
      deletedAnnotationsCount: 0,
    });
  }),
  http.post(`${API}/api/inference`, demoInferenceHandler),
  http.post(`${API}/api/inference/`, demoInferenceHandler),
  http.post(`${API}/api/annotate/update-guide`, () => {
    return HttpResponse.json({ success: true, message: "Guide annotation updated" });
  }),
  (() => {
    let commitCount = 0;
    return http.post(`${API}/api/inference/rule-synthesis`, () => {
      commitCount += 1;
      if (commitCount === 1) {
        return HttpResponse.json({
          success: true,
          rules: [
            "If a note connects a youth with a clinic, provider, or counseling service, label health referral.",
            "If a note discusses health or wellbeing without a service connection, label health discussion.",
          ],
        });
      }
      if (commitCount === 2) {
        return HttpResponse.json({
          success: true,
          rules: [
            "If a note mentions anxiety, sleep, coping, mood, or wellbeing without a referral, label health discussion.",
            "If a note only covers logistics, school, or paperwork, label neither.",
          ],
        });
      }
      return HttpResponse.json({
        success: true,
        rules: [],
      });
    });
  })(),
  http.post(`${API}/api/tasks/upload-bundle`, () => {
    return HttpResponse.json({
      success: true,
      taskId: "demo-task-1",
      task: demoTask,
      status: "ready",
      message: "Bundle uploaded and task created",
    });
  }),
  http.post(`${API}/api/embedding`, () => {
    return HttpResponse.json({ success: true, message: "Embedding processed" });
  }),
  http.post(`${API}/api/tasks/saveCodebook`, () => {
    return HttpResponse.json({ success: true, message: "Codebook saved" });
  }),
  http.post(`${API}/api/tasks/exportCodebook`, () => {
    return HttpResponse.json({ success: true, message: "Codebook exported" });
  }),
  http.post(`${API}/api/metrics/samples`, () => {
    return HttpResponse.json({ success: true, filename: "sample_metrics_demo.csv" });
  }),
  http.post(`${API}/api/metrics/metadata`, () => {
    return HttpResponse.json({ success: true, filename: "metadata_metrics_demo.csv" });
  }),
  http.post(`${API}/api/metrics/batches`, () => {
    return HttpResponse.json({ success: true, filename: "batch_metrics_demo.csv" });
  }),
  http.post(`${API}/api/metrics/val-eval`, () => {
    return HttpResponse.json({
      success: true,
      filename: "val_eval_demo.csv",
      predictionsFilename: demoTask.evalResults?.predictionsFilename,
      macroF1: demoTask.evalResults?.macroF1,
      macroPrecision: demoTask.evalResults?.macroPrecision,
      macroRecall: demoTask.evalResults?.macroRecall,
      microF1: demoTask.evalResults?.microF1,
      wrongPredictions: demoTask.evalResults?.wrongPredictions,
      perLabel: demoTask.evalResults?.perLabel,
      accuracy: demoTask.evalResults?.accuracy,
      evalResults: demoTask.evalResults,
    });
  }),
  http.get(`${API}/api/metrics/val-eval/progress/:taskId`, () => {
    return HttpResponse.json({ completed: 15, total: 15, done: true });
  }),
  http.get(`${API}/api/metrics/model-performance/:taskId`, () => {
    const snapshots = demoTask.evaluationHistory ?? [];
    return HttpResponse.json({
      success: true,
      snapshots,
      baseline: snapshots.find((snapshot) => snapshot.stage === "baseline"),
      final: snapshots.find((snapshot) => snapshot.stage === "final"),
    });
  }),
  http.post(`${API}/api/metrics/val-eval/cancel`, () => {
    return HttpResponse.json({ success: true });
  }),
  http.post(`${API}/api/tasks/final-inference`, () => {
    return HttpResponse.json({ success: true, taskId: "demo-task" });
  }),
  http.post(`${API}/api/tasks/final-inference/save`, () => {
    return HttpResponse.json({ success: true });
  }),
  http.post(`${API}/api/tasks/upload-output`, () => {
    return HttpResponse.json({ success: true, filePath: "demo-labeled.csv" });
  }),
  http.post(`${API}/api/tasks/complete`, () => {
    return HttpResponse.json({ success: true });
  }),
  http.get(`${API}/api/tasks/auto-label/progress/:taskId`, () => {
    return HttpResponse.json({
      completed: 3,
      total: 3,
      done: true,
      rows: [
        { text: demoAnalysisRows[0].Notes_anonymized, generated_label: "health referral" },
        { text: demoAnalysisRows[2].Notes_anonymized, generated_label: "health discussion" },
        { text: demoAnalysisRows[4].Notes_anonymized, generated_label: "neither" },
      ],
    });
  }),
];

export const handlersSamplingPending = [
  http.get(`${API}/api/tasks/getTask/:taskId`, () => {
    return HttpResponse.json({ success: true, task: { ...demoTask, status: "sampling_pending" } });
  }),
  http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
    return HttpResponse.json({ success: true, annotations: [] });
  }),
  http.get(`${API}/api/tasks/getTasks`, () => {
    return HttpResponse.json({ success: true, tasks: [{ ...demoTask, status: "sampling_pending" }], count: 1 });
  }),
];

export const handlersSamplingError = [
  http.get(`${API}/api/tasks/getTask/:taskId`, () => {
    return HttpResponse.json({
      success: true,
      task: { ...demoTask, status: "sampling_error" },
    });
  }),
  http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
    return HttpResponse.json({ success: true, annotations: [] });
  }),
  http.get(`${API}/api/tasks/getTasks`, () => {
    return HttpResponse.json({
      success: true,
      tasks: [{ ...demoTask, status: "sampling_error" }],
      count: 1,
    });
  }),
];

export const handlersEmpty = [
  http.get(`${API}/api/tasks/getTask/:taskId`, () => {
    return HttpResponse.json({ success: true, task: null });
  }),
  http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
    return HttpResponse.json({ success: true, annotations: [] });
  }),
  http.get(`${API}/api/tasks/getTasks`, () => {
    return HttpResponse.json({ success: true, tasks: [], count: 0 });
  }),
];

export const handlersPermissionDenied = [
  http.get(`${API}/api/tasks/getTask/:taskId`, () => {
    return HttpResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403 },
    );
  }),
  http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
    return HttpResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403 },
    );
  }),
  http.get(`${API}/api/tasks/getTasks`, () => {
    return HttpResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403 },
    );
  }),
];

export const handlersServerError = [
  http.get(`${API}/api/tasks/getTask/:taskId`, () => {
    return HttpResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }),
  http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
    return HttpResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }),
  http.get(`${API}/api/tasks/getTasks`, () => {
    return HttpResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }),
];

export function handlersSamplingTransition() {
  let reads = 0;

  return [
    http.get(`${API}/api/tasks/getTask/:taskId`, () => {
      reads += 1;
      const status = reads < 6 ? "sampling_pending" : "ready";
      return HttpResponse.json({
        success: true,
        task: { ...demoTask, status },
      });
    }),
    http.get(`${API}/api/annotate/get-annotations/:taskId`, () => {
      return HttpResponse.json({ success: true, annotations: demoAnnotations });
    }),
    http.get(`${API}/api/tasks/getTasks`, () => {
      return HttpResponse.json({ success: true, tasks: [demoTask], count: 1 });
    }),
    http.post(`${API}/api/tasks/upload`, () => {
      return HttpResponse.json({
        success: true,
        message: "Upload successful",
        filePath: "demo.csv",
      });
    }),
    http.post(`${API}/api/tasks/createTask`, () => {
      return HttpResponse.json({
        success: true,
        message: "Task created",
        taskId: "demo-task-1",
      });
    }),
  ];
}

export const handlersWildlife = handlersReady;
