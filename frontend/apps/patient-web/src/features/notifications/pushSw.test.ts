// S9-F9: the web push service worker (public/push-sw.js) shows notifications, keeps critical ones
// on screen, opens only same-origin /notifications/… paths and makes no requests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

const SOURCE = readFileSync(resolve(__dirname, "../../../public/push-sw.js"), "utf8");
const ORIGIN = "https://medilink.rw";

function loadWorker(windows: { url: string }[] = []) {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve(null));
  const navigate = vi.fn((path: string) => Promise.resolve(path));
  const clients = windows.map((w) => ({
    url: w.url,
    focus: vi.fn(() => Promise.resolve({ navigate })),
  }));
  const scope = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: { matchAll: vi.fn(() => Promise.resolve(clients)), openWindow },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
  };
  const fetchSpy = vi.fn();
  runInNewContext(SOURCE, { self: scope, fetch: fetchSpy, URL, String, Boolean });
  return { listeners, showNotification, openWindow, navigate, clients, fetchSpy };
}

function pushEvent(payload: unknown) {
  let waited: Promise<unknown> | undefined;
  return {
    event: {
      data: { json: () => payload },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    },
    done: () => waited,
  };
}

function clickEvent(url: unknown) {
  let waited: Promise<unknown> | undefined;
  const close = vi.fn();
  return {
    event: {
      notification: { close, data: { url } },
      waitUntil: (p: Promise<unknown>) => (waited = p),
    },
    close,
    done: () => waited,
  };
}

describe("push service worker (S9-F9)", () => {
  it("shows a routine notification with the payload fields", async () => {
    const sw = loadWorker();
    const push = pushEvent({
      v: 1,
      id: "n1",
      title: "Your turn soon",
      body: "3 ahead",
      url: "/notifications/n1",
      priority: "important",
    });
    sw.listeners.push!(push.event);
    await push.done();
    expect(sw.showNotification).toHaveBeenCalledWith(
      "Your turn soon",
      expect.objectContaining({
        body: "3 ahead",
        tag: "n1",
        requireInteraction: false,
        renotify: false,
        data: { url: "/notifications/n1" },
      }),
    );
  });

  it("keeps critical notifications on screen and alerts again", async () => {
    const sw = loadWorker();
    const push = pushEvent({ id: "n2", title: "Come now", tag: "visit-1", priority: "critical" });
    sw.listeners.push!(push.event);
    await push.done();
    expect(sw.showNotification).toHaveBeenCalledWith(
      "Come now",
      expect.objectContaining({ requireInteraction: true, renotify: true, tag: "visit-1" }),
    );
  });

  it("ignores pushes without a usable payload", () => {
    const sw = loadWorker();
    sw.listeners.push!({ data: null, waitUntil: vi.fn() });
    sw.listeners.push!(pushEvent({ body: "no title" }).event);
    sw.listeners.push!({
      data: {
        json: () => {
          throw new Error("bad json");
        },
      },
      waitUntil: vi.fn(),
    });
    expect(sw.showNotification).not.toHaveBeenCalled();
  });

  it.each([
    ["https://evil.example/notifications/x", "/notifications"],
    ["/visits/1", "/notifications"],
    ["javascript:alert(1)", "/notifications"],
    [undefined, "/notifications"],
    ["/notifications/n3?from=push", "/notifications/n3?from=push"],
  ])("a click on %s opens %s", async (url, expected) => {
    const sw = loadWorker();
    const click = clickEvent(url);
    sw.listeners.notificationclick!(click.event);
    await click.done();
    expect(click.close).toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledWith(expected);
  });

  it("focuses an open MediLink window instead of opening another", async () => {
    const sw = loadWorker([{ url: "https://other.example/" }, { url: `${ORIGIN}/visits` }]);
    const click = clickEvent("/notifications/n4");
    sw.listeners.notificationclick!(click.event);
    await click.done();
    expect(sw.clients[0]!.focus).not.toHaveBeenCalled();
    expect(sw.clients[1]!.focus).toHaveBeenCalled();
    expect(sw.navigate).toHaveBeenCalledWith("/notifications/n4");
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("makes no requests and registers no fetch handler", () => {
    const sw = loadWorker();
    sw.listeners.pushsubscriptionchange!({});
    expect(sw.fetchSpy).not.toHaveBeenCalled();
    expect(Object.keys(sw.listeners).sort()).toEqual([
      "notificationclick",
      "push",
      "pushsubscriptionchange",
    ]);
    expect(SOURCE).not.toMatch(/\bfetch\(|caches\./);
  });
});
