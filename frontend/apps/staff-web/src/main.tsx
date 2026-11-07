import "./styles.css";

import { applyTheme } from "@medilink/ui";
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

async function bootstrap() {
  // staff screens follow the device: light or dark as the system is set (2026-11-06)
  applyTheme("system");
  await enableMocks();
  const services = createServices();
  // Served under a path prefix on Vercel (/staff/, vite --base); "/" everywhere else.
  const router = createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  });
  const container = document.getElementById("root");
  if (!container) throw new Error("#root not found");
  createRoot(container).render(
    <StrictMode>
      <AppProviders services={services}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();
