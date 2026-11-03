import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Grid,
  Loader,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { isAxiosError } from "axios";
import { useCallback, useEffect, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import type {
  EvaluationBuilderState,
  EvaluationRecord,
} from "@common/types/evaluationBuilder";
import StepTrackerBanner from "../components/StepTrackerBanner";
import { EvaluationCoverage } from "../components/evaluation/EvaluationCoverage";
import { EvaluationRoundEditor } from "../components/evaluation/EvaluationRoundEditor";
import { EvaluationStageCard } from "../components/evaluation/EvaluationStageCard";
import {
  completeEvaluationRound,
  fetchEvaluationBuilder,
  freezeEvaluation,
  nextEvaluationRound,
  saveEvaluationReview,
} from "../services/evaluationBuilder.service";
import styles from "./AIAnnotationPage/AIAnnotationPage.module.css";

export default function EvaluationBuilderPage() {
  const { taskId = "" } = useParams();
  return <EvaluationBuilder key={taskId} taskId={taskId} />;
}

// Keying the editor prevents a previous task's in-flight request replacing this task.
function EvaluationBuilder({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<EvaluationBuilderState | null>(null);
  const [draft, setDraft] = useState<EvaluationRecord | null>(null);
  const [index, setIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (
      window.confirm(
        "Leave this record and discard unsaved labels and highlights?",
      )
    )
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  const showError = (err: unknown) =>
    setError(
      isAxiosError(err)
        ? err.response?.data?.message ||
            "Could not reach the server. Your saved reviews are safe; retry when connected."
        : err instanceof Error
          ? err.message
          : "Something went wrong.",
    );
  const refresh = useCallback(async () => {
    const next = await fetchEvaluationBuilder(taskId);
    setState(next);
    return next;
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setDraft(null);
    setDirty(false);
    setIndex(0);
    fetchEvaluationBuilder(taskId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err) => {
        if (!cancelled) showError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);
  const phase = state?.task.evaluationBuild?.phase;
  useEffect(() => {
    if (phase !== "sampling" && phase !== "freezing") return;
    const timer = window.setInterval(() => {
      void refresh().catch(showError);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [phase, refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const record = state?.round?.records[index];
  useEffect(() => {
    if (!dirty)
      setDraft(
        record
          ? { ...record, labels: [...record.labels], spans: [...record.spans] }
          : null,
      );
  }, [record, dirty]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      window.dispatchEvent(new Event("tasks:updated"));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };
  const selectRecord = (position: number) => {
    if (
      dirty &&
      !window.confirm("Discard your unsaved changes to this record?")
    )
      return;
    setDirty(false);
    setIndex(position);
  };
  const save = () =>
    act(async () => {
      if (!state?.round || !draft) return;
      const next = await saveEvaluationReview(
        taskId,
        state.round.number,
        state.round.revision,
        draft.recordId,
        draft.labels,
        draft.spans,
      );
      setDirty(false);
      setState(next);
      if (index + 1 < (next.round?.records.length ?? 0)) setIndex(index + 1);
    });
  const changeLabel = (name: string, checked: boolean) => {
    if (!draft || !state) return;
    const labels = checked
      ? state.task.type === "Single-class"
        ? [name]
        : [...draft.labels, name]
      : draft.labels.filter((l) => l !== name);
    const removed = draft.spans.filter((s) => !labels.includes(s.label));
    if (
      removed.length &&
      !window.confirm(
        "Removing this label will also remove its highlights. Continue?",
      )
    )
      return;
    setDraft({
      ...draft,
      labels,
      spans: draft.spans.filter((s) => labels.includes(s.label)),
    });
    setDirty(true);
  };

  if (!state)
    return (
      <Container py="xl">
        <Stack>
          {error ? (
            <Alert color="red" title="Unable to load evaluation builder">
              {error}
              <Button
                mt="sm"
                variant="light"
                onClick={() => void refresh().catch(showError)}
              >
                Retry
              </Button>
            </Alert>
          ) : (
            <Group>
              <Loader size="sm" />
              <Text>Loading your saved reviews…</Text>
            </Group>
          )}
        </Stack>
      </Container>
    );
  const build = state.task.evaluationBuild!;
  const round = state.round;
  const editing =
    round?.status === "draft" &&
    phase !== "sampling" &&
    phase !== "freezing" &&
    phase !== "frozen";

  return (
    <Box
      className={styles.page}
      style={{ display: "flex", flexDirection: "column" }}
    >
      <div className={styles.orbOne} />
      <Container fluid className={styles.hero}>
        <StepTrackerBanner currentStep={2} evaluationFlow />
        <Paper className={styles.taskHeader} radius="md">
          <Group gap="xs">
            <Text className={styles.taskTitle}>
              Codebook Creation Task: {state.task.name}
            </Text>
            <Badge variant="light" color="blue" size="sm">
              Evaluation set
            </Badge>
          </Group>
          <Text className={styles.taskDescription} lineClamp={2}>
            {state.task.description}
          </Text>
        </Paper>
      </Container>
      <Container fluid className={styles.tableSection}>
        {error && (
          <Alert
            color="red"
            title="Action not completed"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        {phase === "error" && (
          <Alert color="red" title="Sampling interrupted">
            <Text size="sm">{build.error}</Text>
            <Button
              mt="sm"
              variant="light"
              onClick={() =>
                void act(() =>
                  build.frozenAt
                    ? freezeEvaluation(taskId)
                    : nextEvaluationRound(taskId),
                )
              }
              loading={busy}
            >
              Retry from saved progress
            </Button>
          </Alert>
        )}
        <Grid gutter="md" align="stretch" className={styles.annotationGrid}>
          <Grid.Col span={{ base: 12, md: 8 }} className={styles.mainColumn}>
            <Paper
              className={styles.reviewPaper}
              radius="lg"
              bg="var(--app-surface)"
            >
              <Stack p="md" gap="md" className={styles.leftPanelScroll}>
                {editing && draft ? (
                  <EvaluationRoundEditor
                    task={state.task}
                    round={round}
                    draft={draft}
                    index={index}
                    dirty={dirty}
                    busy={busy}
                    onSelectRecord={selectRecord}
                    onLabelChange={changeLabel}
                    onSpansChange={(spans) => {
                      setDraft({ ...draft, spans });
                      setDirty(true);
                    }}
                    onSave={() => void save()}
                    onComplete={() =>
                      void act(async () => {
                        setState(
                          await completeEvaluationRound(
                            taskId,
                            round.number,
                            round.revision,
                          ),
                        );
                        setDraft(null);
                      })
                    }
                  />
                ) : (
                  <EvaluationStageCard
                    state={state}
                    busy={busy}
                    onNext={() =>
                      void act(async () => {
                        setIndex(0);
                        await nextEvaluationRound(taskId);
                      })
                    }
                    onFreeze={() => void act(() => freezeEvaluation(taskId))}
                    onContinue={() => navigate(`/codebook-creation/${taskId}`)}
                  />
                )}
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }} className={styles.sidebarColumn}>
            <EvaluationCoverage state={state} />
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}
