import {
  defineAppEnv,
  medilinkCsp,
  medilinkMockWorker,
  resolveAppEnv,
} from "@medilink/config/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { pwaOptions } from "./pwa.config";

// Patient app + public pages: static build (dist/) on its own host (ADR 0006), installable PWA.
export default defineConfig(({ mode }) => {
  const appEnv = resolveAppEnv(mode, loadEnv(mode, import.meta.dirname, "VITE_"));
  return {
    plugins: [
      react(),
      tailwindcss(),
      medilinkCsp(appEnv),
      medilinkMockWorker(appEnv),
      VitePWA(pwaOptions),
    ],
    define: defineAppEnv(appEnv),
    server: { port: 5174, strictPort: true },
    preview: { port: 4174, strictPort: true },
    build: {
      target: "es2022",
      sourcemap: true,
    },
  };
});
