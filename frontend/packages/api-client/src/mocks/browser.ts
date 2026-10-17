import { setupWorker } from "msw/browser";

import { createMockApi } from "./handlers";
import { createCookieStore } from "./session-store";

export interface StartMockWorkerOptions {
  /** URL of the worker script copied into the app's public/ folder (`msw init`). */
  serviceWorkerUrl?: string;
  latencyMs?: number;
}

/**
 * Start the MSW service worker with the Sprint 0 contract mocks.
 * Only imported (dynamically) when the app is built with VITE_USE_MOCKS=true.
 */
export async function startMockWorker(options: StartMockWorkerOptions = {}) {
  const api = createMockApi({ store: createCookieStore(), latencyMs: options.latencyMs ?? 250 });
  const worker = setupWorker(...api.handlers);
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: options.serviceWorkerUrl ?? "/mockServiceWorker.js" },
  });
  return worker;
}
