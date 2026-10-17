import "./styles.css";

import { initTheme } from "@medilink/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { routes } from "./app/routes";
import { AppProviders, createServices } from "./app/services";

async function enableMocks() {
  // Compared directly so the build drops the mocks entirely unless VITE_USE_MOCKS=true.
  if (import.meta.env.VITE_USE_MOCKS !== "true") return;
  const { startMockWorker } = await import("@medilink/api-client/mocks/browser");
  await startMockWorker({ serviceWorkerUrl: `${import.meta.env.BASE_URL}mockServiceWorker.js` });
}

async function registerPwa() {
  // Production only, and never together with the MSW worker (same scope).
  if (!import.meta.env.PROD || import.meta.env.VITE_USE_MOCKS === "true") return;
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}

async function bootstrap() {
  initTheme();
  await enableMocks();
  const services = createServices();
  const router = createBrowserRouter(routes);
  const container = document.getElementById("root");
  if (!container) throw new Error("#root not found");
  createRoot(container).render(
    <StrictMode>
      <AppProviders services={services}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
  void registerPwa();
}

void bootstrap();
