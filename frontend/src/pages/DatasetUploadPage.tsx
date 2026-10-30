import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  Group,
  NumberInput,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {IconAlertCircle, IconArrowRight, IconBraces, IconDownload, IconFileTypeCsv, IconUpload,} from "@tabler/icons-react";
import {isAxiosError} from "axios";
import {type ReactNode, useCallback, useState, useEffect} from "react";
import {useNavigate} from "react-router-dom";
import StepTrackerBanner from "../components/StepTrackerBanner";
import GuidedTour, {GuidedTourStep} from "../components/common/GuidedTour";
import PageIntro, {usePageIntroTour} from "../components/common/PageIntro";
import {LABELS_TEMPLATE, TASK_TEMPLATE, modelOptions} from "../constants/datasetUpload.constants";
import {toast} from "../lib/toast";
import {uploadTaskBundle} from "../services/tasks.service";
import {downloadContent} from "../utils/downloadContent";
import { useDemo } from "../demo/DemoContext";
import styles from "./DatasetUploadPage.module.css";

interface UploadConfig {
  selectedModel: string | null;
  textColumn: string;
  labelColumn: string;
  coverageSampleSize: number | "";
  evaluationBatchSize: number | "";
  evaluationTarget: number | "";
  taskType: "Multiclass" | "Single-class";
}

// Default total number of samples; overridable at build time via env.
const DEFAULT_COVERAGE_SAMPLES =
  Number(import.meta.env.VITE_DEFAULT_COVERAGE_SAMPLES) || 15;

const defaultUploadConfig: UploadConfig = {
  selectedModel: "qwen:32b",
  textColumn: "translated_text",
  labelColumn: "Final Label",
  coverageSampleSize: DEFAULT_COVERAGE_SAMPLES,
  evaluationBatchSize: 10,
  evaluationTarget: 20,
  taskType: "Multiclass",
};

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
  preSelectAction?: {
    label: string;
    onClick: () => void;
  };
  hideMeta?: boolean;
  children?: ReactNode;
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
                            preSelectAction,
                            hideMeta,
                            children,
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
      <Group justify="space-between" w="100%" wrap="wrap" className={styles.fileRowHeader}>
        <Group gap={8} wrap="nowrap">
          {icon}
          <Text fw={600} className={styles.fileLabel}>
            {label}
          </Text>
        </Group>
        <Group gap="xs" wrap="wrap" className={styles.fileRowActions}>
          {preSelectAction ? (
            <button
              type="button"
              className={styles.fileButtonAction}
              onClick={preSelectAction.onClick}
            >
              {preSelectAction.label}
            </button>
          ) : null}
          <label htmlFor={inputId} className={styles.fileButton}>
            <IconUpload size={14}/>
            {selectLabel}
          </label>
        </Group>
      </Group>
      <Text size="xs" className={styles.fileHint}>
        {hint}
      </Text>
      {children}
      {!hideMeta && templateAction ? (
        <Group className={styles.fileMetaRow} wrap="wrap">
          <Text
            size="xs"
            className={`${styles.fileName} ${file ? styles.fileNameSelected : styles.fileNameMissing}`}
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
      ) : !hideMeta ? (
        <Text
          size="xs"
          className={`${styles.fileName} ${file ? styles.fileNameSelected : styles.fileNameMissing}`}
        >
          {file ? file.name : "No file selected"}
        </Text>
      ) : null
      }
    </div>
  );
}

export default function DatasetUploadPage() {
  const navigate = useNavigate();
  const {colorScheme} = useMantineColorScheme();
  const isLight = colorScheme === "light";
  const { isDemo, tourOpen: demoTourOpen, setTourOpen: setDemoTourOpen } = useDemo();

  const [dValFile, setDValFile] = useState<File | null>(null);
  const [dAllFile, setDAllFile] = useState<File | null>(null);
  const [taskJsonFile, setTaskJsonFile] = useState<File | null>(null);
  const [taskDetailsMode, setTaskDetailsMode] = useState<"file" | "manual">("file");
  const [manualTaskName, setManualTaskName] = useState("");
  const [manualTaskDescription, setManualTaskDescription] = useState("");
  const [labelsJsonFile, setLabelsJsonFile] = useState<File | null>(null);
  const [config, setConfig] = useState<UploadConfig>(defaultUploadConfig);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const {
    introOpen,
    introMode,
    tourOpen: pageTourOpen,
    setIntroOpen,
    setTourOpen: setPageTourOpen,
    openHelpIntro,
  } = usePageIntroTour("hideStep1Intro");

  // In demo mode, use demo tour state; otherwise use page intro tour state
  const tourOpen = isDemo ? demoTourOpen : pageTourOpen;
  const setTourOpen = isDemo ? setDemoTourOpen : setPageTourOpen;

  // Pre-fill demo form and set mock files on mount
  useEffect(() => {
    if (isDemo) {
      setTaskDetailsMode("manual");
      setManualTaskName("Pangolin Conservation Sentiment");
      setManualTaskDescription("Classify social media posts about pangolin conservation as positive, negative, or neutral toward conservation.");
      setConfig(prev => ({
        ...prev,
        selectedModel: "claude-3-5-sonnet",
        textColumn: "translated_text",
        labelColumn: "Final Label",
      }));

      // Create mock files for demo
      const mockLabeledFile = new File(["mock"], "pangolin_labeled.csv", { type: "text/csv" });
      const mockUnlabeledFile = new File(["mock"], "pangolin_unlabeled.csv", { type: "text/csv" });
      const mockLabelsFile = new File(["mock"], "labels.json", { type: "application/json" });

      setDValFile(mockLabeledFile);
      setDAllFile(mockUnlabeledFile);
      setLabelsJsonFile(mockLabelsFile);
    }
  }, [isDemo]);

  // Auto-open tour on mount in demo mode (intro is skipped)
  useEffect(() => {
    if (isDemo) {
      setDemoTourOpen(true);
    }
  }, [isDemo, setDemoTourOpen]);

  const hasManualTaskDetails =
    manualTaskName.trim().length > 0 && manualTaskDescription.trim().length > 0;
  const hasTaskDetails = taskDetailsMode === "file" ? Boolean(taskJsonFile) : hasManualTaskDetails;
  const isReady = Boolean(dAllFile && hasTaskDetails && labelsJsonFile && config.textColumn.trim() && config.selectedModel && config.evaluationBatchSize && config.evaluationTarget && config.coverageSampleSize);

  const handleHelp = openHelpIntro;

  const setConfigField = useCallback(
    <K extends keyof UploadConfig>(key: K, value: UploadConfig[K]) => {
      setConfig((prev) => ({...prev, [key]: value}));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setDValFile(null);
    setDAllFile(null);
    setTaskJsonFile(null);
    setTaskDetailsMode("file");
    setManualTaskName("");
    setManualTaskDescription("");
    setLabelsJsonFile(null);
    setConfig(defaultUploadConfig);
    setError(null);
  }, []);

  const dividerColor = isLight ? "rgba(15, 20, 24, 0.12)" : "rgba(255, 255, 255, 0.08)";

  const handleUpload = useCallback(async () => {
    if (
      !dAllFile ||
      !hasTaskDetails ||
      !labelsJsonFile ||
      !config.textColumn.trim() ||
      !config.selectedModel
    ) {
      setError(
          "Provide the unlabeled CSV, labels JSON, task details, text column, and preferred model before continuing.",
      );
      return;
    }

    setError(null);
    setUploadProgress(0);
    setIsUploading(true);

    try {
      if (!isDemo) {
        let selectedLabels: unknown;
        try {
          selectedLabels = JSON.parse(await labelsJsonFile.text());
        } catch {
          throw new Error(`"${labelsJsonFile.name}" is not valid JSON. Select a labels.json file.`);
        }
        if (
          !selectedLabels ||
          typeof selectedLabels !== "object" ||
          !Array.isArray((selectedLabels as { labels?: unknown }).labels) ||
          !(selectedLabels as { labels: unknown[] }).labels.length
        ) {
          throw new Error(`"${labelsJsonFile.name}" is not a label set. Select a labels.json file with a non-empty "labels" array, or download the label template.`);
        }
      }
      const response = await uploadTaskBundle({
        onProgress: setUploadProgress,
        dValFile: isDemo ? dValFile ?? undefined : undefined,
        dAllFile,
        taskJsonFile: taskDetailsMode === "file" ? taskJsonFile ?? undefined : undefined,
        taskName: taskDetailsMode === "manual" ? manualTaskName.trim() : undefined,
        taskDescription:
          taskDetailsMode === "manual" ? manualTaskDescription.trim() : undefined,
        taskType: config.taskType,
        labelsJsonFile,
        textColumn: config.textColumn,
        labelColumn: isDemo ? config.labelColumn : undefined,
        modelName: config.selectedModel ?? "",
        coverageN:
          typeof config.coverageSampleSize === "number"
            ? config.coverageSampleSize
            : DEFAULT_COVERAGE_SAMPLES,
        evaluationBatchSize: Number(config.evaluationBatchSize),
        evaluationTarget: Number(config.evaluationTarget),
      });

      if (!response.success || !response.taskId) {
        throw new Error(response.message || "Upload failed.");
      }

      toast.success("Task created. Your evaluation set is ready to build.");

      window.dispatchEvent(new Event("tasks:updated"));
      navigate(`/${response.task?.evaluationBuild ? "evaluation-builder" : "codebook-creation"}/${response.taskId}`, {
        state: {
          task: response.task,
          fileName: response.fileName,
        },
      });
    } catch (err: unknown) {
      if (isAxiosError<{message?: string}>(err)) {
        setError(err.response?.status === 400
          ? err.response.data?.message || "Check the uploaded files and column names."
          : "Upload failed. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  }, [
    config,
    dAllFile,
    dValFile,
    hasTaskDetails,
    labelsJsonFile,
    manualTaskDescription,
    manualTaskName,
    navigate,
    taskDetailsMode,
    taskJsonFile,
    isDemo,
  ]);

  return (
    <Box className={styles.page} style={{minHeight: "100dvh", overflowX: "hidden", overflowY: "auto"}}>
      <div className={styles.orbOne}/>
      <Container fluid className={styles.hero}>
        <StepTrackerBanner currentStep={1} evaluationFlow={!isDemo} onHelp={handleHelp}/>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title className={styles.title}>Upload Your Task Files</Title>
        </Group>
        <Text className={styles.subtitle}>
          Upload your unlabeled data and define the task. You’ll build an evaluation set by reviewing sampled narratives and highlighting the evidence for each label.
        </Text>
        <Group gap="sm" align="center" mt="sm" wrap="nowrap">
          <Text size="sm" c="dimmed">
            New here? Try the tool with a ready-made sample dataset:
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={async () => {
              try {
                const res = await fetch("/pangolin_sample_bundle.zip");
                if (!res.ok) throw new Error(String(res.status));
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "pangolin_sample_bundle.zip";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch {
                toast.error("Failed to download the sample dataset.");
              }
            }}
          >
            Download sample dataset
          </Button>
        </Group>
      </Container>

      <Container fluid className={styles.tableSection} style={{height: "auto", overflow: "visible"}}>

        <PageIntro
          mode={introMode}
          opened={isDemo ? false : introOpen}
          onClose={() => setIntroOpen(false)}
          title="Step 1: Upload your task files"
          description="Upload your unlabeled dataset, define your labels and task, then review small batches to build an evaluation set before codebook development."
          storageKey="hideStep1Intro"
          onStart={() => setTourOpen(true)}
        />

        <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)}>
          <Stack gap="lg">
            <Grid gutter="lg" align="stretch">
              <Grid.Col span={{base: 12, lg: 7}}>
                <GuidedTourStep
                  order={5}
                  title="Configure your task"
                  description="Choose a model, the text column, and your evaluation targets."
                >
                  <Paper className={styles.dropCard} radius="lg" h="100%">
                    <Stack gap="md">
                      <Title order={4} className={styles.tableTitle}>
                        Task config
                      </Title>
                    <Text size="sm" className={styles.tableMeta}>
                      Configure model and dataset columns before upload.
                    </Text>
                    <Divider my={4} color={dividerColor}/>
                    <NumberInput
                      label="Codebook review budget"
                      description="Maximum guide examples to review. Label-targeted FAISS retrieval and coverage sampling are automatic."
                      value={config.coverageSampleSize}
                      min={1}
                      max={1000}
                      allowDecimal={false}
                      onChange={(value) =>
                        setConfigField(
                          "coverageSampleSize",
                          typeof value === "number" ? value : "",
                        )
                      }
                      classNames={{
                        label: styles.configLabel,
                        description: styles.configDescription,
                        input: styles.configInput,
                      }}
                    />
                    <NumberInput label="Examples per label" description="Target expert-confirmed examples in your evaluation set." min={1} max={1000} allowDecimal={false} value={config.evaluationTarget} onChange={value => setConfigField("evaluationTarget", typeof value === "number" ? value : "")} />
                    <NumberInput label="Records per round" description="Review this many narratives before the next sampling round." min={1} max={100} allowDecimal={false} value={config.evaluationBatchSize} onChange={value => setConfigField("evaluationBatchSize", typeof value === "number" ? value : "")} />
                    {taskDetailsMode === "manual" && <Select label="Labels per record" data={[{ value: "Multiclass", label: "One or more labels" }, { value: "Single-class", label: "Exactly one label" }]} value={config.taskType} onChange={value => setConfigField("taskType", value === "Single-class" ? "Single-class" : "Multiclass")} />}
                    <Select
                      label="Model"
                      description="Choose the model to use for AI annotation."
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
                      description="The column in your CSV that contains the text to annotate."
                      placeholder="e.g. text, translated_text, content…"
                      value={config.textColumn}
                      onChange={(event) => setConfigField("textColumn", event.currentTarget.value)}
                      classNames={{
                        label: styles.configLabel,
                        description: styles.configDescription,
                        input: styles.configInput,
                      }}
                    />
                  </Stack>
                </Paper>
                </GuidedTourStep>
              </Grid.Col>
              <Grid.Col span={{base: 12, lg: 5}}>
                <Paper className={styles.dropCard} radius="lg" h="100%">
                  <Stack gap="lg">
                    <Title order={4} className={styles.tableTitle}>
                      Required files
                    </Title>
                    <Text size="sm" className={styles.tableMeta}>
                      Upload your unlabeled CSV and label definitions, then upload or enter task details.
                    </Text>
                    <Divider my={4} color={dividerColor}/>
                    <GuidedTourStep
                      order={1}
                      title="Task details"
                      description="Provide the task name and description in JSON."
                    >
                      <RequiredFileCard
                        inputId="task-json"
                        accept=".json,application/json"
                        icon={<IconBraces size={18}/>}
                        label="Task details"
                        selectLabel="Select JSON"
                        hint="JSON with taskname + description"
                        file={taskJsonFile}
                        onFileChange={setTaskJsonFile}
                        hideMeta={taskDetailsMode === "manual"}
                        templateAction={
                          taskDetailsMode === "file"
                            ? {
                                label: "Download template",
                                onClick: () => downloadContent("task.json", TASK_TEMPLATE),
                              }
                            : undefined
                        }
                        preSelectAction={{
                          label: taskDetailsMode === "file" ? "Enter details" : "Use JSON",
                          onClick: () =>
                            setTaskDetailsMode((prev) => (prev === "file" ? "manual" : "file")),
                        }}
                      >
                        {taskDetailsMode === "manual" && (
                          <Stack gap={8} mt={8} w="100%">
                          <TextInput
                            label="Task Name"
                            placeholder="e.g. Mental health theme detection"
                            value={manualTaskName}
                            onChange={(event) => setManualTaskName(event.currentTarget.value)}
                            classNames={{
                              label: styles.configLabel,
                              input: styles.configInput,
                            }}
                          />
                          <Textarea
                            label="Description"
                            placeholder="Describe what this task should classify and any scope boundaries."
                            value={manualTaskDescription}
                            onChange={(event) =>
                              setManualTaskDescription(event.currentTarget.value)
                            }
                            minRows={3}
                            autosize
                            classNames={{
                              label: styles.configLabel,
                              input: styles.configInput,
                            }}
                          />
                          </Stack>
                        )}
                      </RequiredFileCard>
                    </GuidedTourStep>

                    <GuidedTourStep
                      order={2}
                      title="Labels JSON"
                      description="Provide label names and definitions. Keywords are optional. Set requiresEvidence to false for labels based on absence of evidence."
                    >
                      <RequiredFileCard
                        inputId="labels-json"
                        accept=".json,application/json"
                        icon={<IconBraces size={18}/>}
                        label="Label set"
                        selectLabel="Select JSON"
                        hint="Names and definitions; optional keywords and guidelines"
                        file={labelsJsonFile}
                        onFileChange={setLabelsJsonFile}
                        templateAction={{
                          label: "Download template",
                          onClick: () => downloadContent("labels.json", LABELS_TEMPLATE),
                        }}
                      />
                    </GuidedTourStep>

                    <GuidedTourStep
                      order={4}
                      title="Upload unlabeled data"
                      description="Your full dataset. Select its narrative column in the task settings."
                    >
                      <RequiredFileCard
                        inputId="unlabeled-dataset"
                        accept=".csv,text/csv"
                        icon={<IconFileTypeCsv size={18}/>}
                        label="Unlabeled dataset"
                        selectLabel="Select CSV"
                        hint="CSV with the configured text column; ID and date columns are optional"
                        file={dAllFile}
                        onFileChange={setDAllFile}
                      />
                    </GuidedTourStep>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>

            {error && (
              <Alert icon={<IconAlertCircle size={16}/>} color="red" variant="light" role="alert">
                {error}
              </Alert>
            )}


            <Group justify="space-between" mt={2}>
              <Button variant="light" className={styles.secondaryCta} onClick={handleReset}>
                Reset
              </Button>
              <div>
                <GuidedTourStep
                  order={6}
                  title="Start the upload"
                  description="When all files are selected, upload to continue."
                  position="top"
                >
                  <Button
                    className={styles.primaryCta}
                    leftSection={<IconUpload size={18}/>}
                    rightSection={<IconArrowRight size={16}/>}
                    loading={isUploading}
                    disabled={!isReady}
                    onClick={handleUpload}
                  >
                    Upload and build evaluation set
                  </Button>
                </GuidedTourStep>
                {isUploading && (
                  <Stack gap={4} mt="xs">
                    <Progress value={uploadProgress} animated striped />
                    <Text size="xs" c="dimmed">
                      {uploadProgress < 100
                        ? `Uploading… ${uploadProgress}%`
                        : "Processing upload…"}
                    </Text>
                  </Stack>
                )}
              </div>
            </Group>
          </Stack>
        </GuidedTour>
      </Container>
    </Box>
  );
}
