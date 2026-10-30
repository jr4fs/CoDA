import {
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import type {
  EvaluationRecord,
  EvaluationRound,
  EvidenceSpan,
} from "@common/types/evaluationBuilder";
import type { Task } from "@common/types/tasks";
import { EvidenceAnnotator } from "./EvidenceAnnotator";
import { BatchProgressSection } from "../../pages/AIAnnotationPage/components/AIReviewPanelSections";

interface Props {
  task: Task;
  round: EvaluationRound;
  draft: EvaluationRecord;
  index: number;
  dirty: boolean;
  busy: boolean;
  onSelectRecord: (index: number) => void;
  onLabelChange: (name: string, checked: boolean) => void;
  onSpansChange: (spans: EvidenceSpan[]) => void;
  onSave: () => void;
  onComplete: () => void;
}

export function EvaluationRoundEditor({
  task,
  round,
  draft,
  index,
  dirty,
  busy,
  onSelectRecord,
  onLabelChange,
  onSpansChange,
  onSave,
  onComplete,
}: Props) {
  const reviewed = round.records.filter((record) => record.reviewed).length;
  const canCommit = reviewed === round.records.length && !dirty;
  const lastRecord = index === round.records.length - 1;
  const missingEvidence = draft.labels.filter(
    (name) =>
      task.labels.find((label) => label.name === name)?.requiresEvidence !==
        false && !draft.spans.some((span) => span.label === name),
  );
  return (
    <>
      <Group justify="space-between">
        <BatchProgressSection
          currentBatchProgress={reviewed}
          actualBatchSize={round.records.length}
          currentIndex={index}
          totalSamples={round.records.length}
          mutedColor="dimmed"
        />
        <Group gap="xs">
          <Button
            variant="default"
            size="sm"
            disabled={busy || index === 0}
            onClick={() => onSelectRecord(index - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            loading={busy}
            disabled={
              !canCommit && (!draft.labels.length || missingEvidence.length > 0)
            }
            onClick={
              canCommit && lastRecord
                ? onComplete
                : !dirty && draft.reviewed && !lastRecord
                  ? () => onSelectRecord(index + 1)
                  : onSave
            }
          >
            {canCommit && lastRecord
              ? "Commit Batch"
              : lastRecord
                ? "Save Sample"
                : "Next Sample"}
          </Button>
        </Group>
      </Group>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Evaluation set · Round {round.number}
        </Text>
        <Badge
          color={dirty ? "yellow" : draft.reviewed ? "green" : "gray"}
          variant="light"
        >
          {dirty
            ? "Unsaved changes"
            : draft.reviewed
              ? "Saved"
              : "Needs review"}
        </Badge>
      </Group>
      <EvidenceAnnotator
        key={draft.recordId}
        text={draft.text}
        labels={draft.labels}
        spans={draft.spans}
        disabled={busy}
        onChange={onSpansChange}
      >
        <Paper p="md" withBorder radius="md" bg="var(--app-surface)">
          <Stack gap="sm">
            <Text size="md" fw={700}>
              Your annotation
            </Text>
            <Text fw={600}>
              {task.type === "Single-class"
                ? "Choose one label"
                : "Choose all labels that apply"}
            </Text>
            {task.labels.map((label) => (
              <Checkbox
                key={label.name}
                label={label.name}
                description={`${label.definition}${label.requiresEvidence === false ? " · Evidence highlight optional" : ""}`}
                checked={draft.labels.includes(label.name)}
                disabled={busy}
                onChange={(event) =>
                  onLabelChange(label.name, event.currentTarget.checked)
                }
              />
            ))}
          </Stack>
        </Paper>
      </EvidenceAnnotator>
      {missingEvidence.length > 0 && (
        <Text size="sm" c="dimmed" aria-live="polite">
          Evidence needed for: {missingEvidence.join(", ")}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Next Sample saves your labels and highlights. Commit Batch updates label
        coverage.
      </Text>
    </>
  );
}
