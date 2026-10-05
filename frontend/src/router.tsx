import { createBrowserRouter } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import { AppLayout } from "./components/layout/AppLayout";
import DatasetUploadPage from "./pages/DatasetUploadPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AdminRoute } from "./components/auth/AdminRoute";
import { PublicRoute } from "./components/auth/PublicRoute";
import AnnotationPage from "./pages/AIAnnotationPage";
import CodebookLandingPage from "./pages/CodebookLandingPage";
import LandingPage from "./pages/LandingPage";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import NewAnnotationTaskPage from "./pages/NewAnnotationTaskPage";
import AnnotateDatasetPage from "./pages/AnnotateDatasetPage.tsx";
import AnnotateDatasetLandingPage from "./pages/AnnotateDatasetLandingPage.tsx";

export const router = createBrowserRouter([
  // Public landing page (no auth required)
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    element: <PublicRoute />,
    children: [
      // Redirect to home if user is logged in
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/signup",
        element: <SignUpPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      // Protected routes - wrapped in AppLayout
      {
        element: <AppLayout />,
        children: [
          {
            path: "/home",
            element: <CodebookLandingPage />,
          },
          {
            path: "/new-codebook",
            element: <DatasetUploadPage />,
          },
          {
            path: "/codebook-creation/:taskId?",
            element: <AnnotationPage />,
          },
          {
            path: "/new-annotation",
            element: <NewAnnotationTaskPage />,
          },
          {
            path: "/new-annotation/:taskId",
            element: <NewAnnotationTaskPage />,
          },
          {
            path: "/annotate-dataset/:id",
            element: <AnnotateDatasetPage />,
          },
          {
            path: "/annotate-dataset-landing",
            element: <AnnotateDatasetLandingPage />,
          },
          {
            path: "/dashboard/:taskId",
            element: <DashboardPage />,
          },
        ],
      },
      // Hidden admin area (no nav tab). Also enforced server-side.
      {
        element: <AdminRoute />,
        children: [
          {
            path: "/admin",
            element: <AdminPage />,
          },
        ],
      },
    ],
  },
]);
