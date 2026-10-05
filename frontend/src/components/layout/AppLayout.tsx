import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppShell } from "@mantine/core";
import { SideBar } from "./Sidebar";
import { PilotBanner } from "../PilotBanner";
import { useDemo } from "../../demo/DemoContext";

const isPilot = import.meta.env.VITE_APP_MODE === "pilot";

export const AppLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const { isDemo } = useDemo();
  const showPilotBanner = isPilot && !isDemo;

  return (
    <AppShell
      header={showPilotBanner ? { height: 40 } : undefined}
      navbar={{
        width: sidebarCollapsed ? 70 : 280,
        breakpoint: "xs",
      }}
      padding={0}
      transitionDuration={700} // Adjust this value (in ms)
      transitionTimingFunction="ease" // Adjust easing
      bg="var(--app-sidebar-bg)"
    >
      {showPilotBanner && (
        <AppShell.Header>
          <PilotBanner />
        </AppShell.Header>
      )}
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
