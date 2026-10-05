import {
  Text,
  Stack,
  Flex,
  Button,
  ActionIcon,
  Menu,
  Center,
  LoadingOverlay,
  Tooltip,
  useMantineColorScheme,
  Box,
} from "@mantine/core";
import {
  IconLayoutSidebar,
  IconUserCircle,
  IconBook2,
  // IconPencil, // Annotate Dataset feature hidden for now
  IconDots,
  IconTrash,
  IconMoon,
  IconSun,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import "./styles/Sidebar.css";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type MutableRefObject,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router";
import { getUserTasks } from "../../services/tasks.service";
import { deleteTaskById } from "../../services/tasks.service";
import { IRootState } from "../../store/store";
import { Task } from "@common/types/tasks";
import { clearUser } from "../../store/userSlice";
import { toast } from "../../lib/toast";
import ConfirmActionModal from "../common/ConfirmActionModal";

//Props to handle navbar collapsed/expanded state
interface SideBarProps {
  collapsed: boolean;
  toggleCollapsed: () => void;
}
// eslint-disable-next-line no-unused-vars
type TaskRouteBuilder = (task: Task) => string;

export const SideBar = ({ collapsed, toggleCollapsed }: SideBarProps) => {
  const TASK_SECTION_HEADER_HEIGHT = 32;
  const TASK_SECTION_TOP_PADDING = 4;
  const user = useSelector((state: IRootState) => state.user.user);
  const accessToken = useSelector(
    (state: IRootState) => state.user.accessToken,
  );
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const pathname = location.pathname;

  const handleLogout = () => {
    dispatch(clearUser());
    navigate("/login");
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>();
  const [sectionsOpen, setSectionsOpen] = useState({
    codebook: true,
    annotation: true,
  });
  const [overflowState, setOverflowState] = useState({
    codebook: false,
    annotation: false,
  });
  const [fadeState, setFadeState] = useState({
    codebook: false,
    annotation: false,
  });
  const [listHeights, setListHeights] = useState({
    codebook: 0,
    annotation: 0,
  });
  const taskSectionsRef = useRef<HTMLDivElement | null>(null);
  const codebookListRef = useRef<HTMLDivElement | null>(null);
  // Annotate Dataset feature hidden for now
  // const annotationListRef = useRef<HTMLDivElement | null>(null);

  const codebookTasks = useMemo(
    () => tasks.filter((task) => task.status !== "auto_label_complete" && !task.codebookSourceTaskId),
    [tasks],
  );
  // Annotate Dataset feature hidden for now
  // const annotationOnlyTasks = useMemo(
  //   () => tasks.filter((task) => task.status === "auto_label_complete"),
  //   [tasks],
  // );

  const updateListOverflow = useCallback((list: "codebook" | "annotation") => {
    const target = codebookListRef.current;
    if (!target) return;
    const hasOverflow = target.scrollHeight > target.clientHeight + 1;
    const canScrollMore =
      hasOverflow &&
      target.scrollTop + target.clientHeight < target.scrollHeight - 1;

    setOverflowState((prev) =>
      prev[list] === hasOverflow ? prev : { ...prev, [list]: hasOverflow },
    );
    setFadeState((prev) =>
      prev[list] === canScrollMore ? prev : { ...prev, [list]: canScrollMore },
    );
  }, []);

  const updateSectionLayout = useCallback(() => {
    const container = taskSectionsRef.current;
    if (!container) return;

    const codebookOpen = sectionsOpen.codebook;
    const available =
      container.clientHeight -
      TASK_SECTION_TOP_PADDING -
      TASK_SECTION_HEADER_HEIGHT;

    if (available <= 0) {
      setListHeights({ codebook: 0, annotation: 0 });
      return;
    }

    if (!codebookOpen) {
      setListHeights({ codebook: 0, annotation: 0 });
      return;
    }

    const codebookNeed = codebookListRef.current?.scrollHeight ?? 0;
    // Annotate Dataset feature hidden for now
    const annotationNeed = 0;
    const base = available / 2;
    let codebookAlloc = Math.min(base, codebookNeed);
    let annotationAlloc = Math.min(base, annotationNeed);

    let remainder = available - codebookAlloc - annotationAlloc;
    if (remainder > 0) {
      const codebookMissing = Math.max(0, codebookNeed - codebookAlloc);
      const annotationMissing = Math.max(0, annotationNeed - annotationAlloc);
      const totalMissing = codebookMissing + annotationMissing;

      if (totalMissing > 0) {
        const codebookExtra = Math.min(
          codebookMissing,
          (remainder * codebookMissing) / totalMissing,
        );
        codebookAlloc += codebookExtra;
        remainder -= codebookExtra;

        const annotationExtra = Math.min(annotationMissing, remainder);
        annotationAlloc += annotationExtra;
      }
    }

    setListHeights({
      codebook: Math.max(0, Math.floor(codebookAlloc)),
      annotation: Math.max(0, Math.floor(annotationAlloc)),
    });
  }, [sectionsOpen.annotation, sectionsOpen.codebook]);

  const fetchTasks = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const userTasks = await getUserTasks();
      setTasks(userTasks.tasks || []);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      setError("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const handleDeleteTask = useCallback(async () => {
    const task = taskPendingDelete;
    if (!task?._id) return;

    setDeleteLoading(true);
    try {
      await deleteTaskById(task._id);
      toast.success(`Deleted "${task.name}"`);
      setTaskPendingDelete(null);
      await fetchTasks();

      const currentPath = window.location.pathname;
      const isOnDeletedTaskPath =
        currentPath.endsWith(`/codebook-creation/${task._id}`);
      if (isOnDeletedTaskPath) {
        navigate("/home");
      }
      window.dispatchEvent(new Event("tasks:updated"));
    } catch (error: any) {
      console.error("Failed to delete task:", error);
      toast.error(error?.response?.data?.message || "Failed to delete task");
    } finally {
      setDeleteLoading(false);
    }
  }, [taskPendingDelete, fetchTasks, navigate]);

  // Fetch user tasks, updates with every access token refresh
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const handleTaskUpdate = () => {
      fetchTasks();
    };

    window.addEventListener("tasks:updated", handleTaskUpdate);
    return () => {
      window.removeEventListener("tasks:updated", handleTaskUpdate);
    };
  }, [fetchTasks]);

  useEffect(() => {
    updateListOverflow("codebook");
    updateSectionLayout();
  }, [
    tasks,
    sectionsOpen.codebook,
    updateListOverflow,
    updateSectionLayout,
  ]);

  useEffect(() => {
    const handleResize = () => {
      updateSectionLayout();
      updateListOverflow("codebook");
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateListOverflow, updateSectionLayout]);

  const renderTaskRows = useCallback(
    (sectionTasks: Task[], routeBuilder: TaskRouteBuilder, disableActive = false) =>
      sectionTasks.map((task) => {
        const taskPath = routeBuilder(task);
        const isActive = !disableActive && pathname === taskPath;
        return (
          <div key={task._id} className="sidebar-task-row-wrap">
            <Button
              onClick={() => {
                navigate(taskPath);
              }}
              fullWidth
              radius="md"
              c="var(--app-sidebar-text)"
              px="sm"
              h={36}
              justify="flex-start"
              fz="sm"
              classNames={{
                root: `sidebar-task-row ${
                  isActive ? "sidebar-task-row-active" : ""
                }`,
              }}
            >
              <Text className="sidebar-task-title">{task.name}</Text>
            </Button>
            <Menu
              shadow="md"
              width={160}
              position="bottom-end"
              offset={6}
              classNames={{
                dropdown: "sidebar-menu-dropdown",
                item: "sidebar-menu-item",
              }}
            >
              <Menu.Target>
                <button
                  type="button"
                  className="sidebar-task-menu-trigger"
                  aria-label={`Task options for ${task.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <IconDots size={16} stroke={1.8} />
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} stroke={1.8} />}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTaskPendingDelete(task);
                  }}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        );
      }),
    [navigate, pathname],
  );

  const isCreateCodebookActive = pathname === "/new-codebook";
  // Annotate Dataset feature hidden for now
  // const isAnnotateDatasetActive = pathname === "/new-annotation";

  const renderTaskSection = useCallback(
    ({
      keyName,
      title,
      tasksList,
      listRef,
      listHeight,
      routeBuilder,
      disableActive = false,
    }: {
      keyName: "codebook" | "annotation";
      title: string;
      tasksList: Task[];
      listRef: MutableRefObject<HTMLDivElement | null>;
      listHeight: number;
      routeBuilder: TaskRouteBuilder;
      disableActive?: boolean;
    }) => (
      <Box className="sidebar-task-group">
        <Button
          variant="subtle"
          h={TASK_SECTION_HEADER_HEIGHT}
          px="sm"
          justify="flex-start"
          classNames={{ root: "sidebar-task-group-toggle" }}
          onClick={() =>
            setSectionsOpen((prev) => ({
              ...prev,
              [keyName]: !prev[keyName],
            }))
          }
          leftSection={
            sectionsOpen[keyName] ? (
              <IconChevronDown size={14} stroke={1.8} />
            ) : (
              <IconChevronRight size={14} stroke={1.8} />
            )
          }
        >
          <Text size="xs" fw={600}>
            {title} ({tasksList.length})
          </Text>
        </Button>
        {sectionsOpen[keyName] && (
          <Box
            className={`sidebar-task-list-wrap ${
              overflowState[keyName] ? "has-overflow" : ""
            } ${fadeState[keyName] ? "show-fade" : ""}`}
            style={{ height: listHeight }}
          >
            <div
              className="sidebar-task-list-scroll"
              ref={listRef}
              onScroll={() => updateListOverflow(keyName)}
            >
              <Stack pl="sm" pr="sm" pt={2} pb={2} gap={4}>
                {renderTaskRows(tasksList, routeBuilder, disableActive)}
              </Stack>
            </div>
          </Box>
        )}
      </Box>
    ),
    [
      TASK_SECTION_HEADER_HEIGHT,
      fadeState,
      overflowState,
      renderTaskRows,
      sectionsOpen,
      updateListOverflow,
    ],
  );

  if (collapsed) {
    //Collapsed sidebar
    return (
      <Stack
        h="100%"
        bg="var(--app-sidebar-bg)"
        w="70px"
        className="sidebar-shell"
      >
        <Tooltip label="Expand Sidebar" position="top" withArrow>
          <Button
            fullWidth
            variant="transparent"
            size="xl"
            onClick={() => {
              toggleCollapsed();
            }}
            c="var(--app-sidebar-text)"
            h="auto"
            p="0"
            mt="10"
            bd="0px"
            classNames={{ root: "sidebar-button-collapsed sidebar-home-button" }}
          >
            <span className="sidebar-home-logo-wrap">
              <img
                src="/annotate-icon.svg"
                alt="Annotate logo"
                className="sidebar-home-logo sidebar-home-logo-collapsed"
              />
              <IconLayoutSidebar
                size={30}
                stroke={1.8}
                className="sidebar-home-expand-icon"
              />
            </span>
          </Button>
        </Tooltip>
        <Tooltip label="Create Task" position="top" withArrow>
          <ActionIcon
            onClick={() => {
              navigate("/new-codebook");
            }}
            w="100%"
            size="xl"
            radius="md"
            c="var(--app-sidebar-text)"
            variant="subtle"
            classNames={{
              root: `sidebar-button-collapsed ${
                isCreateCodebookActive ? "sidebar-button-collapsed-active" : ""
              }`,
            }}
          >
            <IconBook2 size={24} stroke={1.6} />
          </ActionIcon>
        </Tooltip>
        {/* Annotate Dataset feature hidden for now
        <Tooltip label="Annotate Dataset" position="top" withArrow>
          <ActionIcon
            onClick={() => {
              navigate("/new-annotation");
            }}
            w="100%"
            size="xl"
            radius="md"
            c="var(--app-sidebar-text)"
            variant="subtle"
            classNames={{
              root: `sidebar-button-collapsed ${
                isAnnotateDatasetActive ? "sidebar-button-collapsed-active" : ""
              }`,
            }}
          >
            <IconPencil size={24} stroke={1.6} />
          </ActionIcon>
        </Tooltip>
        */}

        <Menu
          shadow="md"
          width={200}
          position="top-start"
          offset={6}
          classNames={{
            dropdown: "sidebar-menu-dropdown",
            item: "sidebar-menu-item",
          }}
        >
          <Menu.Target>
            <ActionIcon
              w="100%"
              size="xl"
              radius="md"
              c="var(--app-sidebar-text)"
              variant="subtle"
              classNames={{ root: "sidebar-button-collapsed" }}
              style={{ marginTop: "auto" }}
            >
              <IconUserCircle size={28} stroke={1.5} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={
                colorScheme === "dark" ? (
                  <IconSun size={14} />
                ) : (
                  <IconMoon size={14} />
                )
              }
              onClick={() =>
                setColorScheme(colorScheme === "dark" ? "light" : "dark")
              }
            >
              {colorScheme === "dark" ? "Light mode" : "Dark mode"}
            </Menu.Item>
            <Menu.Item color="red" onClick={handleLogout}>
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Stack>
    );
  } else {
    //Expanded sidebar
    return (
      <Stack
        h="100%"
        bg="var(--app-sidebar-bg)"
        w="280px"
        className="sidebar-shell"
      >
        <Stack h="auto" pl="md" pr="md" pt="md" pb="0px" gap={6}>
          <Flex justify="space-between" direction="row">
            <ActionIcon
              variant="transparent"
              size="lg"
              c="var(--app-sidebar-text)"
              onClick={() => {
                navigate("/home");
              }}
              bd="0"
              title="Home"
              className="sidebar-home-button"
            >
              <img
                src="/annotate-icon.svg"
                alt="Annotate logo"
                className="sidebar-home-logo sidebar-home-logo-expanded"
              />
            </ActionIcon>
            <ActionIcon
              variant="transparent"
              size="lg"
              c="dimmed"
              onClick={toggleCollapsed}
              bd="0"
            >
              <IconLayoutSidebar />
            </ActionIcon>
          </Flex>

          <Button
            onClick={() => {
              navigate("/new-codebook");
            }}
            fullWidth
            radius="md"
            c="var(--app-sidebar-text)"
            px="sm"
            h={36}
            justify="flex-start"
            leftSection={<IconBook2 size={16} stroke={1.8} />}
            fz="sm"
            classNames={{
              root: `sidebar-button sidebar-create-row ${
                isCreateCodebookActive ? "sidebar-button-active" : ""
              }`,
            }}
          >
            Create Task
          </Button>

          {/* Annotate Dataset feature hidden for now
          <Button
            onClick={() => {
              navigate("/new-annotation");
            }}
            fullWidth
            radius="md"
            c="var(--app-sidebar-text)"
            px="sm"
            h={36}
            justify="flex-start"
            leftSection={<IconPencil size={16} stroke={1.8} />}
            fz="sm"
            classNames={{
              root: `sidebar-button sidebar-create-row ${
                isAnnotateDatasetActive ? "sidebar-button-active" : ""
              }`,
            }}
          >
            Annotate Dataset
          </Button>
          */}

          <Text c="dimmed">Your Tasks</Text>
        </Stack>
        <Box className="sidebar-task-sections" ref={taskSectionsRef}>
          <LoadingOverlay
            visible={loading}
            zIndex={1000}
            overlayProps={{
              radius: "sm",
              blur: 2,
              color: "var(--app-sidebar-bg)",
            }}
            loaderProps={{ color: "var(--app-sidebar-text)", type: "bars" }}
          />
          {error ? (
            <Center>
              <Text c="var(--app-sidebar-text)"> {error} </Text>
            </Center>
          ) : (
            <>
              {renderTaskSection({
                keyName: "codebook",
                title: "Codebook Development",
                tasksList: codebookTasks,
                listRef: codebookListRef,
                listHeight: listHeights.codebook,
                routeBuilder: (task) => `/codebook-creation/${task._id}`,
              })}

              {/* Auto Annotation task section hidden for now
              {renderTaskSection({
                keyName: "annotation",
                title: "Auto Annotation",
                tasksList: annotationOnlyTasks,
                listRef: annotationListRef,
                listHeight: listHeights.annotation,
                routeBuilder: (task) => `/new-annotation/${task._id}`,
              })}
              */}
            </>
          )}
        </Box>
        <Menu
          shadow="md"
          width={200}
          position="top-start"
          offset={6}
          classNames={{
            dropdown: "sidebar-menu-dropdown",
            item: "sidebar-menu-item",
          }}
        >
          <Menu.Target>
            <Button
              style={{ marginTop: "auto" }}
              radius="md"
              px="sm"
              h={40}
              fz="sm"
              fullWidth
              justify="flex-start"
              leftSection={
                <IconUserCircle
                  size={18}
                  stroke={1.8}
                  className="sidebar-user-icon"
                />
              }
              classNames={{ root: "sidebar-button sidebar-user-button" }}
            >
              <Text className="sidebar-user-name">{user?.username}</Text>
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={
                colorScheme === "dark" ? (
                  <IconSun size={14} />
                ) : (
                  <IconMoon size={14} />
                )
              }
              onClick={() =>
                setColorScheme(colorScheme === "dark" ? "light" : "dark")
              }
            >
              {colorScheme === "dark" ? "Light mode" : "Dark mode"}
            </Menu.Item>
            <Menu.Item color="red" onClick={handleLogout}>
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <ConfirmActionModal
          opened={Boolean(taskPendingDelete)}
          title="Delete Task"
          message={`Delete "${taskPendingDelete?.name ?? "this task"}"? This permanently removes associated files and annotations.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteTask}
          onCancel={() => {
            if (!deleteLoading) {
              setTaskPendingDelete(null);
            }
          }}
          loading={deleteLoading}
        />
      </Stack>
    );
  }
};
