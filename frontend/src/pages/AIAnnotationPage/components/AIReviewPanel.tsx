import { Button, Group, Paper, Stack } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconBook } from "@tabler/icons-react";
import { AIAssisted } from "../types";
import {
  BatchProgressSection,
  SampleTextSection,
  AIPredictionsSection,
  FeedbackSection,
} from "./AIReviewPanelSections";

interface LabelOption {
  name: string;
  description?: string;
  definition?: string;
}

interface AIReviewPanelProps {
  isLight: boolean;
  mutedColor: string;
  surface: string;
  surface2: string;
  surface3: string;
  borderColor: string;
  borderStrong: string;
  isLoading: boolean;
  currentBatchProgress: number;
  actualBatchSize: number;
  currentIndex: number;
  totalSamples: number;
  currentBatchStartIndex: number;
  currentSampleText: string;
  generatedLabels: string[];
  generatedSpanText: string;
  generatedReasoning: string;
  batchResult?: AIAssisted;
  spanTextFeedback?: boolean;
  reasoningFeedback?: boolean;
  labels: LabelOption[];
  onPrev: () => void;
  onNext: () => void;
  isCommitStep: boolean;
  isCompleteStep: boolean;
  nextDisabled: boolean;
  onSetCorrect: (value: boolean) => void;
  onSetSpanFeedback: (value: boolean) => void;
  onSetReasoningFeedback: (value: boolean) => void;
  onSetCorrectLabel: (label: string | null) => void;
  onSetFeedback: (value: string) => void;
}

export function AIReviewPanel({
  isLight,
  mutedColor,
  surface,
  surface2,
  surface3,
  borderColor,
  borderStrong,
  isLoading,
  currentBatchProgress,
  actualBatchSize,
  currentIndex,
  totalSamples,
  currentBatchStartIndex,
  currentSampleText,
  generatedLabels,
  generatedSpanText,
  generatedReasoning,
  batchResult,
  spanTextFeedback,
  reasoningFeedback,
  labels,
  onPrev,
  onNext,
  isCommitStep,
  isCompleteStep,
  nextDisabled,
  onSetCorrect,
  onSetSpanFeedback,
  onSetReasoningFeedback,
  onSetCorrectLabel,
  onSetFeedback,
}: AIReviewPanelProps) {
  const batchProgressSection = (
    <Group justify="space-between" align="center" wrap="nowrap">
      <BatchProgressSection
        isLight={isLight}
        mutedColor={mutedColor}
        surface={surface}
        surface2={surface2}
        surface3={surface3}
        borderColor={borderColor}
        borderStrong={borderStrong}
        isLoading={isLoading}
        currentBatchProgress={currentBatchProgress}
        actualBatchSize={actualBatchSize}
        currentIndex={currentIndex}
        totalSamples={totalSamples}
      />

      <Group gap="xs" wrap="nowrap">
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={16} />}
          disabled={currentIndex <= currentBatchStartIndex || isLoading}
          onClick={onPrev}
        >
          Previous
        </Button>
        <Button
          rightSection={isCompleteStep || isCommitStep ? <IconBook size={16} /> : <IconArrowRight size={16} />}
          color={isCompleteStep || isCommitStep ? "blue" : "indigo"}
          disabled={nextDisabled}
          loading={isLoading}
          onClick={onNext}
        >
          {isCompleteStep ? "Complete" : isCommitStep ? "Commit Batch" : "Next Sample"}
        </Button>
      </Group>
    </Group>
  );

  const sampleTextSection = (
    <SampleTextSection
      isLight={isLight}
      mutedColor={mutedColor}
      surface={surface}
      surface2={surface2}
      surface3={surface3}
      borderColor={borderColor}
      borderStrong={borderStrong}
      isLoading={isLoading}
      currentSampleText={currentSampleText}
    />
  );

  const aiPredictionsSection = (
    <AIPredictionsSection
      isLight={isLight}
      mutedColor={mutedColor}
      surface={surface}
      surface2={surface2}
      surface3={surface3}
      borderColor={borderColor}
      borderStrong={borderStrong}
      isLoading={isLoading}
      generatedLabels={generatedLabels}
      generatedSpanText={generatedSpanText}
      generatedReasoning={generatedReasoning}
      batchResult={batchResult}
      spanTextFeedback={spanTextFeedback}
      reasoningFeedback={reasoningFeedback}
      onSetCorrect={onSetCorrect}
      onSetSpanFeedback={onSetSpanFeedback}
      onSetReasoningFeedback={onSetReasoningFeedback}
    />
  );

  const feedbackSection = (
    <FeedbackSection
      isLight={isLight}
      mutedColor={mutedColor}
      surface={surface}
      surface2={surface2}
      surface3={surface3}
      borderColor={borderColor}
      borderStrong={borderStrong}
      isLoading={isLoading}
      batchResult={batchResult}
      labels={labels}
      onSetCorrectLabel={onSetCorrectLabel}
      onSetFeedback={onSetFeedback}
    />
  );

  return (
    <Paper radius="lg" bg={surface}>
      <Stack p="md" gap="md" style={{ overflow: "auto" }}>
        {batchProgressSection}
        {sampleTextSection}
        {aiPredictionsSection}
        {feedbackSection}
      </Stack>
    </Paper>
  );
}
