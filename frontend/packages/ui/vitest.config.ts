import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  test: {
    name: "ui",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The whole workspace runs in parallel; component + axe tests need room on slow machines.
    testTimeout: 20_000,
  },
});
