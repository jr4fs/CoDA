import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],

  envDir: path.resolve(dirname, ".."),

  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
      "@common": path.resolve(dirname, "../common/src"),
    },
  },

  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8080",
      "/embedding": "http://localhost:8000",
      "/anonymize": "http://localhost:8000",
      "/chat": "http://localhost:8000",
      "/inference": "http://localhost:8000",
    },
  },
});
