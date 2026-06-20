import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Build into ./dist (served by FastAPI). Dev server proxies /api to uvicorn.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8077" } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" },
});
