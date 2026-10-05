import { Button, Group, Popover, Stack, Text, useMantineColorScheme, useMantineTheme } from "@mantine/core";
import {
  Children,
  cloneElement,
  type FC,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import styles from "./GuidedTour.module.css";

interface TourContextValue {
  isOpen: boolean;
  activeOrder: number | null;
  isLast: (order: number) => boolean;
  onNext: (order: number) => void;
  onSkip: () => void;
}

interface GuidedTourProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export interface GuidedTourStepProps {
  order: number;
  title: string;
  description: string;
  position?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

const TOUR_CONTEXT_PROP = "__guidedTourContext";
const GUIDED_TOUR_STEP_MARKER = "__isGuidedTourStep";

type GuidedTourStepInternalProps = GuidedTourStepProps & {
  [TOUR_CONTEXT_PROP]?: TourContextValue;
};

type UnknownProps = Record<string, unknown>;
type GuidedTourElement = JSX.Element;

type GuidedTourStepComponent = FC<GuidedTourStepInternalProps> & {
  [GUIDED_TOUR_STEP_MARKER]?: boolean;
};

function isGuidedTourStepElement(element: GuidedTourElement): boolean {
  const component = element.type as GuidedTourStepComponent;
  return Boolean(component?.[GUIDED_TOUR_STEP_MARKER]);
}

function collectStepOrders(children: ReactNode): number[] {
  const orders: number[] = [];

  const walk = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const element = child as GuidedTourElement;
      const props = (element.props as UnknownProps) ?? {};
      const maybeOrder = props.order;

      if (isGuidedTourStepElement(element) && typeof maybeOrder === "number") {
        orders.push(maybeOrder);
      }

      if (props.children) {
        walk(props.children as ReactNode);
      }
    });
  };

  walk(children);
  return Array.from(new Set(orders)).sort((a, b) => a - b);
}

function injectTourContext(children: ReactNode, context: TourContextValue): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    const element = child as GuidedTourElement;
    const props = (element.props as UnknownProps) ?? {};

    if (isGuidedTourStepElement(element)) {
      return cloneElement(element, {
        [TOUR_CONTEXT_PROP]: context,
        children: injectTourContext(props.children as ReactNode, context),
      });
    }

    if (props.children) {
      return cloneElement(element, {
        children: injectTourContext(props.children as ReactNode, context),
      });
    }

    return element;
  });
}

export default function GuidedTour({
  open,
  onClose,
  children,
}: GuidedTourProps) {
  const stepOrders = collectStepOrders(children);
  const [manualOrder, setManualOrder] = useState<number | null>(null);
  const activeOrder = open ? (manualOrder ?? stepOrders[0] ?? null) : null;

  const isLast = (order: number) => stepOrders[stepOrders.length - 1] === order;

  const onNext = (order: number) => {
    const idx = stepOrders.indexOf(order);
    if (idx < 0 || idx === stepOrders.length - 1) {
      setManualOrder(null);
      onClose();
      return;
    }
    setManualOrder(stepOrders[idx + 1]);
  };

  const onSkip = () => {
    setManualOrder(null);
    onClose();
  };

  const context: TourContextValue = {
    isOpen: open,
    activeOrder,
    isLast,
    onNext,
    onSkip,
  };

  return <>{injectTourContext(children, context)}</>;
}

export function GuidedTourStep({
  order,
  title,
  description,
  position = "right",
  children,
  [TOUR_CONTEXT_PROP]: context,
}: GuidedTourStepInternalProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const { colorScheme } = useMantineColorScheme();
  const theme = useMantineTheme();

  const isActive = Boolean(context?.isOpen && context.activeOrder === order);
  const isLastStep = context?.isLast(order) ?? false;

  useEffect(() => {
    if (!isActive || !targetRef.current) return;

    const rect = targetRef.current.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (inView) return;

    requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [isActive]);

  // Check for dark mode - also check system preference if colorScheme is "auto"
  let isDark = colorScheme === "dark";
  if (colorScheme === "auto") {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  const bubbleStyle = {
    background: isDark ? theme.colors.gray[8] : theme.colors.gray[0],
    borderColor: isDark ? theme.colors.gray[6] : theme.colors.gray[2],
    color: isDark ? theme.colors.gray[1] : theme.colors.gray[9],
    boxShadow: isDark ? "0 16px 36px rgba(0, 0, 0, 0.45)" : "0 16px 36px rgba(0, 0, 0, 0.15)",
    border: `1px solid ${isDark ? theme.colors.gray[6] : theme.colors.gray[2]}`,
    maxWidth: "50vw",
    whiteSpace: "normal" as const,
    overflowWrap: "break-word" as const,
  };

  return (
    <Popover opened={isActive} position={position} withArrow withinPortal shadow="md">
      <Popover.Target>
        <div
          ref={targetRef}
          className={isActive ? styles.highlight : undefined}
        >
          {children}
        </div>
      </Popover.Target>
      <Popover.Dropdown style={bubbleStyle}>
        <Stack gap="xs">
          <Text fw={600}>{title}</Text>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
          <Group justify="space-between">
            <Button variant="outline" size="xs" onClick={() => context?.onSkip()}>
              Skip
            </Button>
            <Button size="xs" onClick={() => context?.onNext(order)}>
              {isLastStep ? "Finish" : "Next"}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

(GuidedTourStep as GuidedTourStepComponent)[GUIDED_TOUR_STEP_MARKER] = true;
