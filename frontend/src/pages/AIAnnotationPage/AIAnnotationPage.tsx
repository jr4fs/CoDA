import { Badge, Box, Button, Container, Grid, Group, Paper, Stack, Text, Tooltip, useMantineColorScheme } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import ConfirmActionModal from "../../components/common/ConfirmActionModal";
import PageIntro from "../../components/common/PageIntro";
import GuidedTour, { GuidedTourStep } from "../../components/common/GuidedTour";
import StepTrackerBanner from "../../components/StepTrackerBanner";
import { useDemo } from "../../demo/DemoContext";
import { IconArrowRight } from "@tabler/icons-react";
import styles from "./AIAnnotationPage.module.css";

import { CodebookPanel } from "./components/CodebookPanel";
import { MetricsModal } from "./components/MetricsModal";
import {
  BatchProgressSection,
  SampleTextSection,
  AIPredictionsSection,
  FeedbackSection,
} from "./components/AIReviewPanelSections";
import { useAIAnnotationController } from "./hooks/useAIAnnotationController";
import { ErrorStatus, LoadingStatus } from "./subpages/AIAnnotationStatusView";

export default function AnnotationPage() {
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === "light";
  const { isDemo, tourOpen: demoTourOpen, setTourOpen: setDemoTourOpen } = useDemo();
  const [liveTourOpen, setLiveTourOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  const tourOpen = isDemo ? demoTourOpen : liveTourOpen;
  const setTourOpen = isDemo ? setDemoTourOpen : setLiveTourOpen;

  const showRunEvalButton = import.meta.env.VITE_APP_MODE !== "pilot";

  const mutedColor = isLight ? "#3b4750" : "dimmed";
  const surface = isLight ? "#ffffff" : "var(--app-surface)";
  const surface2 = isLight ? "#f4f7f9" : "var(--app-surface-2)";
  const surface3 = isLight ? "#eef3f5" : "var(--app-surface-3)";
  const panelBg = isLight ? "#f2f6f8" : "var(--app-panel)";
  const borderColor = isLight ? "rgba(15, 20, 24, 0.12)" : "var(--app-border)";
  const borderStrong = isLight ? "rgba(15, 20, 24, 0.18)" : "var(--app-border-strong)";

  const controller = useAIAnnotationController();
  const autoOpenedRef = useRef(false);

  // Auto-open demo tour immediately when page is ready (only once)
  useEffect(() => {
    if (isDemo && !autoOpenedRef.current && controller.isReady) {
      autoOpenedRef.current = true;
      // Auto-open tour after a brief delay to ensure page is fully rendered
      const timer = setTimeout(() => {
        setDemoTourOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isDemo, controller.isReady, setDemoTourOpen]);

  if (controller.loading) {
    return <LoadingStatus isLight={isLight} message="Loading annotation data..." />;
  }

  if (controller.effectiveStatus === "sampling_pending") {
    const queuePosition = controller.samplingQueuePosition;
    const samplingMessage =
      typeof queuePosition === "number" && queuePosition > 0
        ? `Queued for sampling — ${queuePosition} task${queuePosition === 1 ? "" : "s"} ahead of you. This can take a few minutes; the page updates automatically.`
        : "Sampling is in progress. This page updates automatically.";
    return <LoadingStatus isLight={isLight} message={samplingMessage} />;
  }

  if (controller.effectiveStatus === "sampling_error") {
    return (
      <ErrorStatus
        isLight={isLight}
        message={controller.samplingErrorMsg || "Sampling failed for this task."}
        onGoHome={controller.goHome}
      />
    );
  }

  if (!controller.task || !controller.isReady) {
    return (
      <ErrorStatus
        isLight={isLight}
        message="No data available for annotation"
        onGoHome={controller.goHome}
      />
    );
  }

  return (
    <Box
      className={styles.page}
      style={{ height: "100dvh", overflowX: "hidden", display: "flex", flexDirection: "column" }}
    >
      <div className={styles.orbOne} />
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)}>
      <Container fluid className={styles.hero}>
        <StepTrackerBanner currentStep={controller.isCompleteStep ? 3 : 2} activeSteps={[controller.isCompleteStep ? 3 : 2]} onHelp={controller.handleHelp} />
        <Paper className={styles.taskHeader} radius="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <div className={styles.taskInfo}>
              <Text className={styles.taskTitle} lineClamp={1}>
                Codebook Creation Task: {controller.task.name}
              </Text>
              <Text className={styles.taskDescription} lineClamp={2}>
                {controller.task.description}
              </Text>
            </div>
            <GuidedTourStep
              order={0}
              position="bottom"
              title="Evaluation bar"
              description="Track quality as you go: the first circle is F1 on the examples you've reviewed so far; the second is F1 on the held-out validation set once you run an evaluation. Click 'Run eval on full validation set' any time to score the current codebook."
            >
            <Group gap="xs" className={styles.taskMetrics} wrap="nowrap">
              {showRunEvalButton && (
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  disabled={controller.isRunningValEval}
                  onClick={() => controller.handleRunValEval()}
                >
                  {controller.isRunningValEval
                    ? controller.valEvalProgress.total > 0
                      ? `${controller.valEvalProgress.completed} / ${controller.valEvalProgress.total}`
                      : "Starting..."
                    : "Run eval on full validation set"}
                </Button>
              )}
              <Tooltip
                label={`F1 on annotated examples so far${controller.annotatedMetrics ? ` (${controller.annotatedMetrics.count} reviewed)` : ""}`}
              >
                <Badge
                  variant="filled"
                  color={
                    controller.annotatedMetrics === null
                      ? "gray"
                      : controller.annotatedMetrics.f1 > 0.8
                        ? "green"
                        : "orange"
                  }
                  size="xl"
                  fz="xs"
                  circle
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  {controller.annotatedMetrics === null
                    ? "—"
                    : Math.round(controller.annotatedMetrics.f1 * 100)}
                </Badge>
                
              </Tooltip>
              <IconArrowRight size={12} color="hsl(0, 0%, 40%)"/>
              <Tooltip
                label={
                  controller.predictedAccuracy === null
                    ? "F1 on held-out validation set — run eval on the full validation set to populate"
                    : "F1 on held-out validation set"
                }
              >
                <Badge
                  variant="outline"
                  color={
                    controller.predictedAccuracy === null
                      ? "gray"
                      : controller.predictedAccuracy > 0.8
                        ? "green"
                        : "orange"
                  }
                  size="xl"
                  fz="xs"
                  circle
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  {controller.predictedAccuracy === null
                    ? "—"
                    : Math.round(controller.predictedAccuracy * 100)}
                </Badge>
              </Tooltip>
            </Group>
            </GuidedTourStep>
          </Group>
        </Paper>
      </Container>

      <Container fluid className={styles.tableSection}>
        <MetricsModal
          opened={controller.metricsModalOpen}
          isLight={isLight}
          files={controller.metricsFiles}
          onClose={() => controller.setMetricsModalOpen(false)}
          onDownload={controller.handleDownloadMetrics}
          onExportCodebook={controller.handleExportCodebookFromModal}
          taskId={controller.task?._id}
          valMetrics={controller.valMetrics}
          isRunningValEval={controller.isRunningValEval}
          valEvalProgress={controller.valEvalProgress}
          finalInferencePhase={controller.finalInferencePhase}
          finalInferenceProgress={controller.finalInferenceProgress}
          finalLabeledRowCount={controller.finalLabeledRows.length}
          finalInferenceHasResult={controller.finalInferenceHasResult}
          onRunFinalInference={controller.handleRunFinalInference}
          onDownloadFinalInference={controller.handleDownloadFinalInference}
        />

        <ConfirmActionModal
          opened={exitConfirmOpen}
          title="Exit review?"
          message="You'll skip the remaining samples and finish now. We'll finalize your codebook and compute final metrics as if you'd reviewed the whole set. You can't resume this review afterward."
          confirmLabel="Exit & finish"
          cancelLabel="Keep reviewing"
          loading={exiting}
          onConfirm={async () => {
            setExiting(true);
            try {
              await controller.handleExitReview();
              setExitConfirmOpen(false);
            } finally {
              setExiting(false);
            }
          }}
          onCancel={() => {
            if (!exiting) setExitConfirmOpen(false);
          }}
        />

        <PageIntro
          mode={controller.introShowCheckbox ? "firstRun" : "help"}
          opened={isDemo ? false : controller.introOpen}
          onClose={controller.handleCloseIntro}
          title="Step 2: AI annotation review"
          description="Review AI suggestions, mark them correct or incorrect, and add feedback to refine the live codebook. This step prepares the final guidance."
          storageKey="hideStep5Intro"
          showSecondaryAction={true}
          skipLabel="Got it"
          startLabel="Start tour"
          showDontShowAgain={controller.introShowCheckbox}
          dontShowAgainChecked={controller.introDontShow}
          onDontShowAgainChange={controller.setIntroDontShow}
          onSkip={controller.handleCloseIntro}
          onStart={() => { controller.handleCloseIntro(); setTourOpen(true); }}
        />

            <Grid gutter="md" align="stretch" className={styles.annotationGrid}>
              <Grid.Col span={{ base: 12, md: 8 }} h="100%" className={styles.mainColumn}>
                <GuidedTourStep order={1} position="bottom" title="Batch Progress" description="Each batch contains ~10 samples. You review and mark each as correct or incorrect. After completing the batch, click 'Commit Batch' to synthesize rules.">
                  <Paper radius="lg" bg={surface}>
                    <Stack p="md" gap="md" style={{ overflow: "auto" }}>
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <BatchProgressSection
                          isLight={isLight}
                          mutedColor={mutedColor}
                          surface={surface}
                          surface2={surface2}
                          surface3={surface3}
                          borderColor={borderColor}
                          borderStrong={borderStrong}
                          isLoading={controller.isLoading}
                          currentBatchProgress={controller.currentBatchProgress}
                          actualBatchSize={controller.actualBatchSize}
                          currentIndex={controller.currentIndex}
                          totalSamples={controller.totalSamples}
                        />

                        <Group gap="xs" wrap="nowrap">
                          {controller.readOnly ? (
                            <Button
                              variant="filled"
                              size="sm"
                              onClick={controller.handleNextOrCommit}
                            >
                              View results
                            </Button>
                          ) : (
                            <>
                              {!controller.isCompleteStep && (
                                <GuidedTourStep
                                  order={6}
                                  position="bottom"
                                  title="Finish early"
                                  description="Don't want to review every sample? Click Exit to wrap up now — we'll finalize your codebook and compute the final metrics as if you'd reviewed the whole set."
                                >
                                  <Button
                                    variant="subtle"
                                    color="red"
                                    size="sm"
                                    onClick={() => setExitConfirmOpen(true)}
                                    disabled={controller.isLoading || exiting}
                                  >
                                    Exit
                                  </Button>
                                </GuidedTourStep>
                              )}
                              <Button
                                variant="default"
                                size="sm"
                                onClick={controller.goPrev}
                                disabled={controller.currentIndex <= controller.currentBatchStartIndex || controller.isLoading}
                              >
                                Previous
                              </Button>
                              <Button
                                variant="filled"
                                size="sm"
                                onClick={controller.handleNextOrCommit}
                                disabled={controller.nextDisabled}
                              >
                                {controller.isCompleteStep ? "Complete" : controller.isCommitStep ? "Commit Batch" : "Next Sample"}
                              </Button>
                            </>
                          )}
                        </Group>
                      </Group>

                      <GuidedTourStep order={2} position="bottom" title="Sample Text" description="This is the social media post you are reviewing. The AI model analyzed this text to generate the predictions shown below.">
                        <SampleTextSection
                          isLight={isLight}
                          mutedColor={mutedColor}
                          surface={surface}
                          surface2={surface2}
                          surface3={surface3}
                          borderColor={borderColor}
                          borderStrong={borderStrong}
                          isLoading={controller.isLoading}
                          currentSampleText={controller.currentSampleText}
                        />
                      </GuidedTourStep>

                      <GuidedTourStep order={3} position="bottom" title="AI Predictions" description="Review the model's suggested labels, key text span, and reasoning. Mark whether the prediction is correct or incorrect.">
                        <AIPredictionsSection
                          isLight={isLight}
                          mutedColor={mutedColor}
                          surface={surface}
                          surface2={surface2}
                          surface3={surface3}
                          borderColor={borderColor}
                          borderStrong={borderStrong}
                          isLoading={controller.isLoading}
                          readOnly={controller.readOnly}
                          generatedLabels={controller.generatedLabels}
                          generatedSpanText={controller.generatedSpanText}
                          generatedReasoning={controller.generatedReasoning}
                          batchResult={controller.batchResults[controller.currentIndex]}
                          spanTextFeedback={controller.spanTextFeedback}
                          reasoningFeedback={controller.reasoningFeedback}
                          onSetCorrect={controller.setCurrentCorrect}
                          onSetSpanFeedback={controller.setSpanTextFeedback}
                          onSetReasoningFeedback={controller.setReasoningFeedback}
                        />
                      </GuidedTourStep>

                      <GuidedTourStep order={4} position="bottom" title="Provide Feedback" description="When the AI prediction is incorrect, specify the correct label and provide feedback. This helps the rule synthesizer learn from mistakes.">
                        <FeedbackSection
                          isLight={isLight}
                          mutedColor={mutedColor}
                          surface={surface}
                          surface2={surface2}
                          surface3={surface3}
                          borderColor={borderColor}
                          borderStrong={borderStrong}
                          isLoading={controller.isLoading}
                          readOnly={controller.readOnly}
                          batchResult={controller.batchResults[controller.currentIndex]}
                          spanTextFeedback={controller.spanTextFeedback}
                          reasoningFeedback={controller.reasoningFeedback}
                          labels={controller.task.labels || []}
                          onSetCorrectLabel={controller.setCurrentCorrectLabel}
                          onSetFeedback={controller.setCurrentFeedback}
                        />
                      </GuidedTourStep>
                    </Stack>
                  </Paper>
                </GuidedTourStep>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 4 }} h="100%" className={styles.sidebarColumn}>
                <GuidedTourStep
                  order={5}
                  position="bottom"
                  title="Live Codebook"
                  description="The codebook builds dynamically as you review samples. After committing a batch, new rules are synthesized and added here to guide future predictions."
                >
                  <CodebookPanel
                    isLight={isLight}
                    mutedColor={mutedColor}
                    surface={surface}
                    panelBg={panelBg}
                    borderColor={borderColor}
                    codebook={controller.codebook}
                    stagedRules={controller.stagedRules}
                    stagedRulesDeletion={controller.stagedRulesDeletion}
                    newRule={controller.newRule}
                    readOnly={controller.readOnly}
                    onNewRuleChange={controller.setNewRule}
                    onAddRule={controller.addRule}
                    onExport={controller.handleExportCodebook}
                    onEditRule={controller.editRule}
                    onToggleDeleteRule={controller.toggleDeleteRule}
                    onRemoveStagedRule={controller.removeStagedRule}
                  />
                </GuidedTourStep>
              </Grid.Col>
            </Grid>
      </Container>
      </GuidedTour>
    </Box>
  );
}
