import { Flex, Text, Badge, useMantineColorScheme } from "@mantine/core";
import { IconFlask } from "@tabler/icons-react";

export const PilotBanner = () => {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  const color = isDark ? "rgba(58, 196, 166, 0.7)" : "rgba(31, 166, 138, 0.7)";
  const bg = isDark ? "rgba(58, 196, 166, 0.15)" : "rgba(31, 166, 138, 0.15)";
  const border = isDark ? "rgba(58, 196, 166, 0.4)" : "rgba(31, 166, 138, 0.4)";

  return (
    <Flex
      h={40}
      px="md"
      align="center"
      justify="space-between"
      style={{ background: bg, borderBottom: `1px solid ${border}` }}
    >
      <Flex align="center" gap="xs">
        <IconFlask size={16} color={color} stroke={2} />
        <Text size="sm" fw={500} style={{ color }}>
          Pilot Mode · Limited deployment for review and evaluation
        </Text>
      </Flex>
      <Badge variant="outline" size="sm" style={{ borderColor: border, color }}>
        PILOT
      </Badge>
    </Flex>
  );
};
