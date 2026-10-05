import { InferenceRequest, InferenceResponse } from "@common/types/inference";
import { AnnotationItem } from "@common/types/annotations";
import { Task } from "@common/types/tasks";
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../../lib/toast";
import { updateGuideAnnotation } from "../../../services/annotations.service";
import { inference } from "../../../services/inference.service";
import { v4 as uuidv4 } from "uuid";
import {
  BATCH_SIZE,
  GENERATING_LABELS,
  GENERATING_REASONING,
  GENERATING_SPAN,
  INITIAL_GENERATED_PLACEHOLDER,
  INITIAL_LABELS,
} from "../constants";
import { AIAssisted, BatchResults, SampleStarts } from "../types";
import { diffCodebook, getSampleText, hasFeedbackChanged, isFeedbackComplete, normalizeAI } from "../utils";

interface UseAnnotationReviewFlowArgs {
  task: Task | null;
  guideAnnotations: AnnotationItem[];
  codebook: string[];
  getCodebookSnapshot: () => string[];
  setLastPromptUsed: Dispatch<SetStateAction<string>>;
  reviewEnabled: boolean;
}

export function useAnnotationReviewFlow({
  task,
  guideAnnotations,
  codebook,
  getCodebookSnapshot,
  setLastPromptUsed,
  reviewEnabled,
}: UseAnnotationReviewFlowArgs) {
  const [localGuideAnnotations, setLocalGuideAnnotations] = useState(guideAnnotations || []);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLabels, setGeneratedLabels] = useState<string[]>(INITIAL_LABELS);
  const [generatedSpanText, setGeneratedSpanText] = useState<string>(INITIAL_GENERATED_PLACEHOLDER);
  const [generatedReasoning, setGeneratedReasoning] = useState<string>(INITIAL_GENERATED_PLACEHOLDER);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentBatchUUID, setCurrentBatchUUID] = useState("");

  const [spanTextFeedback, setSpanTextFeedback] = useState<boolean>();
  const [reasoningFeedback, setReasoningFeedback] = useState<boolean>();
  const [batchResults, setBatchResults] = useState<BatchResults>({});

  const sampleStartsRef = useRef<SampleStarts>({});
  const skipInferenceRef = useRef(false);
  const resumeInitializedRef = useRef(false);
  const prevTaskIdRef = useRef<string | null>(null);

  const batchSize = BATCH_SIZE;
  const annotationsForReview = useMemo(() => (localGuideAnnotations.length > 0 ? localGuideAnnotations : []), [localGuideAnnotations]);
  const totalSamples = annotationsForReview.length;
  const currentBatchIndex = Math.floor(currentIndex / batchSize);

  const currentAnnotation =
    annotationsForReview.length > 0 && currentIndex > -1 ? annotationsForReview[currentIndex] : null;
  const currentSample = currentAnnotation?.sampleContent ?? null;

  const currentSampleText =
    getSampleText(
      currentSample as Record<string, string> | null,
      task?.columns?.[0],
    ) || "No text available";

  const actualBatchSize = Math.min(
    batchSize,
    totalSamples - Math.floor(currentIndex / batchSize) * batchSize,
  );
  const totalBatches = Math.ceil(totalSamples / batchSize);
  const currentBatchProgress = (currentIndex % batchSize) + 1;
  const isLastBatch = currentBatchIndex === totalBatches - 1 && currentBatchProgress === actualBatchSize;
  const currentBatchStartIndex = currentBatchIndex * batchSize;
  const currentResult = batchResults[currentIndex];
  const needsFeedback =
    currentResult?.isCorrect === false ||
    spanTextFeedback === false ||
    reasoningFeedback === false;

  const nextDisabled =
    isLoading ||
    currentResult?.isCorrect == null ||
    (currentResult?.isCorrect === false && !currentResult?.correctLabel) ||
    (needsFeedback && !currentResult?.feedback?.trim()) ||
    spanTextFeedback === undefined ||
    reasoningFeedback === undefined;

  const resetAISuggestion = () => {
    setGeneratedLabels(GENERATING_LABELS);
    setGeneratedSpanText(GENERATING_SPAN);
    setGeneratedReasoning(GENERATING_REASONING);
  };

  useEffect(() => {
    setLocalGuideAnnotations(guideAnnotations || []);
  }, [guideAnnotations]);

  useEffect(() => {
    resumeInitializedRef.current = false;
    setCurrentIndex(0);
  }, [task?._id]);

  useEffect(() => {
    if (resumeInitializedRef.current || annotationsForReview.length === 0) return;

    let lastWithInferenceIndex = -1;
    for (let i = 0; i < annotationsForReview.length; i += 1) {
      if (annotationsForReview[i]?.aiAnnotation) lastWithInferenceIndex = i;
    }

    if (lastWithInferenceIndex === -1) {
      setCurrentIndex(0);
      resumeInitializedRef.current = true;
      return;
    }

    const lastAi = normalizeAI(
      annotationsForReview[lastWithInferenceIndex]?.aiAnnotation as Partial<AIAssisted> | null | undefined,
      task?._id,
    );
    const nextIndex = isFeedbackComplete(lastAi)
      ? Math.min(lastWithInferenceIndex + 1, annotationsForReview.length - 1)
      : lastWithInferenceIndex;

    setCurrentIndex(nextIndex);
    resumeInitializedRef.current = true;
  }, [annotationsForReview, task?._id]);

  useEffect(() => {
    setCurrentBatchUUID(uuidv4());
  }, [currentBatchIndex]);

  useEffect(() => {
    const nextTaskId = task?._id ?? null;
    if (!nextTaskId || prevTaskIdRef.current === nextTaskId) return;

    prevTaskIdRef.current = nextTaskId;
    setBatchResults({});
    sampleStartsRef.current = {};
    setCurrentIndex(0);
    setGeneratedLabels(INITIAL_LABELS);
    setGeneratedSpanText(INITIAL_GENERATED_PLACEHOLDER);
    setGeneratedReasoning(INITIAL_GENERATED_PLACEHOLDER);
    setSpanTextFeedback(undefined);
    setReasoningFeedback(undefined);
  }, [task?._id]);

  const handleClickAnnotation = useCallback(async (): Promise<boolean> => {
    if (!currentSample || !currentAnnotation || !task?._id) return false;

    const finalText = getSampleText(currentSample as Record<string, string>, task?.columns?.[0]);
    if (!finalText) return false;

    setIsLoading(true);

    const payload: InferenceRequest = {
      labels: task?.labels || [],
      task_definition: task?.description || "",
      text: finalText,
      model_name: task?.modelName || "mistral:7b",
      task_type: "annotation",
      user_input: codebook.join("\n"),
    };

    try {
      const response: InferenceResponse = await inference(payload);
      const aiResult: AIAssisted = {
        taskID: task?._id ?? null,
        batchID: currentBatchUUID,
        batchNum: currentBatchIndex + 1,
        label: response.label,
        reason: response.reason,
        span_text: response.span_text,
        isCorrect: null,
        feedback: "",
        spanFeedback: null,
        reasoningFeedback: null,
        correctLabel: null,
        predictionRaw: response.raw_response ?? null,
        timeToCompleteMs: null,
        codebookSnapshot: [],
        guidelinesAdded: [],
        guidelinesDeprecated: [],
        guidelinesRevised: [],
      };

      sampleStartsRef.current[currentIndex] = {
        startedAt: Date.now(),
        codebook: getCodebookSnapshot(),
      };

      setBatchResults((prev) => ({ ...prev, [currentIndex]: aiResult }));
      setGeneratedLabels(response.label);
      setGeneratedSpanText(response.span_text);
      setGeneratedReasoning(response.reason);

      if (response.system_prompt || response.user_prompt) {
        const systemPrompt = response.system_prompt || "";
        const userPrompt = response.user_prompt || "";
        setLastPromptUsed(`${systemPrompt}\n\n${userPrompt}`.trim());
      }

      await updateGuideAnnotation({
        taskId: task._id,
        sampleId: currentAnnotation.sampleId,
        sampleContent: currentSample as Record<string, string>,
        source: "guide",
        labels: currentAnnotation.labels || [],
        aiAnnotation: aiResult,
      });

      setLocalGuideAnnotations((prev) =>
        prev.map((annotation) =>
          annotation.sampleId === currentAnnotation.sampleId
            ? { ...annotation, aiAnnotation: aiResult }
            : annotation,
        ),
      );

      return true;
    } catch (error) {
      console.error("Inference failed:", error);
      toast.error("Something went wrong, please try again");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    codebook,
    currentAnnotation,
    currentBatchIndex,
    currentBatchUUID,
    currentIndex,
    currentSample,
    getCodebookSnapshot,
    setLastPromptUsed,
    task,
  ]);

  useEffect(() => {
    if (!reviewEnabled || !annotationsForReview.length || currentIndex >= annotationsForReview.length) return;

    if (skipInferenceRef.current) {
      skipInferenceRef.current = false;
      return;
    }

    const existingAi = normalizeAI(
      annotationsForReview[currentIndex]?.aiAnnotation as Partial<AIAssisted> | null | undefined,
      task?._id,
    );

    if (annotationsForReview[currentIndex]?.aiAnnotation) {
      setGeneratedLabels(existingAi.label.length > 0 ? existingAi.label : INITIAL_LABELS);
      setGeneratedSpanText(existingAi.span_text || INITIAL_GENERATED_PLACEHOLDER);
      setGeneratedReasoning(existingAi.reason || INITIAL_GENERATED_PLACEHOLDER);
      setSpanTextFeedback(existingAi.spanFeedback ?? undefined);
      setReasoningFeedback(existingAi.reasoningFeedback ?? undefined);
      setBatchResults((prev) => ({
        ...prev,
        [currentIndex]: {
          ...existingAi,
          batchNum: existingAi.batchNum ?? currentBatchIndex + 1,
        },
      }));
      sampleStartsRef.current[currentIndex] = {
        startedAt: Date.now(),
        codebook: getCodebookSnapshot(),
      };
      return;
    }

    resetAISuggestion();
    setSpanTextFeedback(undefined);
    setReasoningFeedback(undefined);

    const runInference = async () => {
      const ok = await handleClickAnnotation();
      if (!ok && currentIndex > 0) {
        skipInferenceRef.current = true;
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
      }
    };
    void runInference();
  }, [annotationsForReview, currentBatchIndex, currentIndex, handleClickAnnotation, task?._id, getCodebookSnapshot, reviewEnabled]);

  const handleNextClick = async () => {
    try {
      const currentAIResult = batchResults[currentIndex];
      if (currentAIResult && task?._id && currentSample && currentAnnotation) {
        const startSnapshot = sampleStartsRef.current[currentIndex];
        const endCodebook = getCodebookSnapshot();
        const { added, deprecated, revised } = diffCodebook(startSnapshot?.codebook ?? [], endCodebook);
        const timeToCompleteMs = startSnapshot ? Date.now() - startSnapshot.startedAt : null;

        const enrichedAIResult: AIAssisted = {
          ...currentAIResult,
          batchNum: currentAIResult.batchNum ?? currentBatchIndex + 1,
          timeToCompleteMs,
          spanFeedback: spanTextFeedback ?? null,
          reasoningFeedback: reasoningFeedback ?? null,
          codebookSnapshot: endCodebook,
          guidelinesAdded: added,
          guidelinesDeprecated: deprecated,
          guidelinesRevised: revised,
        };

        const resolvedLabels =
          enrichedAIResult.isCorrect === false && enrichedAIResult.correctLabel
            ? [enrichedAIResult.correctLabel]
            : enrichedAIResult.label;

        setBatchResults((prev) => ({ ...prev, [currentIndex]: enrichedAIResult }));

        const existingAi = currentAnnotation.aiAnnotation
          ? normalizeAI(currentAnnotation.aiAnnotation as Partial<AIAssisted>, task._id)
          : null;

        const shouldUpdateGuide = hasFeedbackChanged(
          existingAi,
          enrichedAIResult,
          currentAnnotation.labels || [],
          resolvedLabels,
        );

        if (shouldUpdateGuide) {
          await updateGuideAnnotation({
            taskId: task._id,
            sampleId: currentAnnotation.sampleId,
            sampleContent: currentSample as Record<string, string>,
            source: "guide",
            labels: resolvedLabels,
            aiAnnotation: enrichedAIResult,
          });

          setLocalGuideAnnotations((prev) =>
            prev.map((annotation) =>
              annotation.sampleId === currentAnnotation.sampleId
                ? {
                    ...annotation,
                    labels: resolvedLabels,
                    aiAnnotation: enrichedAIResult,
                  }
                : annotation,
            ),
          );
        }
      }
    } catch (error) {
      console.error("Failed to update guide annotation:", error);
      toast.error("Failed to save annotation feedback.");
    }

    if (currentIndex < totalSamples - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Keep focus on last sample after completion to avoid an empty n+1/n state.
      setCurrentIndex(Math.max(totalSamples - 1, 0));
    }
  };

  const setCurrentCorrect = (value: boolean) => {
    setBatchResults((prev) => ({
      ...prev,
      [currentIndex]: {
        ...prev[currentIndex],
        isCorrect: value,
        correctLabel:
          value === true
            ? prev[currentIndex]?.label?.[0] ?? generatedLabels?.[0] ?? null
            : prev[currentIndex]?.correctLabel ?? null,
      },
    }));
  };

  const setCurrentCorrectLabel = (label: string | null) => {
    setBatchResults((prev) => ({
      ...prev,
      [currentIndex]: {
        ...prev[currentIndex],
        correctLabel: label,
      },
    }));
  };

  const setCurrentFeedback = (feedback: string) => {
    setBatchResults((prev) => ({
      ...prev,
      [currentIndex]: {
        ...prev[currentIndex],
        feedback,
      },
    }));
  };

  const goPrev = () => setCurrentIndex((prev) => Math.max(prev - 1, currentBatchStartIndex));

  return {
    localGuideAnnotations,
    annotationsForReview,
    isLoading,
    setIsLoading,
    generatedLabels,
    generatedSpanText,
    generatedReasoning,
    currentIndex,
    totalSamples,
    currentSample,
    currentAnnotation,
    currentSampleText,
    batchResults,
    setBatchResults,
    spanTextFeedback,
    setSpanTextFeedback,
    reasoningFeedback,
    setReasoningFeedback,
    batchSize,
    currentBatchIndex,
    currentBatchProgress,
    actualBatchSize,
    currentBatchStartIndex,
    isLastBatch,
    nextDisabled,
    sampleStartsRef,
    handleNextClick,
    setCurrentCorrect,
    setCurrentCorrectLabel,
    setCurrentFeedback,
    goPrev,
  };
}
