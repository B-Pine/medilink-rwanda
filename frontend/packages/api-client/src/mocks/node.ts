import { setupServer } from "msw/node";

import { createMockApi, type MockHandlerOptions } from "./handlers";

/** MSW server for Vitest (Node). Call `reset()` between tests. */
export function createMockServer(options: MockHandlerOptions = {}) {
  const api = createMockApi(options);
  const server = setupServer(...api.handlers);
  return { server, reset: () => api.reset() };
}
