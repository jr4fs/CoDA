import express from "express";
import cors from "cors";
import accountRouter from "./routes/accounts";
import tasksRouter from "./routes/tasks";
// import anonymizeRouter from "./routes/anonymize";
import annotationsRouter from "./routes/annotations";
import metricsRouter from "./routes/metrics";
import embeddingRouter from "./routes/embedding";
import inferenceRouter from "./routes/inference";
import adminRouter from "./routes/admin";

export const app = express();

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Public client config (no secrets). Lets the UI reflect server state up-front,
// e.g. hide/disable signup when self-service registration is turned off.
app.get("/api/config", (_req, res) =>
  res.json({ allowSignup: process.env.ALLOW_SIGNUP === "true" }),
);

app.use(
  cors({
    exposedHeaders: ["Content-Disposition", "X-Filename"],
  }),
);
app.use(express.json());

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.info(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(
        1,
      )} ms`,
    );
  });

  next();
});

app.use("/api/account", accountRouter);
app.use("/api/tasks", tasksRouter);
// Anonymization is temporarily disabled in the new flow.
// app.use("/api/anonymize", anonymizeRouter);
app.use("/api/annotate", annotationsRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/embedding", embeddingRouter);
app.use("/api/inference", inferenceRouter);
app.use("/api/admin", adminRouter);
