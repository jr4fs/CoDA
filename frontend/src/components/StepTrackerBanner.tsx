import { ActionIcon, Box, Group, Text, Tooltip } from "@mantine/core";
import { IconHelpCircle } from "@tabler/icons-react";
import styles from "./StepTrackerBanner.module.css";

const steps = [
  "Upload task bundle",
  "AI annotation review",
  "Codebook completion",
];

interface StepTrackerBannerProps {
  evaluationFlow?: boolean;
  currentStep: number;
  activeSteps?: number[];
  onHelp?: () => void;
  helpLabel?: string;
}

export default function StepTrackerBanner({
  evaluationFlow = false,
  currentStep,
  activeSteps,
  onHelp,
  helpLabel = "About this step",
}: StepTrackerBannerProps) {
  const displaySteps = evaluationFlow ? ["Upload task", "Build evaluation set", "AI annotation review", "Codebook completion"] : steps;
  const activeList =
    activeSteps && activeSteps.length > 0 ? activeSteps : [currentStep];
  const activeSet = new Set(activeList);
  const minActive = Math.min(...activeList);
  const maxActive = Math.max(...activeList);
  const stepLabel =
    activeList.length > 1
      ? `Steps ${minActive}-${maxActive} of ${displaySteps.length}`
      : `Step ${currentStep} of ${displaySteps.length}`;
  return (
    <Box className={styles.banner}>
      <div className={styles.row}>
        <Group gap="xs" align="center" className={styles.summary}>
          <Text className={styles.kicker}>{stepLabel}</Text>
          {onHelp && (
            <Tooltip label={helpLabel} withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                className={styles.helpButton}
                onClick={onHelp}
                aria-label={helpLabel}
              >
                <IconHelpCircle size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <div className={styles.steps}>
          {displaySteps.map((label, index) => {
            const stepNumber = index + 1;
            const isActive = activeSet.has(stepNumber);
            const isComplete = stepNumber < minActive;
            return (
              <span
                key={label}
                className={`${styles.pill} ${isActive ? styles.pillActive : ""} ${isComplete ? styles.pillComplete : ""}`}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </Box>
  );
}
