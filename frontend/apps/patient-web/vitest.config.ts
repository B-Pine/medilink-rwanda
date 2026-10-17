import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify("http://localhost:8000"),
    "import.meta.env.VITE_USE_MOCKS": JSON.stringify("false"),
  },
  test: {
    name: "patient-web",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "pwa.test.ts"],
    testTimeout: 20_000,
  },
});
