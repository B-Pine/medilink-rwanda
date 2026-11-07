import "./styles.css";

import { initTextSize, initTheme } from "@medilink/ui";
import { hydrate } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { routes } from "./app/routes";
import { AppProviders, createServices } from "./app/services";
import { loadLazyMatches, takePrerenderData } from "./prerender/shared";

async function enableMocks() {
  // Compared directly so the build drops the mocks entirely unless VITE_USE_MOCKS=true.
  if (import.meta.env.VITE_USE_MOCKS !== "true") return;
  const { startMockWorker } = await import("@medilink/api-client/mocks/browser");
  await startMockWorker({ serviceWorkerUrl: `${import.meta.env.BASE_URL}mockServiceWorker.js` });
}

const UPDATE_CHECK_MS = 60 * 60 * 1000;

async function registerPwa() {
  // Production only, and never together with the MSW worker (same scope).
  if (!import.meta.env.PROD || import.meta.env.VITE_USE_MOCKS === "true") return;
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({
    immediate: true,
    // Phones resume a backgrounded tab or installed app without a navigation, so the browser never
    // checks for a new worker on its own: check when the app comes back into view and hourly.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, UPDATE_CHECK_MS);
    },
  });
}

async function bootstrap() {
  // follows the system like the staff app (audit 2026-11-07, phase 5); Settings can pin one
  initTheme("system");
  initTextSize();
  await enableMocks();
  const services = createServices();
  const container = document.getElementById("root");
  if (!container) throw new Error("#root not found");

  // Public pages are pre-rendered at build time (prerender/). Hydrate a static page when the
  // markup is for this path and language; otherwise render afresh (React replaces the snapshot),
  // seeded with the build's data so the page doesn't flash a spinner.
  const path = window.location.pathname;
  const prerendered = takePrerenderData(container, path);
  if (prerendered) hydrate(services.queryClient, prerendered.queries);
  const canHydrate =
    prerendered?.hydrate === true && prerendered.language === services.i18n.resolvedLanguage;
  if (canHydrate) await loadLazyMatches(routes, path);

  const router = createBrowserRouter(routes);
  const app = (
    <StrictMode>
      <AppProviders services={services}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>
  );
  if (canHydrate) hydrateRoot(container, app);
  else createRoot(container).render(app);
  void registerPwa();
}

void bootstrap();
