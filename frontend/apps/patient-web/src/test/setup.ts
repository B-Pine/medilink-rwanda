import "@testing-library/jest-dom/vitest";

import { Blob as NodeBlob, File as NodeFile } from "node:buffer";

import { createMockServer } from "@medilink/api-client/mocks/node";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

// The whole workspace runs in parallel; give async queries room on slow CI machines.
configure({ asyncUtilTimeout: 15_000 });

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
// Uploads in tests: jsdom's XHR, FormData and File can't travel through Node's fetch to MSW.
// Use Node's own FormData/File/Blob and let uploads take their fetch path (browsers use XHR).
(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = undefined;
const nodeFormData = (
  await new Response("a=1", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).formData()
).constructor as typeof FormData;
// React 19 builds `new FormData(form, submitter)` when a submit is prevented inside a transition
// (router navigation); Node's FormData can't read a jsdom form, so copy its text fields over.
const JsdomFormData = window.FormData;
class FormDataFromForm extends nodeFormData {
  constructor(form?: HTMLFormElement, submitter?: HTMLElement | null) {
    super();
    if (!form) return;
    for (const [name, value] of new JsdomFormData(form, submitter)) {
      if (typeof value === "string") this.append(name, value);
    }
  }
}
for (const [name, value] of Object.entries({
  FormData: FormDataFromForm,
  File: NodeFile,
  Blob: NodeBlob,
})) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  Object.defineProperty(window, name, { value, writable: true, configurable: true });
}
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
