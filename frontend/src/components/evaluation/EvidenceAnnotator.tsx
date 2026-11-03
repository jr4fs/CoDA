import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SampleTextSection } from "../../pages/AIAnnotationPage/components/AIReviewPanelSections";
import type { EvidenceSpan } from "@common/types/evaluationBuilder";
import styles from "./EvidenceAnnotator.module.css";

export function EvidenceAnnotator({
  text,
  labels,
  spans,
  onChange,
  disabled = false,
  children,
}: {
  text: string;
  labels: string[];
  spans: EvidenceSpan[];
  onChange: (spans: EvidenceSpan[]) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const narrative = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const label =
    activeLabel && labels.includes(activeLabel)
      ? activeLabel
      : (labels[0] ?? null);
  const captureSelection = useCallback(() => {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || !narrative.current) return;
    const root = narrative.current;
    const range = selected.getRangeAt(0);
    const contents = document.createRange();
    contents.selectNodeContents(root);
    if (
      range.compareBoundaryPoints(Range.START_TO_END, contents) <= 0 ||
      range.compareBoundaryPoints(Range.END_TO_START, contents) >= 0
    ) return;
    const clipped = range.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, contents) < 0)
      clipped.setStart(root, 0);
    if (range.compareBoundaryPoints(Range.END_TO_END, contents) > 0)
      clipped.setEnd(root, root.childNodes.length);
    const prefix = contents.cloneRange();
    prefix.setEnd(clipped.startContainer, clipped.startOffset);
    const start = prefix.toString().length;
    const end = start + clipped.toString().length;
    setSelection(text.slice(start, end).trim() ? { start, end } : null);
  }, [text]);
  useEffect(() => {
    document.addEventListener("selectionchange", captureSelection);
    return () => document.removeEventListener("selectionchange", captureSelection);
  }, [captureSelection]);
  const selectAllText = () => {
    const root = narrative.current;
    if (!root || !text.trim()) return;
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(root);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    setSelection({ start: 0, end: text.length });
  };
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...spans.flatMap((span) => [span.start, span.end]),
    ]),
  ].sort((a, b) => a - b);
  const addSpan = () => {
    if (!selection || !label) return;
    if (
      !spans.some(
        (s) =>
          s.label === label &&
          s.start === selection.start &&
          s.end === selection.end,
      )
    ) {
      onChange([
        ...spans,
        {
          ...selection,
          label,
          text: text.slice(selection.start, selection.end),
        },
      ]);
    }
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };
  return (
    <Stack gap="md">
      <SampleTextSection
        currentSampleText={text}
        expanded
        surface="var(--app-surface)"
        borderColor="var(--app-border)"
      >
        <div
          ref={narrative}
          className={styles.text}
          tabIndex={0}
          role="region"
          aria-label="Narrative text"
          onPointerUp={captureSelection}
          onKeyUp={captureSelection}
          onTouchEnd={captureSelection}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
              event.preventDefault();
              selectAllText();
            }
          }}
        >
          {boundaries.slice(0, -1).map((start, index) => {
            const end = boundaries[index + 1];
            const evidence = spans.filter(
              (s) => s.start <= start && s.end >= end,
            );
            return evidence.length ? (
              <mark key={start} title={evidence.map((s) => s.label).join(", ")}>
                {text.slice(start, end)}
              </mark>
            ) : (
              <span key={start}>{text.slice(start, end)}</span>
            );
          })}
        </div>
      </SampleTextSection>
      {!disabled && (
        <>
          <Group justify="space-between" align="center" gap="sm">
            <Text size="sm" c="dimmed" id="highlight-help">
              Highlight contributing words in the narrative, then choose the label they support.
            </Text>
            <Button size="compact-sm" variant="subtle" onClick={selectAllText} disabled={!text.trim()}>
              Select all text
            </Button>
          </Group>
          <Group align="end">
            <Select
              label="Evidence for"
              placeholder="Assign a label first"
              data={labels}
              value={label}
              onChange={setActiveLabel}
              disabled={!labels.length}
              style={{ flex: 1, minWidth: 180 }}
            />
            <Button
              onClick={addSpan}
              disabled={!selection || !label}
              aria-describedby="highlight-help"
            >
              Add highlight
            </Button>
          </Group>
          <Text size="xs" c="dimmed" aria-live="polite">
            {selection
              ? `${selection.end - selection.start} characters selected`
              : "No text selected"}
          </Text>
        </>
      )}
      {children}
      {spans.length > 0 && (
        <Stack gap="xs" aria-label="Saved evidence">
          {spans.map((span, index) => (
            <Paper
              key={`${span.label}:${span.start}:${span.end}`}
              withBorder
              p="sm"
              radius="sm"
            >
              <Group justify="space-between" align="start" wrap="nowrap">
                <div>
                  <Text size="xs" fw={600} c="blue">
                    {span.label}
                  </Text>
                  <Text size="sm" className={styles.quote}>
                    “{span.text}”
                  </Text>
                </div>
                {!disabled && (
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    aria-label={`Remove highlight ${index + 1} for ${span.label}`}
                    onClick={() =>
                      onChange(spans.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
