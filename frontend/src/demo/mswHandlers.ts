import { http, HttpResponse } from "msw";
import { demoAnnotations, demoTask } from "./demoData";

// Wildcard origin so the demo's mocked endpoints match regardless of where it is
// served from: localhost in dev, GitHub Pages, or the deployed same-origin build
// (where apiClient uses a relative baseURL). MSW resolves "*" against any origin.
const API = "*";

// Per-sample mock AI prediction for the demo, keyed off the post text. The first
// four are correct; the last two (the no-stance plushie/game posts) are wrong on
// purpose so the demo shows the "mark incorrect → pick the right label" flow.
type DemoPrediction = { label: string[]; span_text: string; reason: string };

function demoPrediction(text: string): DemoPrediction {
  const t = text.toLowerCase();
  if (t.includes("rescue center")) {
    return {
      label: ["positive"],
      span_text: "donated to a pangolin rescue center... deserve all the protection",
      reason:
        "The post fundraises for a pangolin rescue and calls the animals worth protecting — a clear pro-conservation stance.",
    };
  }
  if (t.includes("most trafficked mammal")) {
    return {
      label: ["positive"],
      span_text: "the most trafficked mammal on Earth... help stop the poaching",
      reason:
        "The post raises anti-trafficking awareness and urges people to help stop poaching — pro-conservation.",
    };
  }
  if (t.includes("fresh pangolin scales")) {
    return {
      label: ["negative"],
      span_text: "Fresh pangolin scales available now — traditional remedy",
      reason:
        "The post advertises pangolin scales for sale as a remedy, actively promoting the trade — against conservation.",
    };
  }
  if (t.includes("delicacy")) {
    return {
      label: ["negative"],
      span_text: "pangolin meat is a delicacy everyone should try",
      reason:
        "The post praises eating pangolin meat and normalizes consumption — against conservation.",
    };
  }
  // Wrong on purpose: an affectionate toy post has no conservation stance (neutral).
  if (t.includes("plushie")) {
    return {
      label: ["positive"],
      span_text: "the cutest thing... pangolin plushie",
      reason:
        "The warm, affectionate tone toward pangolins reads as support for the species.",
    };
  }
  // Wrong on purpose: a video-game mention has no conservation stance (neutral).
  if (t.includes("video game")) {
    return {
      label: ["negative"],
      span_text: "Rolled into a ball to dodge every attack",
      reason:
        "The mention of dodging attacks suggests the pangolin is being harmed or hunted.",
    };
  }
  return {
    label: ["positive"],
    span_text: text.slice(0, 60),
    reason: "The post appears supportive of pangolins.",
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
            "If a post promotes rescuing, protecting, or raising awareness about pangolins, label positive.",
            "If a post promotes selling, eating, or using pangolin parts, label negative.",
          ],
        });
      }
      if (commitCount === 2) {
        return HttpResponse.json({
          success: true,
          rules: [
            "If a post blames pangolins for disease or wishes them harm, label negative.",
            "If a post mentions pangolins with no stance — memes, games, plushies, or logos — label neutral.",
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
        { text: "Sample post one", generated_label: "positive" },
        { text: "Sample post two", generated_label: "negative" },
        { text: "Sample post three", generated_label: "not relevant" },
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
