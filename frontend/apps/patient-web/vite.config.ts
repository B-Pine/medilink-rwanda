import {
  defineAppEnv,
  medilinkCsp,
  medilinkMockWorker,
  resolveAppEnv,
} from "@medilink/config/vite";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { vitePrerenderPlugin } from "vite-prerender-plugin";

import { APP_SHELL, pwaOptions } from "./pwa.config";

/**
 * Keep an empty copy of index.html as the app shell, before the prerender plugin fills
 * index.html with the landing page: the service worker and the host serve it for every path
 * that has no pre-rendered file (e.g. /login), so no page ever flashes the landing page.
 */
function appShell(): Plugin {
  return {
    name: "medilink-app-shell",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") this.error("index.html missing from the bundle");
      this.emitFile({ type: "asset", fileName: APP_SHELL.slice(1), source: index.source });
    },
  };
}

// Patient app + public pages: static build (dist/) on its own host (ADR 0006), installable PWA.
export default defineConfig(({ mode }) => {
  const appEnv = resolveAppEnv(mode, loadEnv(mode, import.meta.dirname, "VITE_"));
  return {
    plugins: [
      react(),
      tailwindcss(),
      // upgrade 17: the patient site loads Google's sign-in button (staff sites never do)
      medilinkCsp({ ...appEnv, googleSignIn: true }),
      medilinkMockWorker(appEnv),
      // Order matters: the shell is copied before the prerender plugin rewrites index.html.
      appShell(),
      // Public pages pre-rendered at build time (design 06 H8, ADR 0006): /, /for-facilities and
      // /facilities/<slug> (found by the prerender script). See src/prerender/.
      vitePrerenderPlugin({
        renderTarget: "#root",
        prerenderScript: resolve(import.meta.dirname, "src/prerender/prerender.tsx"),
      }),
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
