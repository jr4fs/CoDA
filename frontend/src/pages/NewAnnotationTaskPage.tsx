import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  Group,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBook2,
  IconBraces,
  IconDownload,
  IconFileTypeCsv,
  IconSparkles,
  IconUpload,
} from "@tabler/icons-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StepTrackerBanner from "../components/StepTrackerBanner";
import GuidedTour, { GuidedTourStep } from "../components/common/GuidedTour";
import PageIntro, { usePageIntroTour } from "../components/common/PageIntro";
import {
  LABELS_TEMPLATE,
  TASK_TEMPLATE,
  modelOptions,
} from "../constants/datasetUpload.constants";
import { toast } from "../lib/toast";
import {
  completeAutoLabelTask,
  downloadAnnotationOutputFile,
  getAutoLabelProgress,
  getTaskById,
  startAutoLabelJob,
  uploadFile,
  uploadOutputFile,
} from "../services/tasks.service";
import { downloadContent } from "../utils/downloadContent";
import styles from "./DatasetUploadPage.module.css";

interface AnnotationTaskConfig {
  selectedModel: string | null;
  textColumn: string;
}

const defaultConfig: AnnotationTaskConfig = {
  selectedModel: "qwen:32b",
  textColumn: "translated_text",
};

const CODEBOOK_TEMPLATE = `# Codebook
If text indicates positive sentiment, label as positive.
If text indicates negative sentiment, label as negative.
If text does not fit any defined category, label as not relevant.
`;

interface RequiredFileCardProps {
  inputId: string;
  accept: string;
  icon: ReactNode;
  label: string;
  selectLabel: string;
  hint: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  templateAction?: {
    label: string;
    onClick: () => void;
  };
}

function RequiredFileCard({
  inputId,
  accept,
  icon,
  label,
  selectLabel,
  hint,
  file,
  onFileChange,
  templateAction,
}: RequiredFileCardProps) {
  return (
    <div className={styles.fileRow}>
      <input
        id={inputId}
        className={styles.fileInput}
        type="file"
        accept={accept}
        onChange={(event) => onFileChange(event.currentTarget.files?.[0] || null)}
      />
      <Group justify="space-between" w="100%" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          {icon}
          <Text fw={600} className={styles.fileLabel}>
            {label}
          </Text>
        </Group>
        <label htmlFor={inputId} className={styles.fileButton}>
          <IconUpload size={14} />
          {selectLabel}
        </label>
      </Group>
      <Text size="xs" className={styles.fileHint}>
        {hint}
      </Text>
      {templateAction ? (
        <Group className={styles.fileMetaRow} wrap="nowrap">
          <Text
            size="xs"
            className={`${styles.fileName} ${
              file ? styles.fileNameSelected : styles.fileNameMissing
            }`}
          >
            {file ? file.name : "No file selected"}
          </Text>
          <Button
            size="compact-xs"
            variant="light"
            className={styles.fileTemplateButton}
            onClick={templateAction.onClick}
          >
            {templateAction.label}
          </Button>
        </Group>
      ) : (
        <Text
          size="xs"
          className={`${styles.fileName} ${
            file ? styles.fileNameSelected : styles.fileNameMissing
          }`}
        >
          {file ? file.name : "No file selected"}
        </Text>
      )}
    </div>
  );
}

function parseTaskJson(raw: string): {
  name: string;
  description: string;
  type: "Multiclass" | "Single-class";
} {
  const parsed = JSON.parse(raw) as {
    taskname?: string;
    taskName?: string;
    name?: string;
    description?: string;
    type?: string;
  };

  const name = parsed.taskname || parsed.taskName || parsed.name || "";
  const description = parsed.description || "";
  const type: "Multiclass" | "Single-class" =
    parsed.type === "Single-class" ? "Single-class" : "Multiclass";

  if (!name.trim() || !description.trim()) {
    throw new Error("Task JSON must include taskname/name and description.");
  }

  return {
    name: name.trim(),
    description: description.trim(),
    type,
  };
}

function parseLabelsJson(raw: string) {
  const parsed = JSON.parse(raw) as {
    labels?: Array<{
      name?: string;
      description?: string;
      keywords?: string[];
      guidelines?: unknown;
    }>;
  };

  const labels = Array.isArray(parsed.labels) ? parsed.labels : [];
  if (labels.length === 0) {
    throw new Error("Labels JSON must include a non-empty labels array.");
  }

  return labels.map((label, index) => {
    const name = label.name?.trim() || "";
    const definition = label.description?.trim() || "";
    const keywords = Array.isArray(label.keywords)
      ? label.keywords.map((kw) => kw.trim()).filter(Boolean)
      : [];
    const guidelines = Array.isArray(label.guidelines)
      ? label.guidelines
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
          .join("\n")
      : typeof label.guidelines === "string"
        ? label.guidelines.trim()
        : undefined;

    if (!name || !definition || keywords.length === 0) {
      throw new Error(
        `Label ${index + 1} must include name, description, and keywords.`,
      );
    }

    return {
      name,
      definition,
      keywords,
      ...(guidelines ? { guidelines } : {}),
    };
  });
}

type LabelingPhase = "idle" | "running" | "done" | "error";

export default function NewAnnotationTaskPage() {
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === "light";

  const [unlabeledFile, setUnlabeledFile] = useState<File | null>(null);
  const [codebookFile, setCodebookFile] = useState<File | null>(null);
  const [taskJsonFile, setTaskJsonFile] = useState<File | null>(null);
  const [labelsJsonFile, setLabelsJsonFile] = useState<File | null>(null);
  const [config, setConfig] = useState<AnnotationTaskConfig>(defaultConfig);
  const [error, setError] = useState<string | null>(null);

  const [labelingPhase, setLabelingPhase] = useState<LabelingPhase>("idle");
  const [labelingProgress, setLabelingProgress] = useState({ completed: 0, total: 0 });
  const [labeledRows, setLabeledRows] = useState<Array<Record<string, string>>>([]);
  const [labelingError, setLabelingError] = useState<string | null>(null);
  const [completedTaskOutputFile, setCompletedTaskOutputFile] = useState<string | null>(null);
  const [completedTaskName, setCompletedTaskName] = useState<string | null>(null);

  // Load task state when navigating to /new-annotation/:taskId (including after page reload)
  useEffect(() => {
    if (!taskId) return;
    getTaskById(taskId).then((res) => {
      const task = res?.task ?? res;
      if (!task) return;
      setConfig((prev) => ({
        ...prev,
        ...(task.modelName ? { selectedModel: task.modelName } : {}),
        ...(task.labelColumn ? { textColumn: task.labelColumn } : {}),
      }));
      if (task.status === "auto_label_complete" && task.outputFile) {
        setCompletedTaskOutputFile(task.outputFile);
        setCompletedTaskName(task.name ?? null);
        setLabelingPhase("done");
      } else if (task.status === "auto_labeling") {
        setCompletedTaskName(task.name ?? null);
        setLabelingPhase("running");
      }
    }).catch(() => {});
  }, [taskId]);

  // Poll Python backend for progress while a job is running
  useEffect(() => {
    if (!taskId || labelingPhase !== "running") return;

    const intervalId = setInterval(() => {
      void (async () => {
        try {
          const progress = await getAutoLabelProgress(taskId);
          setLabelingProgress({ completed: progress.completed, total: progress.total });

          if (progress.done) {
            clearInterval(intervalId);

            if (progress.error) {
              setLabelingError(progress.error);
              setLabelingPhase("error");
              return;
            }

            const labeled = progress.rows ?? [];
            if (labeled.length > 0) {
              function csvEscape(val: string): string {
                if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
                return val;
              }
              const headers = Object.keys(labeled[0]);
              const csvLines = [
                headers.join(","),
                ...labeled.map((r) => headers.map((h) => csvEscape(r[h] ?? "")).join(",")),
              ];
              const csvBlob = new Blob([csvLines.join("\n")], { type: "text/csv" });
              const outputFile = new File([csvBlob], `labeled_${taskId}.csv`, { type: "text/csv" });
              try {
                const upload = await uploadOutputFile(outputFile, taskId);
                if (upload.success && upload.filePath) {
                  await completeAutoLabelTask(taskId, upload.filePath);
                  setCompletedTaskOutputFile(upload.filePath);
                }
              } catch (uploadErr) {
                console.error("[auto-label] Failed to save output:", uploadErr);
              }
              setLabeledRows(labeled);
            }

            setLabelingPhase("done");
            window.dispatchEvent(new Event("tasks:updated"));
            toast.success("Auto-labeling complete.");
          }
        } catch {
          // Ignore transient poll errors — keep polling
        }
      })();
    }, 1500);

    return () => clearInterval(intervalId);
  }, [taskId, labelingPhase]);

  const {
    introOpen,
    introMode,
    tourOpen,
    setIntroOpen,
    setTourOpen,
    openHelpIntro,
  } = usePageIntroTour("hideNewAnnotationIntro");

  const isReady = Boolean(
    unlabeledFile &&
      codebookFile &&
      taskJsonFile &&
      labelsJsonFile &&
      config.selectedModel &&
      config.textColumn,
  );

  const dividerColor = isLight
    ? "rgba(15, 20, 24, 0.12)"
    : "rgba(255, 255, 255, 0.08)";

  const setConfigField = useCallback(
    <K extends keyof AnnotationTaskConfig>(key: K, value: AnnotationTaskConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setUnlabeledFile(null);
    setCodebookFile(null);
    setTaskJsonFile(null);
    setLabelsJsonFile(null);
    setConfig(defaultConfig);
    setError(null);
    setLabelingPhase("idle");
    setLabelingProgress({ completed: 0, total: 0 });
    setLabeledRows([]);
    setLabelingError(null);
    setCompletedTaskOutputFile(null);
    setCompletedTaskName(null);
  }, []);

  const handleAutoLabel = useCallback(async () => {
    if (
      !unlabeledFile ||
      !codebookFile ||
      !taskJsonFile ||
      !labelsJsonFile ||
      !config.selectedModel ||
      !config.textColumn
    ) {
      setError("Please provide all required files and task config fields.");
      return;
    }

    setError(null);
    setLabelingError(null);

    try {
      const [taskRaw, labelsRaw, codebookRaw, uploadResult] = await Promise.all([
        taskJsonFile.text(),
        labelsJsonFile.text(),
        codebookFile.text(),
        uploadFile(unlabeledFile),
      ]);

      if (!uploadResult.success || !uploadResult.filePath) {
        throw new Error(uploadResult.message ?? "Failed to upload dataset.");
      }

      const task = parseTaskJson(taskRaw);
      const labels = parseLabelsJson(labelsRaw);
      const codebook = codebookRaw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

      const result = await startAutoLabelJob({
        name: task.name,
        description: task.description,
        type: task.type,
        labels,
        codebook,
        inputFileName: unlabeledFile.name,
        filePath: uploadResult.filePath,
        modelName: config.selectedModel,
        taskJsonRaw: taskRaw,
        labelsJsonRaw: labelsRaw,
        textColumn: config.textColumn,
      });

      if (!result.success || !result.taskId) {
        throw new Error(result.message ?? "Failed to start auto-label job.");
      }

      navigate(`/new-annotation/${result.taskId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start auto-labeling.";
      setError(msg);
    }
  }, [
    codebookFile,
    config.selectedModel,
    config.textColumn,
    labelsJsonFile,
    navigate,
    taskJsonFile,
    unlabeledFile,
  ]);

  const handleDownloadLabeled = useCallback(async () => {
    // If we have labeled rows in memory, do a client-side download
    if (labeledRows.length > 0) {
      const headers = Object.keys(labeledRows[0]);
      function csvEscapeVal(val: string): string {
        if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
        return val;
      }
      const csvLines = [
        headers.join(","),
        ...labeledRows.map((r) => headers.map((h) => csvEscapeVal(r[h] ?? "")).join(",")),
      ];
      const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `labeled_${unlabeledFile?.name ?? "dataset.csv"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    // Viewing an existing completed task — download from server
    if (completedTaskOutputFile) {
      try {
        const blob = await downloadAnnotationOutputFile(completedTaskOutputFile);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const filename = completedTaskOutputFile.split("/").pop() ?? "annotated.csv";
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Failed to download annotated file.");
      }
    }
  }, [labeledRows, unlabeledFile, completedTaskOutputFile]);

  return (
    <Box
      className={styles.page}
      style={{ minHeight: "100dvh", overflowX: "hidden", overflowY: "auto" }}
    >
      <div className={styles.orbOne} />
      <Container fluid className={styles.hero}>
        <StepTrackerBanner currentStep={1} onHelp={openHelpIntro} />
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title className={styles.title}>Create Annotation Task</Title>
        </Group>
        <Text className={styles.subtitle}>
          Upload your codebook, unlabeled dataset, and task definition files to
          start dataset annotation.
        </Text>
      </Container>

      <Container
        fluid
        className={styles.tableSection}
        style={{ height: "auto", overflow: "visible" }}
      >
        <PageIntro
          mode={introMode}
          opened={introOpen}
          onClose={() => setIntroOpen(false)}
          title="Create annotation task"
          description="Set model and columns, upload required files, and create a task ready for dataset annotation."
          storageKey="hideNewAnnotationIntro"
          onStart={() => setTourOpen(true)}
        />

        <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)}>
          <Stack gap="md">
            <Grid gutter="md" align="stretch">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Paper className={styles.dropCard} radius="lg" h="100%">
                  <Stack gap="sm">
                    <Title order={4} className={styles.tableTitle}>
                      Task config
                    </Title>
                    <Text size="sm" className={styles.tableMeta}>
                      Configure model and dataset columns before task creation.
                    </Text>
                    <Divider my={4} color={dividerColor} />
                    <Select
                      label="Model"
                      description="Choose the model to use for annotation."
                      placeholder="Select a model…"
                      value={config.selectedModel}
                      onChange={(value) => setConfigField("selectedModel", value)}
                      data={modelOptions}
                      classNames={{
                        label: styles.configLabel,
                        description: styles.configDescription,
                        input: styles.configInput,
                        dropdown: styles.configDropdown,
                      }}
                    />
                    <TextInput
                      label="Text column name"
                      description="Column in CSV that contains the text to annotate."
                      placeholder="e.g. text, translated_text, content…"
                      value={config.textColumn}
                      onChange={(event) =>
                        setConfigField("textColumn", event.currentTarget.value)
                      }
                      classNames={{
                        label: styles.configLabel,
                        description: styles.configDescription,
                        input: styles.configInput,
                      }}
                    />
                  </Stack>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 5 }}>
                <Paper className={styles.dropCard} radius="lg" h="100%">
                  <Stack gap="sm">
                    <Title order={4} className={styles.tableTitle}>
                      Required files
                    </Title>
                    <Text size="sm" className={styles.tableMeta}>
                      Upload one CSV, two JSON files, and a codebook text file.
                    </Text>
                    <Divider my={4} color={dividerColor} />

                    <GuidedTourStep
                      order={1}
                      title="Upload codebook file"
                      description="Provide a text file containing codebook rules."
                    >
                      <RequiredFileCard
                        inputId="codebook-txt"
                        accept=".txt,.md,text/plain,text/markdown"
                        icon={<IconBook2 size={18} />}
                        label="Codebook file"
                        selectLabel="Select file"
                        hint="Text or markdown file with one or more rules"
                        file={codebookFile}
                        onFileChange={setCodebookFile}
                        templateAction={{
                          label: "Download template",
                          onClick: () =>
                            downloadContent("codebook.txt", CODEBOOK_TEMPLATE),
                        }}
                      />
                    </GuidedTourStep>

                    <GuidedTourStep
                      order={2}
                      title="Upload unlabeled data"
                      description='The dataset to annotate. Must include the configured text column.'
                    >
                      <RequiredFileCard
                        inputId="annotate-unlabeled-dataset"
                        accept=".csv,text/csv"
                        icon={<IconFileTypeCsv size={18} />}
                        label="Unlabeled dataset"
                        selectLabel="Select CSV"
                        hint="CSV with text column for annotation"
                        file={unlabeledFile}
                        onFileChange={setUnlabeledFile}
                      />
                    </GuidedTourStep>

                    <GuidedTourStep
                      order={3}
                      title="Task details"
                      description="Provide task name and description in JSON."
                    >
                      <RequiredFileCard
                        inputId="annotate-task-json"
                        accept=".json,application/json"
                        icon={<IconBraces size={18} />}
                        label="Task details"
                        selectLabel="Select JSON"
                        hint="JSON with taskname + description"
                        file={taskJsonFile}
                        onFileChange={setTaskJsonFile}
                        templateAction={{
                          label: "Download template",
                          onClick: () => downloadContent("task.json", TASK_TEMPLATE),
                        }}
                      />
                    </GuidedTourStep>

                    <GuidedTourStep
                      order={4}
                      title="Labels JSON"
                      description="Provide label definitions and keywords."
                    >
                      <RequiredFileCard
                        inputId="annotate-labels-json"
                        accept=".json,application/json"
                        icon={<IconBraces size={18} />}
                        label="Label set"
                        selectLabel="Select JSON"
                        hint="JSON labels with name, description, keywords"
                        file={labelsJsonFile}
                        onFileChange={setLabelsJsonFile}
                        templateAction={{
                          label: "Download template",
                          onClick: () =>
                            downloadContent("labels.json", LABELS_TEMPLATE),
                        }}
                      />
                    </GuidedTourStep>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}

            <Group justify="space-between" mt={2}>
              <Button
                variant="light"
                className={styles.secondaryCta}
                onClick={handleReset}
              >
                Reset
              </Button>
              <GuidedTourStep
                order={5}
                title="Annotate dataset"
                description="Start automated annotation when all required files are selected."
                position="top"
              >
                <Button
                  className={styles.primaryCta}
                  leftSection={<IconSparkles size={18} />}
                  loading={labelingPhase === "running"}
                  disabled={!isReady || labelingPhase === "running"}
                  onClick={handleAutoLabel}
                >
                  Annotate dataset
                </Button>
              </GuidedTourStep>
            </Group>

            {labelingPhase !== "idle" && (
              <Paper className={styles.dropCard} radius="lg" mt="md">
                <Stack gap="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <Title order={5} className={styles.tableTitle}>
                        {completedTaskName ?? "Auto-labeling progress"}
                      </Title>
                      {completedTaskName && (
                        <Text size="xs" className={styles.tableMeta}>
                          Auto-annotation task
                        </Text>
                      )}
                    </Stack>
                    {labelingPhase === "done" && (
                      <Badge color="green" variant="light">
                        Complete
                      </Badge>
                    )}
                  </Group>
                  {labelingPhase === "running" && (
                    <>
                      <Text size="sm" className={styles.tableMeta}>
                        {labelingProgress.total > 0
                          ? `${labelingProgress.completed} / ${labelingProgress.total} samples annotated`
                          : "Starting…"}
                      </Text>
                      <Progress
                        value={
                          labelingProgress.total > 0
                            ? (labelingProgress.completed / labelingProgress.total) * 100
                            : 0
                        }
                        animated
                        size="sm"
                      />
                    </>
                  )}
                  {labelingPhase === "done" && labelingProgress.total > 0 && (
                    <>
                      <Text size="sm" className={styles.tableMeta}>
                        {labelingProgress.completed} / {labelingProgress.total} samples annotated
                      </Text>
                      <Progress value={100} size="sm" />
                    </>
                  )}
                  {labelingPhase === "error" && (
                    <Alert
                      icon={<IconAlertCircle size={16} />}
                      color="red"
                      variant="light"
                    >
                      {labelingError}
                    </Alert>
                  )}
                  {labelingPhase === "done" && (labeledRows.length > 0 || completedTaskOutputFile) && (
                    <Button
                      variant="light"
                      className={styles.secondaryCta}
                      leftSection={<IconDownload size={16} />}
                      onClick={() => void handleDownloadLabeled()}
                    >
                      Download annotated CSV
                    </Button>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </GuidedTour>
      </Container>
    </Box>
  );
}
