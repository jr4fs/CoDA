import { Box, Button, Center, Loader, LoadingOverlay, Progress, Stack, Text } from "@mantine/core";

interface LoadingStatusProps {
  isLight: boolean;
  message: string;
  progress?: { completed: number; total: number };
}

export function LoadingStatus({ isLight, message, progress }: LoadingStatusProps) {
  const percent = progress?.total ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : null;
  return (
    <Box
      mih="100dvh"
      bg={isLight ? "#f7fafb" : "var(--app-bg)"}
      style={{ position: "relative" }}
    >
      <LoadingOverlay
        visible
        zIndex={1}
        overlayProps={{
          blur: 2,
          color: isLight ? "#f7fafb" : "#0f1418",
          opacity: isLight ? 0.78 : 0.72,
        }}
        loaderProps={{
          children: (
            <Stack align="center" gap="xs">
              <Loader color={isLight ? "blue" : "cyan"} />
              <Text c={isLight ? "#0f1418" : "white"} fw={500} ta="center">
                {message}
              </Text>
              {progress && percent === null && (
                <Text size="sm" c="dimmed" role="status">Waiting for sample progress…</Text>
              )}
              {progress && percent !== null && (
                <>
                  <Progress value={percent} w="min(80vw, 20rem)" aria-label="Initial evaluation progress" />
                  <Text size="sm" c="dimmed" role="status">
                    {percent === 100
                      ? `All ${progress.total.toLocaleString()} samples evaluated. Saving results…`
                      : `${progress.completed.toLocaleString()} of ${progress.total.toLocaleString()} samples evaluated (${percent}%)`}
                  </Text>
                </>
              )}
            </Stack>
          ),
        }}
      />
    </Box>
  );
}

interface ErrorStatusProps {
  isLight: boolean;
  message: string;
  onGoHome: () => void;
}

export function ErrorStatus({ isLight, message, onGoHome }: ErrorStatusProps) {
  return (
    <Center h="100vh" bg="var(--app-bg)">
      <Stack align="center" gap="md">
        <Text c={isLight ? "#0f1418" : "white"}>{message}</Text>
        <Button onClick={onGoHome}>Go Home</Button>
      </Stack>
    </Center>
  );
}
