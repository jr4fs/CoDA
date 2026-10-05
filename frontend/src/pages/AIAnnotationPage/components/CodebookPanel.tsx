import { ActionIcon, Button, Center, Divider, Group, Paper, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { IconBook, IconDownload, IconEdit, IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";

interface CodebookPanelProps {
  isLight: boolean;
  mutedColor: string;
  surface: string;
  panelBg: string;
  borderColor: string;
  codebook: string[];
  stagedRules: string[];
  stagedRulesDeletion: string[];
  newRule: string;
  readOnly?: boolean;
  onNewRuleChange: (value: string) => void;
  onAddRule: () => void;
  onExport: () => void;
  onEditRule: (rule: string) => void;
  onToggleDeleteRule: (rule: string) => void;
  onRemoveStagedRule: (index: number) => void;
}

export function CodebookPanel({
  isLight,
  mutedColor,
  surface,
  panelBg,
  borderColor,
  codebook,
  stagedRules,
  stagedRulesDeletion,
  newRule,
  readOnly,
  onNewRuleChange,
  onAddRule,
  onExport,
  onEditRule,
  onToggleDeleteRule,
  onRemoveStagedRule,
}: CodebookPanelProps) {
  return (
    <Paper radius="lg" h="100%" bg={panelBg}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10, padding: 12 }}>
        <Group justify="space-between">
          <Group gap="xs">
            <IconBook color="var(--app-text)" />
            <Text size="md" fw={700} c={isLight ? "#0f1418" : "white"}>
              Live Codebook
            </Text>
          </Group>
          <Group gap="xs">
            <Button
              variant="filled"
              color="blue"
              size="xs"
              radius="xl"
              onClick={onExport}
              leftSection={<IconDownload size={14} />}
              disabled={codebook.length === 0}
            >
              Export
            </Button>
            <Tooltip label="These rules guide the AI for future batches">
              <IconInfoCircle size={18} color="gray" />
            </Tooltip>
          </Group>
        </Group>

        <Divider color={borderColor} />

        <Stack gap="sm" style={{ flex: 1, overflow: "auto" }}>
          {codebook.length === 0 && stagedRules.length === 0 ? (
            <Center h={200}>
              <Text c={mutedColor} size="sm" ta="center">
                No rules generated yet.
                <br />
                Complete a batch to see AI synthesis.
              </Text>
            </Center>
          ) : (
            <>
              {codebook.map((rule, idx) => (
                <Paper
                  key={idx}
                  p="sm"
                  bg={surface}
                  radius="sm"
                  style={{
                    border: `1px solid ${stagedRulesDeletion.includes(rule) ? "crimson" : borderColor}`,
                    opacity: stagedRulesDeletion.includes(rule) ? 0.5 : 1,
                  }}
                >
                  <Group align="flex-start" wrap="nowrap">
                    <Text
                      size="sm"
                      style={{ textDecoration: stagedRulesDeletion.includes(rule) ? "line-through" : "none" }}
                    >
                      {rule}
                    </Text>
                    {!readOnly && (
                      <>
                        <ActionIcon size="sm" color="green" variant="subtle" onClick={() => onEditRule(rule)}>
                          <IconEdit size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          color="red"
                          variant="subtle"
                          onClick={() => onToggleDeleteRule(rule)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                </Paper>
              ))}

              {stagedRules.length > 0 && (
                <>
                  <Text size="xs" fw={700} c="orange" tt="uppercase">
                    Pending (added on batch commit)
                  </Text>
                  {stagedRules.map((rule, idx) => (
                    <Paper
                      key={`staged-${idx}`}
                      p="sm"
                      radius="sm"
                      style={{ border: "1px dashed orange", opacity: 0.8 }}
                    >
                      <Group align="flex-start" wrap="nowrap">
                        <Text size="sm" style={{ flex: 1 }}>
                          {rule}
                        </Text>
                        <ActionIcon
                          size="sm"
                          color="red"
                          variant="subtle"
                          onClick={() => onRemoveStagedRule(idx)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                </>
              )}
            </>
          )}
        </Stack>

        {!readOnly && (
          <>
            <Divider color={borderColor} />
            <Stack gap="xs">
              <Text size="sm" fw={700} c={mutedColor} tt="uppercase">
                Add Codebook Rule
              </Text>
              <Group gap="xs">
                <Textarea
                  placeholder="Enter a custom rule..."
                  variant="filled"
                  size="sm"
                  style={{ flex: 1 }}
                  value={newRule}
                  onChange={(e) => onNewRuleChange(e.currentTarget.value)}
                />
                <ActionIcon size="lg" color="blue" onClick={onAddRule}>
                  <IconPlus size={20} />
                </ActionIcon>
              </Group>
            </Stack>
          </>
        )}
      </div>
    </Paper>
  );
}
