import type { Task } from "@common/types/tasks";
import type { AnnotationItem } from "@common/types/annotations";

export const demoTask: Task = {
  _id: "demo-task-1",
  name: "Pangolin Conservation Sentiment",
  description: "Classify the sentiment of pangolin-related social media posts toward wildlife conservation.",
  type: "Multiclass",
  labels: [
    { name: "positive", definition: "Supports protecting pangolins — rescue stories, anti-trafficking, conservation awareness, fundraising, or education", keywords: ["save", "protect", "conservation", "awareness", "endangered", "rescue"] },
    { name: "negative", definition: "Promotes selling, eating, or using pangolins, or blames/wishes them harm — bushmeat, scales, trade, disease blame", keywords: ["for sale", "meat", "scales", "medicine", "poaching", "bushmeat"] },
    { name: "neutral", definition: "Mentions pangolins with no clear stance — memes, games, logos, plush toys, descriptive references", keywords: ["meme", "cartoon", "plushie", "logo", "game", "mascot"] },
  ],
  labelColumn: "label",
  modelName: "claude-3-5-sonnet",
  columns: ["translated_text"],
  file: "pangolin_posts.csv",
  status: "ready",
  codebook: [
    "positive: posts that promote rescuing, protecting, or raising awareness about pangolins",
    "negative: posts that promote selling, eating, or using pangolin parts, or blame them for disease",
    "neutral: posts that mention pangolins with no stance — memes, games, logos, plush toys",
  ],
  evalResults: {
    predictionsFilename: "val_eval_predictions_demo.csv",
    macroF1: 0.89,
    macroPrecision: 0.87,
    macroRecall: 0.91,
    microF1: 0.9,
    wrongPredictions: 3,
    perLabel: {
      positive: {
        precision: 0.92,
        recall: 0.96,
        f1: 0.94,
        tp: 24,
        fp: 2,
        tn: 63,
        fn: 1,
        support: 25,
      },
      negative: {
        precision: 0.85,
        recall: 0.89,
        f1: 0.87,
        tp: 17,
        fp: 3,
        tn: 68,
        fn: 2,
        support: 19,
      },
      neutral: {
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
      valFile: "pangolin_validation.csv",
      results: {
        predictionsFilename: "val_eval_predictions_demo_baseline.csv",
        macroF1: 0.71,
        macroPrecision: 0.74,
        macroRecall: 0.69,
        microF1: 0.72,
        wrongPredictions: 9,
        perLabel: {
          positive: { precision: 0.7, recall: 0.65, f1: 0.67, tp: 16, fp: 7, tn: 58, fn: 9, support: 25 },
          negative: { precision: 0.76, recall: 0.68, f1: 0.72, tp: 13, fp: 4, tn: 67, fn: 6, support: 19 },
          neutral: { precision: 0.76, recall: 0.74, f1: 0.75, tp: 19, fp: 6, tn: 59, fn: 6, support: 25 },
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
  "Just donated to a pangolin rescue center! These shy, scaly little mammals deserve all the protection we can give them. Please chip in if you can 💚 #SavePangolins",
  "Did you know pangolins are the most trafficked mammal on Earth? Share this post to raise awareness and help stop the poaching before it's too late.",
  "Fresh pangolin scales available now — traditional remedy trusted for generations. DM me for prices and shipping, limited stock this week.",
  "Honestly pangolin meat is a delicacy everyone should try at least once. Slow-cooked with herbs, it's a real gastronomic marvel 🍲",
  "My little cousin will not stop showing off her new cartoon pangolin plushie 🥰 it's genuinely the cutest thing.",
  "TIL there's a playable pangolin character in that new indie video game. Rolled into a ball to dodge every attack lol.",
];

const labels = ["positive", "positive", "negative", "negative", "neutral", "neutral"];

export const demoAnnotations: AnnotationItem[] = samples.map((text, idx) => {
  const prediction = ["positive", "neutral", "negative", "neutral", "neutral", "positive"][idx];
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
