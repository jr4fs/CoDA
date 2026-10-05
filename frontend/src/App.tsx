import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/notifications/styles.css";
import { MantineProvider, localStorageColorSchemeManager } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { Provider } from "react-redux";
import { store } from "./store/store";

export default function App() {
  const colorSchemeManager = localStorageColorSchemeManager({
    key: "annotation-tool-color-scheme",
  });

  return (
    <Provider store={store}>
      <MantineProvider
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="light"
      >
        <Notifications position="top-right" />
        <RouterProvider router={router} />
      </MantineProvider>
    </Provider>
  );
}
