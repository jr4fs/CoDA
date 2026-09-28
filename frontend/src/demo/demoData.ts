import type { Task } from "@common/types/tasks";
import type { AnnotationItem } from "@common/types/annotations";

export const demoTask: Task = {
  _id: "demo-task-1",
  name: "Youth Support Notes",
  description: "Classify anonymized support notes by whether they contain a health referral, a health discussion, or neither.",
  type: "Multiclass",
  labels: [
    { name: "health referral", definition: "The note documents a referral, appointment, or connection to a health or behavioral-health service", keywords: ["referred", "appointment", "clinic", "provider", "counselor"] },
    { name: "health discussion", definition: "The note discusses physical health, mental health, symptoms, coping, or wellbeing without making a referral", keywords: ["discussed", "anxiety", "wellbeing", "coping", "sleep"] },
    { name: "neither", definition: "The note contains neither a health referral nor a substantive health discussion", keywords: ["transportation", "school", "housing", "paperwork"] },
  ],
  labelColumn: "label",
  modelName: "claude-3-5-sonnet",
  columns: ["Notes_anonymized"],
  file: "mfp_sample_data_anon.csv",
  status: "ready",
  codebook: [
    "health referral: a health or behavioral-health service is recommended, scheduled, or connected",
    "health discussion: health, symptoms, coping, or wellbeing are discussed without a referral",
    "neither: the note does not include a health referral or substantive health discussion",
  ],
  evalResults: {
    predictionsFilename: "val_eval_predictions_demo.csv",
    macroF1: 0.89,
    macroPrecision: 0.87,
    macroRecall: 0.91,
    microF1: 0.9,
    wrongPredictions: 3,
    perLabel: {
      "health referral": {
        precision: 0.92,
        recall: 0.96,
        f1: 0.94,
        tp: 24,
        fp: 2,
        tn: 63,
        fn: 1,
        support: 25,
      },
      "health discussion": {
        precision: 0.85,
        recall: 0.89,
        f1: 0.87,
        tp: 17,
        fp: 3,
        tn: 68,
        fn: 2,
        support: 19,
      },
      neither: {
        precision: 0.84,
        recall: 0.88,
        f1: 0.86,
        tp: 22,
        fp: 4,
        tn: 61,
        fn: 3,
        support: 25,
      },
    },
    accuracy: 0.9,
    numSamples: 30,
    completedAt: "2026-09-23T18:42:00.000Z",
    evaluationKey: "demo-evaluation-v1",
  },
  evaluationHistory: [
    {
      stage: "baseline",
      codebook: ["Classify posts using the supplied label definitions."],
      codebookHash: "demo-baseline-codebook",
      evaluationKey: "demo-evaluation-v1",
      modelName: "claude-3-5-sonnet",
      valFile: "youth_support_validation.csv",
      results: {
        predictionsFilename: "val_eval_predictions_demo_baseline.csv",
        macroF1: 0.71,
        macroPrecision: 0.74,
        macroRecall: 0.69,
        microF1: 0.72,
        wrongPredictions: 9,
        perLabel: {
          "health referral": { precision: 0.7, recall: 0.65, f1: 0.67, tp: 16, fp: 7, tn: 58, fn: 9, support: 25 },
          "health discussion": { precision: 0.76, recall: 0.68, f1: 0.72, tp: 13, fp: 4, tn: 67, fn: 6, support: 19 },
          neither: { precision: 0.76, recall: 0.74, f1: 0.75, tp: 19, fp: 6, tn: 59, fn: 6, support: 25 },
        },
        accuracy: 0.7,
        numSamples: 30,
        completedAt: "2026-09-20T10:00:00.000Z",
        evaluationKey: "demo-evaluation-v1",
      },
    },
  ],
  userID: "demo-user",
  createdAt: new Date().toISOString(),
};

const samples = [
  "Staff referred [PERSON] to a community counseling provider and helped schedule an intake appointment.",
  "[PERSON] requested primary-care support, so staff shared clinic options and offered help with the referral form.",
  "[PERSON] discussed recent anxiety, sleep disruption, and coping strategies that have been helpful at school.",
  "Staff checked in about mood and wellbeing; [PERSON] reported feeling calmer and using breathing exercises.",
  "Staff coordinated transportation for the upcoming school meeting and confirmed the pickup location.",
  "[PERSON] completed housing paperwork and reviewed the documents still needed for the application.",
];

const labels = ["health referral", "health referral", "health discussion", "health discussion", "neither", "neither"];
const analysisIds = [8177, 8181, 8204, 8241, 8296, 8352, 8405, 8468, 8510, 8574, 8621, 8689, 8740, 8813, 8876, 8932, 8996, 9044];
const analysisMonthOffsets = [0, 1, 3, 6, 8, 9, 11, 13];
const analysisNotes = {
  "health referral": [
    "Staff referred [PERSON] to a community counseling provider and reviewed next steps for intake.",
    "[PERSON] asked for additional support; staff shared clinic options and scheduled a follow-up about the referral.",
  ],
  "health discussion": [
    "[PERSON] discussed anxiety, sleep, and coping strategies that have been useful during the past week.",
    "Staff checked in about mood and wellbeing; [PERSON] described current stressors and protective supports.",
  ],
  neither: [
    "Staff coordinated transportation and confirmed the location and time for the upcoming school meeting.",
    "[PERSON] reviewed housing paperwork and identified the documents still needed for the application.",
  ],
};

export const demoAnalysisRows = analysisIds.flatMap((id, idIndex) =>
  Array.from({ length: 14 + (idIndex % 8) }, (_, noteIndex) => {
    const score = (noteIndex * 3 + idIndex * 2) % 10;
    const label = score < 7 ? "health referral" : score < 9 ? "health discussion" : "neither";
    const monthOffset = analysisMonthOffsets[(idIndex + noteIndex * 2) % analysisMonthOffsets.length];
    const date = new Date(Date.UTC(2024, 6 + monthOffset, 3 + ((idIndex * 5 + noteIndex * 7) % 24)));
    const notes = analysisNotes[label];
    return {
      "Youth ID": String(id),
      Date: date.toISOString().slice(0, 10),
      "Counseling Content": "Health & Social/Emotional Well-Being",
      Notes_anonymized: notes[noteIndex % notes.length],
      generated_label: label,
    };
  }),
);

export const demoAnnotations: AnnotationItem[] = samples.map((text, idx) => {
  const prediction = ["health referral", "health discussion", "health discussion", "health discussion", "health discussion", "neither"][idx];
  const isCorrect = prediction === labels[idx];
  return {
    _id: `a${String(idx + 1)}`,
    taskId: "demo-task-1",
    sampleId: idx + 1,
    sampleContent: { text },
    labels: [labels[idx]],
    createdBy: "demo-user",
    source: "guide",
    aiAnnotation: {
      batchID: idx < 3 ? "demo-batch-1" : "demo-batch-2",
      batchNum: idx < 3 ? 1 : 2,
      label: [prediction],
      reason: "Demo model reasoning",
      span_text: text,
      isCorrect,
      feedback: isCorrect ? "" : "Corrected during review",
      spanFeedback: true,
      reasoningFeedback: true,
      correctLabel: isCorrect ? null : labels[idx],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as AnnotationItem;
});
