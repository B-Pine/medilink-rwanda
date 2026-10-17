import { defineAppEnv, medilinkCsp, resolveAppEnv } from "@medilink/config/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Staff app: static build (dist/), served from its own host (ADR 0006).
export default defineConfig(({ mode }) => {
  const appEnv = resolveAppEnv(mode, loadEnv(mode, import.meta.dirname, "VITE_"));
  return {
    plugins: [react(), tailwindcss(), medilinkCsp(appEnv)],
    define: defineAppEnv(appEnv),
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      target: "es2022",
      sourcemap: true,
    },
  };
});
