import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/notifications/styles.css";
import { useEffect, useState, ReactNode } from "react";
import { MantineProvider, LoadingOverlay } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { setupWorker } from "msw/browser";
import userReducer from "../store/userSlice";
import { AppLayout } from "../components/layout/AppLayout";
import AnnotationPage from "../pages/AIAnnotationPage";
import CodebookLandingPage from "../pages/CodebookLandingPage";
import DatasetUploadPage from "../pages/DatasetUploadPage";
import LandingPage from "../pages/LandingPage";
import { handlersWildlife } from "./mswHandlers";
import { DemoProvider } from "./DemoContext";
import { DemoBanner } from "./DemoBanner";
import "./demo-layout.css";
import DashboardPage from "../pages/DashboardPage";

const makeStore = () =>
  configureStore({
    reducer: { user: userReducer },
    preloadedState: {
      user: {
        user: { id: "demo-user", name: "Demo User", username: "demo", email: "demo@example.com" },
        accessToken: "demo-token",
        refreshToken: "demo-refresh",
      },
    },
  });

interface DemoAppProps {
  initMSW?: boolean;
  createRouter?: boolean;
  route?: string;
  element?: ReactNode;
}

export default function DemoApp({ initMSW = false, createRouter = false, route = "/", element }: DemoAppProps) {
  const [mswReady, setMswReady] = useState(!initMSW);

  useEffect(() => {
    if (!initMSW) return;

    const worker = setupWorker(...handlersWildlife);
    worker
      .start({ onUnhandledRequest: "bypass" })
      .then(() => {
        setMswReady(true);
      })
      .catch((err) => {
        console.error("Failed to start MSW:", err);
        setMswReady(true);
      });

    return () => {
      worker.stop();
    };
  }, [initMSW]);

  if (!mswReady) {
    return (
      <MantineProvider defaultColorScheme="dark">
        <LoadingOverlay visible={true} overlayProps={{ blur: 2 }} />
      </MantineProvider>
    );
  }

  const content = (
    <div className="demo-app-wrapper">
      <div className="demo-banner-wrapper">
        <DemoBanner />
      </div>
      <div className="demo-content-wrapper">
        <AppLayout />
      </div>
    </div>
  );

  // If createRouter is true (for Storybook/standalone), create a memory router
  if (createRouter) {
    const router = createMemoryRouter(
      [
        { path: "/", element: <LandingPage /> },
        {
          element: content,
          children: [
            { path: "/home", element: <CodebookLandingPage /> },
            { path: "/new-codebook", element: <DatasetUploadPage /> },
            { path: "/codebook-creation/:taskId", element: <AnnotationPage /> },
            { path: "/dashboard/:taskId", element: <DashboardPage /> },
          ],
        },
      ],
      { initialEntries: [route] },
    );

    return (
      <DemoProvider>
        <Provider store={makeStore()}>
          <MantineProvider defaultColorScheme="light">
            <Notifications position="top-right" />
            {element ?? <RouterProvider router={router} />}
          </MantineProvider>
        </Provider>
      </DemoProvider>
    );
  }

  // Otherwise, just render the content (will use parent router from main app)
  return (
    <DemoProvider>
      <Provider store={makeStore()}>
        <MantineProvider defaultColorScheme="dark">
          <Notifications position="top-right" />
          {element ?? content}
        </MantineProvider>
      </Provider>
    </DemoProvider>
  );
}
