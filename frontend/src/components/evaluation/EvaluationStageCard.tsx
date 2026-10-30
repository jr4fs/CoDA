import {
  Alert,
  Button,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { EvaluationBuilderState } from "@common/types/evaluationBuilder";

interface Props {
  state: EvaluationBuilderState;
  busy: boolean;
  onNext: () => void;
  onFreeze: () => void;
  onContinue: () => void;
}

export function EvaluationStageCard({
  state,
  busy,
  onNext,
  onFreeze,
  onContinue,
}: Props) {
  const build = state.task.evaluationBuild!;
  const canFinish = state.targetsMet || state.exhausted;
  if (build.phase === "sampling" || build.phase === "freezing") {
    const freezing = build.phase === "freezing";
    return (
      <Paper p="xl" withBorder radius="md">
        <Stack align="center">
          <Loader />
          <Title order={4}>
            {freezing
              ? "Preparing codebook review"
              : "Finding your next narratives"}
          </Title>
          <Text c="dimmed" ta="center">
            {freezing
              ? "Freezing your evaluation set and sampling separate guide records."
              : "Searching by label and selecting a diverse batch. The first round also builds the embedding cache and may take a few minutes."}
          </Text>
          <Text size="sm" c="dimmed">
            You can leave this page and return to your saved progress.
          </Text>
        </Stack>
      </Paper>
    );
  }
  if (build.phase === "frozen")
    return (
      <Paper p="xl" withBorder radius="md">
        <Stack>
          <Title order={3}>Your evaluation set is ready</Title>
          <Text>
            {state.reviewedCount} reviewed narratives are frozen. Codebook
            review uses separate records from your dataset.
          </Text>
          <Button onClick={onContinue}>Continue to codebook review</Button>
        </Stack>
      </Paper>
    );

  let title = "Start with a small, diverse batch";
  let description = `We’ll use your label definitions and keywords to select up to ${build.batchSize} narratives. You make the final labeling decisions.`;
  if (canFinish) title = "Review your evaluation coverage";
  else if (state.round) title = `Round ${state.round.number} complete`;
  if (state.targetsMet)
    description =
      "Every label has reached its target. Extra confirmed examples are retained.";
  else if (state.exhausted)
    description =
      "All usable records have been reviewed. Some labels may still be below target.";
  else if (state.round)
    description =
      "The next round will give more search slots to labels with fewer confirmed examples.";

  return (
    <Paper p="xl" withBorder radius="md">
      <Stack>
        <Title order={3}>{title}</Title>
        <Text>{description}</Text>
        <Text size="sm" c="dimmed">
          This deliberately enriched evaluation set measures performance on
          these reviewed examples. Its label counts do not estimate prevalence
          in your full dataset.
        </Text>
        {state.exhausted && (
          <Alert color="yellow" title="No records remain for codebook review">
            Your reviews are saved. A separate guide set cannot be created from
            this dataset because all usable records are now in the evaluation
            set.
          </Alert>
        )}
        {!state.exhausted && (
          <Button
            loading={busy}
            disabled={build.phase === "error"}
            onClick={canFinish ? onFreeze : onNext}
          >
            {canFinish
              ? "Freeze evaluation set and prepare codebook review"
              : state.round
                ? "Find next round"
                : "Find first round"}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
