/** Run against the disposable stack described in docs/evaluation-builder.md. */
import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { MongoClient } from "mongodb";

const enabled = process.env.EVALUATION_INTEGRATION === "1";
const base = "http://127.0.0.1:18080";
const token = jwt.sign(
  {
    userId: "evaluation-test-user",
    email: "evaluation@example.test",
    username: "Evaluation test",
  },
  "codex-local-evaluation-test",
  { expiresIn: "1h" },
);
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function call(
  path: string,
  method = "GET",
  body?: unknown,
  expected = 200,
) {
  const response = await fetch(`${base}/api/tasks/${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response.json()) as any;
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}

async function settled(taskId: string) {
  for (let attempt = 0; attempt < 180; attempt++) {
    const current = await call(`${taskId}/evaluation`);
    if (
      !["sampling", "freezing"].includes(current.task.evaluationBuild.phase)
    ) {
      assert.notEqual(
        current.task.evaluationBuild.phase,
        "error",
        current.task.evaluationBuild.error,
      );
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Sampling did not settle within 90 seconds");
}

test(
  "upload rejects a task JSON used as the label set",
  { skip: !enabled },
  async () => {
    const form = new FormData();
    form.append("d_all", new Blob(["text\nA doctor called.\n"]), "notes.csv");
    form.append(
      "labels_json",
      new Blob([JSON.stringify({ taskname: "Wrong file", description: "Task" })]),
      "task.json",
    );
    form.append("task_name", "Validation test");
    form.append("task_description", "Synthetic test");
    form.append("text_column", "text");
    const response = await fetch(`${base}/api/tasks/create`, {
      method: "POST",
      headers: { Authorization: headers.Authorization },
      body: form,
    });
    const body = (await response.json()) as { message?: string };
    assert.equal(response.status, 400);
    assert.match(body.message || "", /task\.json.*labels.*array/i);
  },
);

test(
  "upload → real FAISS rounds → evidence → freeze → disjoint guide records",
  { skip: !enabled, timeout: 240_000 },
  async () => {
    const form = new FormData();
    form.append(
      "d_all",
      new Blob([
        "id,text\n" +
          Array.from(
            { length: 16 },
            (_, i) =>
              `${i},A lawyer discussed case ${i} with a doctor. The family received advice.\n`,
          ).join(""),
      ]),
      "evaluation-integration.csv",
    );
    form.append(
      "labels_json",
      new Blob([
        JSON.stringify({
          labels: [
            {
              name: "Legal",
              description: "Interaction with a lawyer",
              keywords: [],
            },
            {
              name: "Health",
              description: "Interaction with a doctor",
              keywords: ["doctor"],
            },
          ],
        }),
      ]),
      "labels.json",
    );
    for (const [key, value] of Object.entries({
      task_name: "Evaluation integration",
      task_description: "Synthetic test narratives",
      text_column: "text",
      model_name: "test",
      evaluation_batch_size: "2",
      evaluation_target: "3",
      coverage_n: "3",
    }))
      form.append(key, value);
    const upload = await fetch(`${base}/api/tasks/create`, {
      method: "POST",
      headers: { Authorization: headers.Authorization },
      body: form,
    });
    const created = (await upload.json()) as any;
    assert.equal(upload.status, 200, JSON.stringify(created));
    const taskId = created.taskId;
    const mongo = await new MongoClient("mongodb://127.0.0.1:27028").connect();
    try {
      assert.equal(created.task.valFile, undefined);
      assert.equal(created.task.evaluationBuild.batchSize, 2);
      const otherToken = jwt.sign(
        { userId: "other-test-user" },
        "codex-local-evaluation-test",
      );
      const denied = await fetch(`${base}/api/tasks/${taskId}/evaluation`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      assert.equal(denied.status, 404);
      const used = new Set<string>();
      for (let number = 1; number <= 2; number++) {
        const requests = await Promise.all(
          [1, 2].map(() =>
            fetch(`${base}/api/tasks/${taskId}/evaluation/next`, {
              method: "POST",
              headers,
            }),
          ),
        );
        assert.equal(
          requests.filter((r) => r.status === 202).length,
          1,
          "only one concurrent sampling job may acquire the task",
        );
        let state = await settled(taskId);
        assert.equal(state.round.number, number);
        assert.equal(state.round.records.length, 2);
        for (const record of state.round.records) {
          assert.ok(
            !used.has(record.recordId),
            "records never repeat across rounds",
          );
          used.add(record.recordId);
          const payload = {
            roundNumber: number,
            revision: state.round.revision,
            recordId: record.recordId,
            labels: ["Legal", "Health"],
            spans: [] as any[],
          };
          await call(`${taskId}/evaluation/review`, "PUT", payload, 400);
          payload.spans = [
            ["Legal", "lawyer"],
            ["Health", "doctor"],
          ].map(([label, text]) => ({
            label,
            text,
            start: record.text.indexOf(text),
            end: record.text.indexOf(text) + text.length,
          }));
          state = await call(`${taskId}/evaluation/review`, "PUT", payload);
          await call(`${taskId}/evaluation/review`, "PUT", payload, 409);
        }
        const completeBody = {
          roundNumber: number,
          revision: state.round.revision,
        };
        state = await call(
          `${taskId}/evaluation/complete-round`,
          "POST",
          completeBody,
        );
        const duplicate = await call(
          `${taskId}/evaluation/complete-round`,
          "POST",
          completeBody,
        );
        assert.deepEqual(duplicate.counts, state.counts);
        assert.equal(state.counts.Legal, number * 2);
      }
      // Simulate restart between the durable round write and task metadata write.
      await mongo
        .db("codex_evaluation_test")
        .collection("TaskDetails")
        .updateOne(
          { _id: new (await import("mongodb")).ObjectId(taskId) },
          {
            $unset: {
              "evaluationBuild.eligibleRecords": "",
              "evaluationBuild.totalRecords": "",
            },
          },
        );
      const recovered = await call(`${taskId}/evaluation`);
      assert.equal(recovered.remainingCount, 12);
      await call(`${taskId}/evaluation/freeze`, "POST", {}, 202);
      const frozen = await settled(taskId);
      assert.equal(frozen.task.evaluationBuild.phase, "frozen");
      assert.equal(frozen.reviewedCount, 4);
      await call(`${taskId}/evaluation/next`, "POST", {}, 409);
      const analysis = await call(`data-analysis/${taskId}`);
      assert.equal(analysis.rows.length, 4);
      assert.deepEqual(JSON.parse(analysis.rows[0].__evaluation_labels), [
        "Legal",
        "Health",
      ]);
      const guides = await mongo
        .db("codex_evaluation_test")
        .collection("AnnotationDetails")
        .find({ taskId, source: "guide" })
        .toArray();
      assert.equal(guides.length, 3);
      assert.ok(guides.every((record) => !used.has(record.recordId)));
      const legacy = await fetch(`${base}/api/embedding/sample`, {
        method: "POST",
        headers,
        body: JSON.stringify({ taskId }),
      });
      assert.equal(legacy.status, 409);
      await call(`${taskId}/evaluation/freeze`, "POST", {});
      assert.equal(
        await mongo
          .db("codex_evaluation_test")
          .collection("AnnotationDetails")
          .countDocuments({ taskId }),
        3,
      );
    } finally {
      await call(`delete/${taskId}`, "DELETE");
      await mongo.close();
    }
  },
);
