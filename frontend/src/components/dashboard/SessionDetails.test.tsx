import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "@common/types/tasks";

import SessionDetails from "./SessionDetails";

const emptyTask: Task = {
  name: "Empty task",
  description: "No completed session data",
  type: "Multiclass",
  labels: [],
  labelColumn: "label",
  modelName: "",
  columns: ["text"],
  file: "dataset.csv",
  userID: "user-1",
  createdAt: "2026-09-20T00:00:00.000Z",
};

describe("SessionDetails", () => {
  it("renders concise legacy and missing-data states", () => {
    const markup = renderToStaticMarkup(
      <SessionDetails
        task={emptyTask}
        annotations={[]}
        evaluationTotal={0}
      />,
    );

    expect(markup).toContain("No final rules yet.");
    expect(markup).toContain("No final labels yet.");
    expect(markup).toContain("No completed review feedback is available yet.");
    expect(markup).toContain("Final evaluation has not been run yet.");
    expect(markup).toContain("No remaining label issues were identified");
  });

  it("shows original upload names without exposing generated filenames", () => {
    const markup = renderToStaticMarkup(<SessionDetails task={{
      ...emptyTask,
      valFile: "generated-eval-id.csv",
      valFileName: "wildlife-evaluation-original.csv",
      inputFileName: "wildlife-dataset-original.csv",
    }} annotations={[]} evaluationTotal={0} />);
    expect(markup).toContain("wildlife-evaluation-original.csv");
    expect(markup).toContain("wildlife-dataset-original.csv");
    expect(markup).not.toContain("generated-eval-id.csv");
  });

  it("uses completed evaluation-builder reviews rather than legacy val annotations", () => {
    const markup = renderToStaticMarkup(<SessionDetails task={{
      ...emptyTask,
      evaluationBuild: { phase: "frozen", batchSize: 10, targetPerLabel: 20, guideSize: 20, round: 2 },
      evalResults: { predictionsFilename: "predictions.csv", macroF1: 0.8, accuracy: 0.8, numSamples: 20, completedAt: "2026-10-25T00:00:00.000Z" },
    }} annotations={[]} evaluationTotal={20} evaluationReviewed={20} />);

    expect(markup).toContain("20/20");
    expect(markup).not.toContain('title="0/20"');
  });
});
