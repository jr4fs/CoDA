import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
//
// The @common alias mirrors the path in tsconfig.app.json / tsconfig.node.json and
// is required for a clean resolve during the production build.
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read env from the single repo-root .env (only VITE_* vars are exposed to the
  // client). In Docker the build passes VITE_* as build args, so no root .env is
  // needed there.
  envDir: path.resolve(dirname, '..'),
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@common': path.resolve(dirname, '../common/src'),
    },
  },
});
