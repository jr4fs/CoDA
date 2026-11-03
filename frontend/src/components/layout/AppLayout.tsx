import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AppShell, Burger, Group, Text } from "@mantine/core";
import { useLocation } from "react-router-dom";
import { SideBar } from "./Sidebar";
import { PilotBanner } from "../PilotBanner";
import { useDemo } from "../../demo/DemoContext";

const isPilot = import.meta.env.VITE_APP_MODE === "pilot";

export const AppLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileOpened, setMobileOpened] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpened(false), [location.pathname]);
  const { isDemo } = useDemo();
  const showPilotBanner = isPilot && !isDemo;

  return (
    <AppShell
      header={{ height: showPilotBanner ? { base: 96, xs: 40 } : { base: 56, xs: 0 } }}
      navbar={{
        width: sidebarCollapsed ? 70 : 280,
        breakpoint: "xs",
        collapsed: { mobile: !mobileOpened },
      }}
      padding={0}
      transitionDuration={700} // Adjust this value (in ms)
      transitionTimingFunction="ease" // Adjust easing
      bg="var(--app-sidebar-bg)"
    >
      <AppShell.Header>
        <Group h={56} px="md" hiddenFrom="xs" gap="sm">
          <Burger opened={mobileOpened} onClick={() => setMobileOpened((opened) => !opened)} aria-label="Toggle navigation" size="sm" />
          <Text fw={600}>Codebook development</Text>
        </Group>
        {showPilotBanner && <PilotBanner />}
      </AppShell.Header>
      {/* NAVBAR (collapsible sidebar) */}
      <AppShell.Navbar>
        <SideBar
          collapsed={sidebarCollapsed}
          toggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        />
      </AppShell.Navbar>
      <AppShell.Main style={{ minHeight: "100dvh", position: "relative" }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};
