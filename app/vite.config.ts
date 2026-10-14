/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? "1.0.0-dev"),
  },
  server: {
    port: 5173,
    proxy: {
      // During local development the API runs separately on :8787.
      "/_api": "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    testTimeout: 20_000,
  },
});
