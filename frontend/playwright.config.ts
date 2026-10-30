import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  outputDir: path.join(os.tmpdir(), "hitl-codebook-playwright-results"),
  use: { baseURL: "http://127.0.0.1:15173" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 15173",
    url: "http://127.0.0.1:15173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
