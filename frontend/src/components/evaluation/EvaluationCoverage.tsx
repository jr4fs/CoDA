import { Group, Paper, Progress, Stack, Text, Title } from "@mantine/core";
import type { EvaluationBuilderState } from "@common/types/evaluationBuilder";
import styles from "../../pages/AIAnnotationPage/AIAnnotationPage.module.css";

export function EvaluationCoverage({
  state,
}: {
  state: EvaluationBuilderState;
}) {
  const target = state.task.evaluationBuild!.targetPerLabel;
  return (
    <Paper className={styles.dropCard}>
      <Stack gap="md" className={styles.leftPanelScroll}>
        <div>
          <Title order={4}>Label coverage</Title>
          <Text size="sm" c="dimmed">
            Target: {target} confirmed examples per label
          </Text>
        </div>
        {state.task.labels.map((label) => {
          const count = state.counts[label.name] || 0;
          return (
            <div key={label.name}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={500} size="sm">
                  {label.name}
                </Text>
                <Text
                  size="sm"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {count} / {target}
                </Text>
              </Group>
              <Progress
                mt="xs"
                value={Math.min(100, (count / target) * 100)}
                color={count >= target ? "teal" : "blue"}
                aria-label={`${label.name} coverage`}
              />
            </div>
          );
        })}
        <Text size="sm">
          {state.reviewedCount} narratives in completed rounds
          {state.remainingCount !== null
            ? ` · ${state.remainingCount} remaining`
            : ""}
        </Text>
        <Text size="xs" c="dimmed">
          Counts update when you complete a round. A narrative can contribute to
          more than one label.
        </Text>
      </Stack>
    </Paper>
  );
}
