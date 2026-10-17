import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "api-client",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
