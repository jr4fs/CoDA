import { Flex, Text, Button } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { useDemo } from "./DemoContext";

export const DemoBanner = () => {
  const { isDemo } = useDemo();

  if (!isDemo) return null;

  return (
    <Flex
      h={40}
      px="md"
      align="center"
      justify="space-between"
      bg="rgba(255, 193, 7, 0.1)"
      style={{ borderBottom: "1px solid rgba(255, 193, 7, 0.3)" }}
    >
      <Flex align="center" gap="xs">
        <IconBulb size={16} color="#FFC107" stroke={2} />
        <Text size="sm" fw={500} c="rgba(255, 193, 7, 0.9)">
          Demo Mode · Youth Support Notes
        </Text>
      </Flex>
      <Button
        size="xs"
        variant="subtle"
        c="rgba(255, 193, 7, 0.9)"
        onClick={() => {
          window.location.href = "/";
        }}
      >
        Exit Demo
      </Button>
    </Flex>
  );
};
