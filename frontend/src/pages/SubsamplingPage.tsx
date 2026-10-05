import {
  Text,
  Center,
  Stack,
  Table,
  Title,
  Container,
  Paper,
  Pagination,
  Group,
  Tooltip,
  Modal,
  Checkbox,
  ScrollArea,
  MultiSelect,
  TextInput,
  Select,
  Box,
  Flex,
  Textarea,
  ActionIcon,
  TagsInput,
  Button,
  LoadingOverlay,
  useMantineColorScheme,
} from "@mantine/core";
import { IconTrash, IconPlus, IconInfoCircle } from "@tabler/icons-react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  createTask,
  getUserTasks,
} from "../services/tasks.service";
import { embedDataset } from "../services/embedding.service";
import { EmbedDatasetRequest } from "@common/types/embedding";
import { useSelector } from "react-redux";
import { IRootState } from "../store/store";
import styles from "../components/layout/styles/Subsampling.module.css";
import pageStyles from "./SubsamplingPage.module.css";
import { useTaskData } from "../hooks/useTaskData";
import { LabelItem } from "@common/types/tasks";
import StepTrackerBanner from "../components/StepTrackerBanner";

const MAX_ROWS_PER_PAGE = 10;
type TaskType = "Multiclass" | "Single-class";

export default function SubsamplingPage() {
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === "light";
  const { loading, csvData, subsampledData, headers, fileName, task } =
    useTaskData();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [taskName, setTaskName] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskType, setTaskType] = useState<"Multiclass" | "Single-class">(
    "Multiclass",
  );
  const [taskLabels, setTaskLabels] = useState<LabelItem[]>([
    { name: "", definition: "", keywords: [] },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [chosenCol, setChosenCol] = useState<string[]>([]);
  //const [filteredData, setFilteredData] = useState<CsvRow[]>([]);
  const [subsampledCsv, setSubsampledCsv] = useState<Record<string, unknown>[]>(
    [],
  );
  const [introOpen, setIntroOpen] = useState(false);
  const [introDontShow, setIntroDontShow] = useState(false);
  const [introShowCheckbox, setIntroShowCheckbox] = useState(true);
  const [codebookModalOpen, setCodebookModalOpen] = useState(false);
  const [availableCodebooks, setAvailableCodebooks] = useState<
    {
      _id?: string;
      name: string;
      labels: LabelItem[];
      type: TaskType;
      codebook?: string[];
    }[]
  >([]);
  const [isLoadingCodebooks, setIsLoadingCodebooks] = useState(false);
  const [appliedCodebook, setAppliedCodebook] = useState<string[]>([]);
  const [appliedCodebookSource, setAppliedCodebookSource] = useState<{
    id?: string;
    name?: string;
  } | null>(null);

  const user = useSelector((state: IRootState) => state.user.user);

  // Setting existing task data
  useEffect(() => {
    if (task) {
      setTaskName(task.name);
      setTaskDesc(task.description);
      setChosenCol(task.columns);
      setTaskType(task.type);
      setTaskLabels(
        task.labels || [{ name: "", definition: "", keywords: [] }],
      );
      setAppliedCodebook(task.codebook || []);
      if (task.codebookSourceTaskId || task.codebookSourceTaskName) {
        setAppliedCodebookSource({
          id: task.codebookSourceTaskId,
          name: task.codebookSourceTaskName,
        });
      }
    }
  }, [task]);

  const fetchCodebooks = async () => {
    if (isLoadingCodebooks) return;
    setIsLoadingCodebooks(true);
    try {
      const response = await getUserTasks();
      if (response.success && response.tasks) {
        const codebooks = response.tasks
          .filter((t) => Array.isArray(t.codebook) && t.codebook.length > 0)
          .map((t) => ({
            _id: t._id,
            name: t.name,
            labels: t.labels,
            type: t.type,
            codebook: t.codebook,
          }));
        setAvailableCodebooks(codebooks);
      }
    } catch (error) {
      console.error("Failed to load codebooks:", error);
    } finally {
      setIsLoadingCodebooks(false);
    }
  };

  const handleOpenCodebooks = async () => {
    setCodebookModalOpen(true);
    await fetchCodebooks();
  };

  const handleApplyCodebook = (selected: {
    _id?: string;
    name: string;
    labels: LabelItem[];
    type: TaskType;
    codebook?: string[];
  }) => {
    setTaskType(selected.type);
    setTaskLabels(
      selected.labels.length > 0
        ? selected.labels
        : [{ name: "", definition: "", keywords: [] }],
    );
    setAppliedCodebook(selected.codebook || []);
    setAppliedCodebookSource({ id: selected._id, name: selected.name });
    setCodebookModalOpen(false);
  };

  useEffect(() => {
    if (subsampledData && subsampledData.length > 0) {
      setSubsampledCsv(subsampledData);
    }
  }, [subsampledData]);

  useEffect(() => {
    const hideIntro = localStorage.getItem("hideStep3Intro") === "true";
    if (!hideIntro) {
      setIntroShowCheckbox(true);
      setIntroOpen(true);
    }
  }, []);

  const handleCloseIntro = () => {
    if (introShowCheckbox && introDontShow) {
      localStorage.setItem("hideStep3Intro", "true");
    }
    setIntroOpen(false);
  };

  const handleHelp = () => {
    setIntroShowCheckbox(false);
    setIntroOpen(true);
  };

  const infoLabel = (label: string, description: string) => (
    <Group gap={6} align="center">
      <Text>{label}</Text>
      <Tooltip label={description} withArrow position="right">
        <ActionIcon
          size="xs"
          variant="subtle"
          color="gray"
          aria-label={`${label} info`}
        >
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );

  // TODO: Filter CSV data based on chosen columns
  // useEffect(() => {
  //   if (chosenCol.length > 0) {
  //     const filtered = csvData.filter((row) => {
  //       return chosenCol.every((col) => {
  //         const value = row[col];
  //         return value !== null && value !== undefined && value.trim() !== "";
  //       });
  //     });
  //     setFilteredData(filtered);
  //     setCurrentPage(1); // Reset pagination when filtering
  //   } else {
  //     setFilteredData(csvData);
  //     setCurrentPage(1);
  //   }
  // }, [chosenCol, csvData]);

  // Determine which data to display - subsampled takes priority
  const displayData = subsampledCsv.length > 0 ? subsampledCsv : csvData;

  // Get headers from the appropriate source
  const displayHeaders = useMemo(() => {
    if (displayData.length > 0) {
      return Object.keys(displayData[0]);
    }
    return [];
  }, [displayData]);
  // Calculations for pagination
  const totalPages = Math.ceil(displayData.length / MAX_ROWS_PER_PAGE);
  const startIndex = (currentPage - 1) * MAX_ROWS_PER_PAGE;
  const endIndex = startIndex + MAX_ROWS_PER_PAGE;
  const paginatedData = displayData.slice(startIndex, endIndex);

  const addLabelItem = () => {
    setTaskLabels((prev) => [
      ...prev,
      { name: "", definition: "", keywords: [] },
    ]);
  };

  const removeLabelItem = (index: number) => {
    setTaskLabels((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLabelName = (index: number, name: string) => {
    setTaskLabels((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name } : item)),
    );
  };

  const updateLabelDefinition = (index: number, definition: string) => {
    setTaskLabels((prev) =>
      prev.map((item, i) => (i === index ? { ...item, definition } : item)),
    );
  };

  const updateLabelKeywords = (index: number, keywords: string[]) => {
    setTaskLabels((prev) =>
      prev.map((item, i) => (i === index ? { ...item, keywords } : item)),
    );
  };

  const hasValidLabels = taskLabels.every(
    (label) =>
      label.name?.trim() &&
      label.definition?.trim() &&
      label.keywords &&
      label.keywords.length > 0,
  );
  const isTaskStateValid =
    Boolean(taskName.trim()) &&
    Boolean(taskDesc.trim()) &&
    Boolean(taskType) &&
    Boolean(fileName) &&
    taskLabels.length > 0 &&
    hasValidLabels;

  const handleSaveTaskState = async () => {
    if (isSaving) return;

    // Use task from useTaskData or ID from URL if available
    const currentTaskId = task?._id;

    if (task) {
      // Use JSON.stringify for deep comparison of arrays/objects
      const hasChanges =
        JSON.stringify(task.columns) !== JSON.stringify(chosenCol) ||
        task.description !== taskDesc ||
        task.name !== taskName ||
        JSON.stringify(task.labels) !== JSON.stringify(taskLabels) ||
        task.type !== taskType ||
        JSON.stringify(task.codebook || []) !==
        JSON.stringify(appliedCodebook || []) ||
        task.codebookSourceTaskId !== appliedCodebookSource?.id ||
        task.codebookSourceTaskName !== appliedCodebookSource?.name;

      if (!hasChanges) {
        console.log("No changes detected, skipping save");
        return;
      }
    }

    setIsSaving(true);
    console.log(
      `[handleSaveTaskState] Saving task... currentTaskId: ${currentTaskId}`,
    );

    const createdAt = task?.createdAt || new Date().toISOString();
    const payload: any = {
      name: taskName,
      description: taskDesc,
      type: taskType,
      labels: taskLabels,
      codebook: appliedCodebook,
      codebookSourceTaskId: appliedCodebookSource?.id,
      codebookSourceTaskName: appliedCodebookSource?.name,
      columns: chosenCol,
      userID: user?.id || "00000",
      file: fileName,
      createdAt,
    };

    if (currentTaskId) {
      payload.taskId = currentTaskId;
    }

    try {
      const response = await createTask(payload);
      if (response.success) {
        console.log("Saved Task state successfully", response);
        window.dispatchEvent(new CustomEvent("tasks:updated"));
        // Replace the URL with /new-task/:taskId so that a page refresh can
        // recover state from the API instead of hitting an empty nav state.
        if (!currentTaskId && response.taskId) {
          navigate(`/new-task/${response.taskId}`, {
            replace: true,
            state: {
              csvData,
              headers,
              fileName,
              subsampledCsv,
              task: {
                _id: response.taskId,
                name: taskName,
                description: taskDesc,
                type: taskType,
                labels: taskLabels,
                codebook: appliedCodebook,
                codebookSourceTaskId: appliedCodebookSource?.id,
                codebookSourceTaskName: appliedCodebookSource?.name,
                userID: user?.id || "00000",
                columns: chosenCol,
                file: fileName,
                createdAt,
              },
            },
          });
        }
      } else {
        console.log("Error saving task state: ", response.errors);
      }
    } catch (error) {
      console.error("Failed to save task state:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubsampling = async () => {
    // Validate required fields
    if (!taskName || !taskDesc || !taskType || taskLabels.length === 0) {
      console.error("Please fill in all required task fields");
      return;
    }

    // Validate that a column is selected
    if (!chosenCol || chosenCol.length === 0 || !chosenCol[0]) {
      console.error("Please select at least one column for annotation");
      return;
    }

    // Validate that all labels have required fields
    const invalidLabels = taskLabels.filter(
      (label) =>
        !label.name?.trim() ||
        !label.definition?.trim() ||
        !label.keywords ||
        label.keywords.length === 0,
    );

    if (invalidLabels.length > 0) {
      console.error(
        "All labels must have a name, definition, and at least one keyword",
      );
      return;
    }

    try {
      // Save task in DB
      setIsLoading(true);
      await handleSaveTaskState();
      const payload: EmbedDatasetRequest = {
        file_path: fileName,
        text_col: chosenCol,
        label_col: "task_label",
        taskId: task?._id ?? "",
        userId: user?.id || "00000",
        labels: taskLabels.filter(
          (label) =>
            label.name?.trim() &&
            label.definition?.trim() &&
            label.keywords &&
            label.keywords.length > 0,
        ),
      };

      console.log("Sending payload to backend:", payload);
      const response = await embedDataset(payload);
      if (response.success) {
        console.log("Subsampling completed successfully");
        if (response.val_data && response.val_data.length > 0) {
          setSubsampledCsv(response.val_data);
        }
      } else {
        console.error("Subsampling failed:", response);
      }
    } catch (error: any) {
      console.error("Error performing subsampling:", error);
      if (error?.response?.data) {
        console.error("Backend error details:", error.response.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <Box className={pageStyles.page}>
        <Center className={pageStyles.emptyState}>
          <Text size="lg">Loading task data...</Text>
        </Center>
      </Box>
    );
  }

  // Handle empty data
  if (!csvData || csvData.length === 0 || !headers || headers.length === 0) {
    return (
      <Box className={pageStyles.page}>
        <Center className={pageStyles.emptyState}>
          <Stack align="center" gap="md">
            <Text size="lg">No data available</Text>
            <Text c="dimmed">Please upload a CSV file to get started</Text>
            <Button
              className={pageStyles.secondaryButton}
              onClick={() => navigate("/")}
            >
              Upload CSV File
            </Button>
          </Stack>
        </Center>
      </Box>
    );
  }

  return (
    <Box className={pageStyles.page}>
      <div className={pageStyles.orbOne} />
      <Modal
        opened={introOpen}
        onClose={handleCloseIntro}
        centered
        title="Step 3: Task definition"
        overlayProps={{
          blur: 2,
          opacity: 0.5,
          color: isLight ? "#f7fafb" : "#11171c",
        }}
        styles={{
          content: {
            backgroundColor: isLight ? "#ffffff" : "rgba(20, 28, 34, 0.98)",
            border: isLight
              ? "1px solid rgba(15, 20, 24, 0.12)"
              : "1px solid rgba(124, 231, 225, 0.25)",
            boxShadow: isLight
              ? "0 24px 60px rgba(0, 0, 0, 0.15)"
              : "0 24px 60px rgba(0, 0, 0, 0.35)",
            color: isLight ? "#0f1418" : "#e8eef1",
          },
          header: { backgroundColor: "transparent" },
          title: { color: isLight ? "#0f1418" : "#e8eef1", fontWeight: 600 },
          close: { color: isLight ? "#0f1418" : "#e8eef1" },
        }}
      >
        <Stack gap="sm">
          <Text>
            Define the task, labels, and columns so annotations stay consistent.
            This guides the subsampling step and the later AI review.
          </Text>
          {introShowCheckbox && (
            <Checkbox
              label="Don't show again"
              checked={introDontShow}
              onChange={(event) =>
                setIntroDontShow(event.currentTarget.checked)
              }
            />
          )}
          <Group justify="flex-end">
            <Button onClick={handleCloseIntro}>Got it</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={codebookModalOpen}
        onClose={() => setCodebookModalOpen(false)}
        centered
        title="Apply Existing Codebook"
        overlayProps={{
          blur: 2,
          opacity: 0.5,
          color: isLight ? "#f7fafb" : "#11171c",
        }}
        styles={{
          content: {
            backgroundColor: isLight ? "#ffffff" : "rgba(20, 28, 34, 0.98)",
            border: isLight
              ? "1px solid rgba(15, 20, 24, 0.12)"
              : "1px solid rgba(124, 231, 225, 0.25)",
            boxShadow: isLight
              ? "0 24px 60px rgba(0, 0, 0, 0.15)"
              : "0 24px 60px rgba(0, 0, 0, 0.35)",
            color: isLight ? "#0f1418" : "#e8eef1",
          },
          header: { backgroundColor: "transparent" },
          title: { color: isLight ? "#0f1418" : "#e8eef1", fontWeight: 600 },
          close: { color: isLight ? "#0f1418" : "#e8eef1" },
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Select a completed task to reuse its labels and rules.
          </Text>
          {isLoadingCodebooks ? (
            <Text size="sm">Loading codebooks...</Text>
          ) : availableCodebooks.length === 0 ? (
            <Text size="sm">No saved codebooks yet.</Text>
          ) : (
            <Stack gap="xs">
              {availableCodebooks.map((book) => (
                <Paper
                  key={book._id || book.name}
                  p="sm"
                  radius="md"
                  bg={isLight ? "#f4f7f9" : "rgba(12, 18, 23, 0.9)"}
                  withBorder
                  style={{
                    borderColor: isLight
                      ? "rgba(15, 20, 24, 0.12)"
                      : "rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <Group justify="space-between" align="center">
                    <Stack gap={2}>
                      <Text fw={600}>{book.name}</Text>
                      <Text size="xs" c="dimmed">
                        {book.labels.length} labels • {book.type}
                      </Text>
                    </Stack>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => handleApplyCodebook(book)}
                    >
                      Apply
                    </Button>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>
      <Container fluid className={pageStyles.content}>
        <StepTrackerBanner currentStep={3} onHelp={handleHelp} />
        <Flex
          h="100%"
          justify="flex-start"
          direction="row"
          wrap="nowrap"
          className={pageStyles.layout}
        >
          {/* Left-side task information display */}
          <Paper className={pageStyles.sidePanel}>
            <Stack
              w="100%"
              h="100%"
              gap="md"
              justify="flex-start"
              className={pageStyles.sideStack}
            >
              <ScrollArea
                offsetScrollbars
                scrollbarSize={6}
                type="hover"
                className={pageStyles.labelScroll}
              >
                <Stack gap="md" px="15" pt="sm" pb="sm">
                  <Button
                    variant="outline"
                    color="gray"
                    radius="xl"
                    size="sm"
                    onClick={handleOpenCodebooks}
                  >
                    Apply Existing Codebook
                  </Button>
                  {appliedCodebook.length > 0 && (
                    <Text size="xs" c="dimmed" ml="xs">
                      Using codebook: {appliedCodebookSource?.name || "Custom"}
                    </Text>
                  )}
                  <MultiSelect
                    ml="15"
                    mr="15"
                    variant="filled"
                    fz="lg"
                    label={infoLabel(
                      "Select columns to use for annotation",
                      "These columns are used for labeling, embeddings, and subsampling.",
                    )}
                    placeholder="Select columns"
                    clearable
                    searchable
                    nothingFoundMessage="Column does not exist"
                    limit={5}
                    data={headers}
                    value={chosenCol}
                    onChange={setChosenCol}
                    comboboxProps={{
                      transitionProps: { transition: "pop", duration: 200 },
                    }}
                    classNames={{
                      input: styles.input,
                      dropdown: styles.dropdown,
                      option: styles.option,
                    }}
                  ></MultiSelect>
                  <Title
                    order={4}
                    c={isLight ? "#0f1418" : "#D8D8D8"}
                    ml="15"
                    mr="15"
                  >
                    Task Definition
                  </Title>
                  <TextInput
                    ml="15"
                    mr="15"
                    variant="filled"
                    label={infoLabel(
                      "Task name",
                      "Shown in the task list and used to organize your work.",
                    )}
                    placeholder="Enter task name"
                    value={taskName}
                    onChange={(event) => setTaskName(event.currentTarget.value)}
                    classNames={{
                      input: styles.input,
                    }}
                  />
                  <Textarea
                    ml="15"
                    mr="15"
                    variant="filled"
                    label={infoLabel(
                      "Task description",
                      "Defines what should be labeled and guides the model later.",
                    )}
                    placeholder="Enter task description"
                    value={taskDesc}
                    onChange={(event) => setTaskDesc(event.currentTarget.value)}
                    classNames={{
                      input: styles.input,
                    }}
                  />
                  <Select
                    ml="15"
                    mr="15"
                    variant="filled"
                    label={infoLabel(
                      "Select task type",
                      "Single-class selects one label per sample; Multiclass allows multiple.",
                    )}
                    placeholder="Pick value"
                    data={["Multiclass", "Single-class"]}
                    value={taskType}
                    onChange={(_value) =>
                      setTaskType(_value as "Multiclass" | "Single-class")
                    }
                    classNames={{
                      input: styles.input,
                      dropdown: styles.dropdown,
                      option: styles.option,
                    }}
                  />

                  <Title order={5} c={isLight ? "#0f1418" : "#D8D8D8"} mt="sm">
                    Task Labels
                  </Title>

                  {taskLabels.map((label, idx) => (
                    <Paper
                      key={idx}
                      p="sm"
                      radius="md"
                      bg={isLight ? "#f4f7f9" : "rgba(12, 18, 23, 0.9)"}
                      withBorder
                      style={{
                        borderColor: isLight
                          ? "rgba(15, 20, 24, 0.12)"
                          : "rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <Group justify="space-between" align="center" mb="xs">
                        <Text fw={600} c={isLight ? "#0f1418" : "#D8D8D8"}>
                          Label {idx + 1}
                        </Text>

                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => removeLabelItem(idx)}
                          disabled={taskLabels.length === 1}
                          title={
                            taskLabels.length === 1
                              ? "At least 1 label is required"
                              : "Remove label"
                          }
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>

                      <Stack gap="xs">
                        <TextInput
                          variant="filled"
                          label={infoLabel(
                            "Label name",
                            "Short label used during manual and AI annotation.",
                          )}
                          placeholder={`Enter name for label ${idx + 1}`}
                          value={label.name}
                          onChange={(e) =>
                            updateLabelName(idx, e.currentTarget.value)
                          }
                          classNames={{ input: styles.input }}
                        />

                        <TextInput
                          variant="filled"
                          label={infoLabel(
                            "Label description",
                            "Definition used to guide annotators and the model.",
                          )}
                          placeholder={`Enter description for label ${idx + 1}`}
                          value={label.definition}
                          onChange={(e) =>
                            updateLabelDefinition(idx, e.currentTarget.value)
                          }
                          classNames={{ input: styles.input }}
                        />

                        <TagsInput
                          variant="filled"
                          label={infoLabel(
                            "Keywords",
                            "Examples that help the model understand the label.",
                          )}
                          placeholder="Type keyword and press Enter"
                          value={label.keywords}
                          onChange={(values) =>
                            updateLabelKeywords(idx, values)
                          }
                          clearable
                          classNames={{ input: styles.input }}
                        />
                      </Stack>
                    </Paper>
                  ))}
                  <Center>
                    <ActionIcon
                      variant="filled"
                      radius="xl"
                      size="lg"
                      color="gray"
                      onClick={addLabelItem}
                      title="Add label"
                    >
                      <IconPlus size={20} />
                    </ActionIcon>
                  </Center>
                </Stack>
              </ScrollArea>
              <Stack className={pageStyles.sideActions}>
                <Button
                  variant="filled"
                  className={pageStyles.secondaryButton}
                  fullWidth
                  radius={50}
                  size="sm"
                  onClick={handleSaveTaskState}
                  loading={isSaving}
                  disabled={!isTaskStateValid}
                >
                  Save Task State
                </Button>
                <Button
                  variant="filled"
                  className={pageStyles.primaryButton}
                  fullWidth
                  radius={50}
                  size="sm"
                  onClick={handleSubsampling}
                >
                  Perform Subsampling
                </Button>
                <Button
                  variant="filled"
                  className={pageStyles.secondaryButton}
                  fullWidth
                  radius={50}
                  size="sm"
                  disabled={subsampledCsv.length === 0}
                  onClick={() => {
                    navigate(`/manual-annotate/${task?._id}`, {
                      state: {
                        subsampledCsv,
                        task: task
                          ? {
                            ...task,
                            codebook: appliedCodebook,
                            codebookSourceTaskId: appliedCodebookSource?.id,
                            codebookSourceTaskName:
                              appliedCodebookSource?.name,
                          }
                          : task,
                      },
                    });
                  }}
                >
                  Annotate Data
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {/* Right-side dataset display */}
          {/* Right-side dataset display */}
          <Paper className={pageStyles.tablePanel}>
            <LoadingOverlay
              visible={isLoading}
              zIndex={1000}
              overlayProps={{ radius: "sm", blur: 2 }}
              loaderProps={{
                color: isLight ? "#0f1418" : "white",
                type: "bars",
              }}
            />
            <Stack h="100%" gap="md">
              <div>
                <Title order={4} className={pageStyles.panelTitle}>
                  {fileName}
                </Title>
                <Text className={pageStyles.panelMeta} fz="md">
                  {displayData.length} rows
                </Text>
              </div>
              <Paper className={pageStyles.tableCard}>
                <Table.ScrollContainer minWidth={500} h="100%">
                  <Table
                    withColumnBorders
                    withTableBorder
                    borderColor={
                      isLight
                        ? "rgba(15, 20, 24, 0.12)"
                        : "rgba(232, 238, 241, 0.2)"
                    }
                  >
                    <Table.Thead>
                      <Table.Tr>
                        {displayHeaders.map((header, index) => (
                          <Table.Th
                            key={index}
                            className={pageStyles.tableHeader}
                          >
                            {header}
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {paginatedData.map((row, rowIndex) => (
                        <Table.Tr key={rowIndex}>
                          {displayHeaders.map((header, cellIndex) => (
                            <Table.Td
                              key={cellIndex}
                              className={pageStyles.tableCell}
                            >
                              <div className={pageStyles.tableCellContent}>
                                {String(row[header])}
                              </div>
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Paper>
              <Group justify="center" p="md">
                <Pagination
                  total={totalPages}
                  value={currentPage}
                  onChange={setCurrentPage}
                  color="gray"
                  withEdges
                  styles={{
                    control: {
                      backgroundColor: isLight ? "#ffffff" : "#1a232b",
                      border: "none",
                      color: isLight ? "#0f1418" : "#e8eef1",
                    },
                    dots: {
                      color: isLight ? "#0f1418" : "#e8eef1",
                    },
                  }}
                />
              </Group>
            </Stack>
          </Paper>
        </Flex>
      </Container>
    </Box>
  );
}
