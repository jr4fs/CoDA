import { setupWorker } from "msw/browser";
import { createRoot } from "react-dom/client";
import "./index.css";
import DemoApp from "./demo/DemoApp";
import { handlersWildlife } from "./demo/mswHandlers";

const worker = setupWorker(...handlersWildlife);

worker.start({ onUnhandledRequest: "bypass" }).then(() => {
  const root = document.getElementById("demo-root");
  if (root) {
    createRoot(root).render(<DemoApp createRouter initMSW={false} />);
  }
});
