import { defineConfig } from "vitest/config";

/** One `pnpm test` for the whole workspace: each package/app is a Vitest project. */
export default defineConfig({
  test: {
    projects: [
      "packages/api-client/vitest.config.ts",
      "packages/ui/vitest.config.ts",
      "apps/staff-web/vitest.config.ts",
      "apps/patient-web/vitest.config.ts",
      {
        test: {
          name: "workspace",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
    ],
  },
});
