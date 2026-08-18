import {
  ActionIcon,
  Badge,
  Group,
  LoadingOverlay,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconInfoCircle, IconX } from "@tabler/icons-react";
import { AIAssisted } from "../types";
import styles from "../AIAnnotationPage.module.css";

interface LabelOption {
  name: string;
  description?: string;
  definition?: string;
}

interface SectionProps {
  isLight: boolean;
  mutedColor: string;
  surface: string;
  surface2: string;
  surface3: string;
  borderColor: string;
  borderStrong: string;
  isLoading: boolean;
  readOnly?: boolean;
}

const infoIcon = (label: string) => (
  <Tooltip label={label} withArrow position="right">
    <ActionIcon size="xs" variant="subtle" color="gray" aria-label={label}>
      <IconInfoCircle size={14} />
    </ActionIcon>
  </Tooltip>
);

export function BatchProgressSection({
  isLight: _,
  mutedColor,
  currentBatchProgress,
  actualBatchSize,
  currentIndex,
  totalSamples,
}: SectionProps & {
  currentBatchProgress: number;
  actualBatchSize: number;
  currentIndex: number;
  totalSamples: number;
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="sm" fw={600}>
        Batch {currentBatchProgress}/{actualBatchSize}
      </Text>
      <Text size="sm" c={mutedColor}>
        Overall {currentIndex + 1}/{totalSamples}
      </Text>
    </Group>
  );
}

export function SampleTextSection({
  isLight: _,
  surface,
  borderColor,
  currentSampleText,
  surface2: __,
  surface3: ___,
  borderStrong: ____,
  mutedColor: _____,
  isLoading: ______,
}: SectionProps & {
  currentSampleText: string;
}) {
  return (
    <Paper
      bg={surface}
      p="sm"
      radius="md"
      style={{ border: `1px solid ${borderColor}` }}
      className={styles.sampleBox}
    >
      <div className={styles.samplePreviewText}>{currentSampleText}</div>
    </Paper>
  );
}

export function AIPredictionsSection({
  isLight,
  mutedColor,
  surface,
  surface2,
  borderColor,
  borderStrong,
  isLoading,
  readOnly,
  generatedLabels,
  generatedSpanText,
  generatedReasoning,
  batchResult,
  spanTextFeedback,
  reasoningFeedback,
  onSetCorrect,
  onSetSpanFeedback,
  onSetReasoningFeedback,
}: SectionProps & {
  generatedLabels: string[];
  generatedSpanText: string;
  generatedReasoning: string;
  batchResult?: AIAssisted;
  spanTextFeedback?: boolean;
  reasoningFeedback?: boolean;
  onSetCorrect: (value: boolean) => void;
  onSetSpanFeedback: (value: boolean) => void;
  onSetReasoningFeedback: (value: boolean) => void;
}) {
  return (
    <Paper bg={surface2} p="md" radius="md" style={{ border: `1px solid ${borderStrong}`, position: "relative" }}>
      <LoadingOverlay visible={isLoading} overlayProps={{ blur: 1 }} />
      <Stack gap="xs">
        <Group gap={6} align="center">
          <Text size="md" fw={700} c={isLight ? "#0f1418" : "white"}>
            AI Suggestion
          </Text>
          {infoIcon("The model's proposed labels and rationale.")}
        </Group>

        <Group gap="sm" align="flex-start" wrap="nowrap" w="100%">
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <Text size="md" fw={700}>
              Labels:
            </Text>
            {generatedLabels.map((label) => (
              <Badge key={label} size="lg" variant="filled" color={isLight ? "teal" : "cyan"}>
                {label || "..."}
              </Badge>
            ))}
          </Group>
          <Group gap="xs" style={{ flexShrink: 0 }}>
            <ActionIcon
              size="md"
              variant={batchResult?.isCorrect === true ? "filled" : "outline"}
              color="green"
              style={{ opacity: batchResult?.isCorrect === true ? 1 : 0.55 }}
              onClick={() => onSetCorrect(true)}
              disabled={readOnly}
            >
              <IconCheck size={18} />
            </ActionIcon>
            <ActionIcon
              size="md"
              variant={batchResult?.isCorrect === false ? "filled" : "outline"}
              color="red"
              style={{ opacity: batchResult?.isCorrect === false ? 1 : 0.55 }}
              onClick={() => onSetCorrect(false)}
              disabled={readOnly}
            >
              <IconX size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <Stack gap={4}>
          <Group gap={6} align="center">
            <Text fw={700} size="md">
              Span Text:
            </Text>
            {infoIcon("Key text span the model used to justify the label.")}
          </Group>
          <Group gap="sm" align="flex-start" wrap="nowrap" w="100%">
            <Text
              size="sm"
              bg={surface}
              p="xs"
              style={{ flex: 1, borderRadius: 6, border: `1px solid ${borderColor}` }}
            >
              {generatedSpanText || "..."}
            </Text>
            <Group gap="xs" style={{ flexShrink: 0 }}>
              <ActionIcon
                size="md"
                variant={spanTextFeedback === true ? "filled" : "outline"}
                color="green"
                style={{ opacity: spanTextFeedback === true ? 1 : 0.55 }}
                onClick={() => onSetSpanFeedback(true)}
              disabled={readOnly}
              >
                <IconCheck size={18} />
              </ActionIcon>
              <ActionIcon
                size="md"
                variant={spanTextFeedback === false ? "filled" : "outline"}
                color="red"
                style={{ opacity: spanTextFeedback === false ? 1 : 0.55 }}
                onClick={() => onSetSpanFeedback(false)}
              disabled={readOnly}
              >
                <IconX size={18} />
              </ActionIcon>
            </Group>
          </Group>
        </Stack>

        <Stack gap={4}>
          <Group gap={6} align="center">
            <Text fw={700} size="md">
              Reasoning:
            </Text>
            {infoIcon("Short explanation produced by the model.")}
          </Group>
          <Group gap="sm" align="flex-start" wrap="nowrap" w="100%">
            <Text size="sm" fs="italic" c={mutedColor} style={{ flex: 1 }}>
              {generatedReasoning || "Generating reasoning..."}
            </Text>
            <Group gap="xs" style={{ flexShrink: 0 }}>
              <ActionIcon
                size="md"
                variant={reasoningFeedback === true ? "filled" : "outline"}
                color="green"
                style={{ opacity: reasoningFeedback === true ? 1 : 0.55 }}
                onClick={() => onSetReasoningFeedback(true)}
              disabled={readOnly}
              >
                <IconCheck size={18} />
              </ActionIcon>
              <ActionIcon
                size="md"
                variant={reasoningFeedback === false ? "filled" : "outline"}
                color="red"
                style={{ opacity: reasoningFeedback === false ? 1 : 0.55 }}
                onClick={() => onSetReasoningFeedback(false)}
              disabled={readOnly}
              >
                <IconX size={18} />
              </ActionIcon>
            </Group>
          </Group>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function FeedbackSection({
  isLight: _,
  surface: __,
  surface2: ___,
  surface3,
  borderColor: ____,
  borderStrong: _____,
  isLoading: ______,
  readOnly,
  mutedColor,
  batchResult,
  spanTextFeedback,
  reasoningFeedback,
  labels,
  onSetCorrectLabel,
  onSetFeedback,
}: SectionProps & {
  batchResult?: AIAssisted;
  spanTextFeedback?: boolean;
  reasoningFeedback?: boolean;
  labels: LabelOption[];
  onSetCorrectLabel: (label: string | null) => void;
  onSetFeedback: (value: string) => void;
}) {
  const showFeedback = batchResult?.isCorrect === false || spanTextFeedback === false || reasoningFeedback === false;

  return (
    <Paper p="md" bg={surface3} radius="md">
      {showFeedback ? (
        <Stack gap="xs">
          {batchResult?.isCorrect === false && (
            <>
              <Group gap="xs" align="center">
                <Text size="sm" fw={500}>
                  Task Labels:
                </Text>
                {infoIcon("Labels defined in the task definition stage")}
                <Group gap={4}>
                  {labels.length > 0 ? (
                    labels.map((label) => (
                      <Tooltip
                        key={label.name}
                        withArrow
                        multiline
                        w={280}
                        label={label.description || label.definition || "No label description available."}
                      >
                        <Badge
                          variant="light"
                          color="gray"
                          style={{ cursor: readOnly ? "default" : "pointer" }}
                          onClick={() => {
                            if (!readOnly) onSetCorrectLabel(label.name);
                          }}
                        >
                          {label.name}
                        </Badge>
                      </Tooltip>
                    ))
                  ) : (
                    <Text size="xs" c={mutedColor}>
                      Error retrieving task labels.
                    </Text>
                  )}
                </Group>
              </Group>
              <Select
                label="Correct label"
                placeholder="Select the correct label"
                data={labels.map((l) => ({ value: l.name, label: l.name.toUpperCase() }))}
                value={batchResult?.correctLabel ?? null}
                onChange={(value) => onSetCorrectLabel(value ?? null)}
                required
                allowDeselect={false}
                disabled={readOnly}
              />
            </>
          )}
          <Textarea
            label="Feedback"
            mt={4}
            placeholder="Why was the AI wrong? (This will help the rule synthesizer)"
            variant="default"
            size="sm"
            value={batchResult?.feedback ?? ""}
            required
            onChange={(e) => onSetFeedback(e.currentTarget.value)}
            disabled={readOnly}
          />
          <Text size="xs" c={mutedColor} ta="center">Click <i>Next Sample</i> to continue.</Text>
        </Stack>
      ) : (
      <Text size="xs" c={mutedColor} ta="center">
        Mark the AI suggestion as incorrect to provide feedback.
      </Text>
    )}
    </Paper>
  );
}
