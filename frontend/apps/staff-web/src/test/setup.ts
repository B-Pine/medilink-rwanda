import "@testing-library/jest-dom/vitest";

import { createMockServer } from "@medilink/api-client/mocks/node";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

// jsdom gaps used by Radix and axe.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

/** The Sprint 0 contract mocks, shared by every test (state reset after each test). */
export const mockApi = createMockServer();

beforeAll(() => mockApi.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  mockApi.reset();
  mockApi.server.resetHandlers();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterAll(() => mockApi.server.close());
