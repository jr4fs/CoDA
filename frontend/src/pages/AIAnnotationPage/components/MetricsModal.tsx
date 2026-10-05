import {
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { cancelValEval } from "../../../services/metrics.service";
import { MetricsFiles } from "../types";

type FinalInferencePhase = "idle" | "running" | "done" | "error";

interface MetricsModalProps {
  opened: boolean;
  isLight: boolean;
  files: MetricsFiles;
  onClose: () => void;
  onDownload: (filename?: string) => void;
  onExportCodebook: () => void;
  taskId?: string;
  valMetrics: { precision: number; recall: number; f1: number } | null;
  isRunningValEval: boolean;
  valEvalProgress: { completed: number; total: number };
  finalInferencePhase: FinalInferencePhase;
  finalInferenceProgress: { completed: number; total: number };
  finalLabeledRowCount: number;
  finalInferenceHasResult: boolean;
  onRunFinalInference: () => void;
  onDownloadFinalInference: () => void;
}

export function MetricsModal({
  opened,
  isLight,
  files,
  onClose,
  onDownload,
  onExportCodebook,
  taskId,
  valMetrics,
  isRunningValEval,
  valEvalProgress,
  finalInferencePhase,
  finalInferenceProgress,
  finalLabeledRowCount,
  finalInferenceHasResult,
  onRunFinalInference,
  onDownloadFinalInference,
}: MetricsModalProps) {
  const navigate = useNavigate();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      title="Review complete"
      overlayProps={{
        blur: 2,
        opacity: 0.5,
        color: isLight ? "#f7fafb" : "#11171c",
      }}
      styles={{
        content: {
          backgroundColor: isLight ? "#ffffff" : "rgba(20, 28, 34, 0.98)",
          border: isLight
            ? "1px solid rgba(15, 20, 24, 0.12)"
            : "1px solid rgba(124, 231, 225, 0.25)",
          boxShadow: isLight
            ? "0 24px 60px rgba(0, 0, 0, 0.15)"
            : "0 24px 60px rgba(0, 0, 0, 0.35)",
          color: isLight ? "#0f1418" : "#e8eef1",
        },
        header: { backgroundColor: "transparent" },
        title: { color: isLight ? "#0f1418" : "#e8eef1", fontWeight: 600 },
        close: { color: isLight ? "#0f1418" : "#e8eef1" },
      }}
    >
      <Stack gap="sm">
        <Text mt="xs">Review completed! You can download the generated codebook metrics here.</Text>

        <Stack gap={6}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Final metrics on held-out validation set
          </Text>
          {valMetrics ? (
            <Group grow gap="sm" align="stretch">
              {[
                { label: "Precision", value: valMetrics.precision },
                { label: "Recall", value: valMetrics.recall },
                { label: "F1", value: valMetrics.f1 },
              ].map((m) => (
                <Paper
                  key={m.label}
                  withBorder
                  radius="md"
                  p="sm"
                  ta="center"
                  bg={isLight ? "#f4f7f9" : "rgba(255,255,255,0.04)"}
                >
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                    {m.label}
                  </Text>
                  <Text size="xl" fw={700} c="teal">
                    {m.value.toFixed(2)}
                  </Text>
                </Paper>
              ))}
            </Group>
          ) : isRunningValEval ? (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm">
                {valEvalProgress.total > 0
                  ? `Computing on validation set… ${valEvalProgress.completed} / ${valEvalProgress.total}`
                  : "Computing on validation set…"}
              </Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Validation metrics are not available for this task.
            </Text>
          )}
        </Stack>

        <Divider my="xs" />

        <Button fullWidth onClick={onExportCodebook}>
          Export codebook
        </Button>
        <Text mt="xs">You can download the captured metrics below.</Text>
        <Button fullWidth variant="light" onClick={() => onDownload(files.sample)} disabled={!files.sample}>
          Download sample metrics
        </Button>
        <Button fullWidth variant="light" onClick={() => onDownload(files.batch)} disabled={!files.batch}>
          Download batch metrics
        </Button>
        <Button
          fullWidth
          variant="light"
          onClick={() => onDownload(files.metadata)}
          disabled={!files.metadata}
        >
          Download metadata metrics
        </Button>

        <Divider my="xs" />
        <Text size="sm">
          As a final step, run inference over your full dataset (D_all) using the
          latest codebook to extract a label for every row.
        </Text>
        <Button
          fullWidth
          variant="filled"
          loading={finalInferencePhase === "running"}
          disabled={finalInferencePhase === "running" || !taskId}
          onClick={onRunFinalInference}
        >
          {finalInferencePhase === "done"
            ? "Re-run inference on full dataset (D_all)"
            : "Run inference on full dataset (D_all)"}
        </Button>
        {finalInferencePhase === "running" && (
          <>
            <Text size="xs">
              {finalInferenceProgress.total > 0
                ? `${finalInferenceProgress.completed} / ${finalInferenceProgress.total} rows labeled`
                : "Starting…"}
            </Text>
            <Progress
              value={
                finalInferenceProgress.total > 0
                  ? (finalInferenceProgress.completed / finalInferenceProgress.total) * 100
                  : 0
              }
              animated
              size="sm"
            />
          </>
        )}
        {finalInferencePhase === "error" && (
          <Text size="xs" c="red">
            Inference failed. Please try again.
          </Text>
        )}
        {finalInferencePhase === "done" && finalInferenceHasResult && (
          <Button fullWidth variant="light" onClick={onDownloadFinalInference}>
            {finalLabeledRowCount > 0
              ? `Download labeled dataset (${finalLabeledRowCount} rows)`
              : "Download labeled dataset"}
          </Button>
        )}

        {taskId && (
          <Button
            fullWidth
            variant="filled"
            color="teal"
            onClick={async () => {
              try { await cancelValEval(taskId); } catch {}
              navigate(`/dashboard/${taskId}`);
            }}
          >
            Go to Dashboard
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
