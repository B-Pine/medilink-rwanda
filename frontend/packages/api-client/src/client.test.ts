import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client";
import { createMediLinkApi } from "./endpoints";
import { ApiError, isApiError } from "./errors";

/** Contract check F9: credentials, CSRF header, Accept-Language, error parsing. */

const BASE = "https://api.example.rw";

type Call = { url: string; init: RequestInit };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Fake fetch: answers /csrf/ with a counter token and routes other calls to `handler`. */
function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let csrfCount = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init };
    calls.push(call);
    if (url.endsWith("/api/v1/csrf/")) {
      csrfCount += 1;
      return json({ csrf_token: `token-${csrfCount}` });
    }
    return handler(call);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const header = (call: Call | undefined, name: string) =>
  (call?.init.headers as Record<string, string> | undefined)?.[name];

describe("createApiClient", () => {
  it("sends credentials: include, Accept and Accept-Language on every request", async () => {
    let language = "rw";
    const { fetchImpl, calls } = fakeFetch(() => json({ status: "ok", version: "0.1.0" }));
    const client = createApiClient({
      baseUrl: `${BASE}/`,
      fetch: fetchImpl,
      getLanguage: () => language,
    });

    await client.get("/api/v1/health/");
    language = "fr";
    await client.get("/api/v1/health/");

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/health/`);
    expect(calls[0]!.init.credentials).toBe("include");
    expect(header(calls[0], "Accept")).toBe("application/json");
    expect(header(calls[0], "Accept-Language")).toBe("rw");
    expect(header(calls[1], "Accept-Language")).toBe("fr");
    // Safe methods never fetch a CSRF token.
    expect(calls.some((c) => c.url.endsWith("/csrf/"))).toBe(false);
  });

  it("bootstraps the CSRF token once from GET /api/v1/csrf/ and sends X-CSRFToken", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ ok: true }));
    const client = createApiClient({ baseUrl: BASE, fetch: fetchImpl });

    await Promise.all([client.post("/api/v1/a/", { x: 1 }), client.post("/api/v1/b/", { x: 2 })]);
    await client.post("/api/v1/c/");

    const csrfCalls = calls.filter((c) => c.url.endsWith("/api/v1/csrf/"));
    expect(csrfCalls).toHaveLength(1);
    expect(csrfCalls[0]!.init.credentials).toBe("include");
    const posts = calls.filter((c) => c.init.method === "POST");
    expect(posts).toHaveLength(3);
    for (const post of posts) {
      expect(header(post, "X-CSRFToken")).toBe("token-1");
      expect(post.init.credentials).toBe("include");
    }
    expect(header(posts[0], "Content-Type")).toBe("application/json");
    expect(posts[0]!.init.body).toBe(JSON.stringify({ x: 1 }));
    expect(posts[2]!.init.body).toBeUndefined();
  });

  it("refreshes the token and retries once on 403 csrf_failed", async () => {
    let attempts = 0;
    const { fetchImpl, calls } = fakeFetch(() => {
      attempts += 1;
      return attempts === 1
        ? json({ error: { code: "csrf_failed", message: "CSRF Failed" } }, 403)
        : json({ ok: true });
    });
    const client = createApiClient({ baseUrl: BASE, fetch: fetchImpl });

    await expect(client.post("/api/v1/x/", {})).resolves.toEqual({ ok: true });
    const posts = calls.filter((c) => c.init.method === "POST");
    expect(header(posts[0], "X-CSRFToken")).toBe("token-1");
    expect(header(posts[1], "X-CSRFToken")).toBe("token-2");
  });

  it("forgets the token after calls that rotate the session", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ status: "mfa_required", user: null }));
    const api = createMediLinkApi(createApiClient({ baseUrl: BASE, fetch: fetchImpl }));

    await api.staffAuth.login({ email: "a@b.rw", password: "x" });
    await api.staffAuth.mfaVerify({ code: "123456" });

    const posts = calls.filter((c) => c.init.method === "POST");
    expect(header(posts[0], "X-CSRFToken")).toBe("token-1");
    expect(header(posts[1], "X-CSRFToken")).toBe("token-2");
  });

  it("parses the error format into a typed ApiError", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(
        {
          error: {
            code: "validation_error",
            message: "Some fields need attention.",
            fields: { email: ["Enter a valid email address."] },
            request_id: "01JAB",
          },
        },
        400,
      ),
    );
    const client = createApiClient({ baseUrl: BASE, fetch: fetchImpl });
    const error = await client.post("/api/v1/x/", {}).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe("validation_error");
    expect(apiError.message).toBe("Some fields need attention.");
    expect(apiError.fields).toEqual({ email: ["Enter a valid email address."] });
    expect(apiError.fieldError("email")).toBe("Enter a valid email address.");
    expect(apiError.requestId).toBe("01JAB");
    expect(apiError.isValidationError).toBe(true);
  });

  it("reads Retry-After on 429 and X-Request-ID when the body has none", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ error: { code: "rate_limited", message: "Slow down" } }, 429, {
        "Retry-After": "60",
        "X-Request-ID": "req-42",
      }),
    );
    const client = createApiClient({ baseUrl: BASE, fetch: fetchImpl });
    const error = (await client.get("/api/v1/x/").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfter).toBe(60);
    expect(error.requestId).toBe("req-42");
  });

  it("falls back to a code from the status for non-JSON errors", async () => {
    const { fetchImpl } = fakeFetch(
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    );
    const client = createApiClient({ baseUrl: BASE, fetch: fetchImpl });
    const error = (await client.get("/api/v1/x/").catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBe("server_error");
  });

  it("maps network failures to network_error", async () => {
    const client = createApiClient({
      baseUrl: BASE,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const error = (await client.get("/api/v1/x/").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("network_error");
    expect(error.status).toBe(0);
  });

  it("calls the 401 hook, except for auth calls that opt out", async () => {
    const onUnauthorized = vi.fn();
    const { fetchImpl } = fakeFetch(() =>
      json({ error: { code: "not_authenticated", message: "Log in" } }, 401),
    );
    const api = createMediLinkApi(
      createApiClient({ baseUrl: BASE, fetch: fetchImpl, onUnauthorized }),
    );

    // A regular call (session expired while working) triggers the hook…
    await expect(api.staffAuth.setActiveFacility("f-1")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect((onUnauthorized.mock.calls[0]![0] as ApiError).code).toBe("not_authenticated");

    // …but not login (401 = wrong password) nor me (the route guard handles it).
    await expect(
      api.staffAuth.login({ email: "a@b.rw", password: "wrong" }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(api.staffAuth.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.patientAuth.me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for 204 and 202 without body", async () => {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/logout/")
        ? new Response(null, { status: 204 })
        : new Response(null, { status: 202 }),
    );
    const api = createMediLinkApi(createApiClient({ baseUrl: BASE, fetch: fetchImpl }));
    await expect(api.staffAuth.logout()).resolves.toBeUndefined();
    await expect(api.passwordReset.request({ email: "a@b.rw" })).resolves.toBeUndefined();
  });

  it("never touches localStorage or sessionStorage", async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    try {
      const { fetchImpl } = fakeFetch(() => json({ ok: true }));
      const client = createApiClient({ baseUrl: BASE, fetch: fetchImpl });
      await client.post("/api/v1/x/", {});
      await client.get("/api/v1/y/");
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.getItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
