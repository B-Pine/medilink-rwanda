import { ApiError, networkError, parseErrorResponse } from "./errors";
import type { CsrfResponse } from "./types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const CSRF_PATH = "/api/v1/csrf/";

export interface ApiClientOptions {
  /** API origin, e.g. `https://api.medilink.rw` (VITE_API_BASE_URL). No trailing slash needed. */
  baseUrl: string;
  /** Current UI language, sent as Accept-Language (`rw` | `en` | `fr`). */
  getLanguage?: () => string;
  /**
   * Called when a request returns 401 (session missing or expired), unless the call opted out
   * (login and MFA calls do, because 401 is an expected answer there).
   */
  onUnauthorized?: (error: ApiError) => void;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Do not call `onUnauthorized` for a 401 from this request. */
  skipUnauthorizedHook?: boolean;
  /** The server rotates the CSRF secret when the session changes (login, MFA, facility switch, logout). */
  rotatesSession?: boolean;
}

export interface ApiClient {
  readonly baseUrl: string;
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: Omit<RequestOptions, "body">): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">): Promise<T>;
  /** Fetch (once) the CSRF token from GET /api/v1/csrf/ and keep it in memory only. */
  ensureCsrfToken(): Promise<string>;
  /** Forget the cached CSRF token (the next unsafe request fetches a new one). */
  resetCsrfToken(): void;
}

/**
 * Fetch wrapper for the MediLink API (docs/architecture/02-api-conventions.md, ADR 0006):
 *  - `credentials: "include"` so the API host's session cookie is sent cross-origin
 *  - CSRF token bootstrapped from GET /api/v1/csrf/ (the frontend cannot read the API cookie)
 *    and sent as `X-CSRFToken` on unsafe methods; refreshed after session changes and retried
 *    once on `403 csrf_failed`
 *  - `Accept-Language` from the UI language
 *  - errors parsed into a typed ApiError
 * Nothing is ever written to localStorage/sessionStorage.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch: typeof fetch = (...args) => (options.fetch ?? globalThis.fetch)(...args);
  const language = () => options.getLanguage?.() ?? "rw";

  let csrfToken: string | null = null;
  let csrfRequest: Promise<string> | null = null;

  const url = (path: string) => `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  function baseHeaders(): Record<string, string> {
    return { Accept: "application/json", "Accept-Language": language() };
  }

  async function send(input: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(input, { ...init, credentials: "include", mode: "cors" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw networkError(error);
    }
  }

  function ensureCsrfToken(): Promise<string> {
    if (csrfToken) return Promise.resolve(csrfToken);
    csrfRequest ??= (async () => {
      try {
        const response = await send(url(CSRF_PATH), { method: "GET", headers: baseHeaders() });
        if (!response.ok) throw await parseErrorResponse(response);
        const body = (await response.json()) as CsrfResponse;
        if (!body.csrf_token) {
          throw new ApiError({
            status: response.status,
            code: "csrf_failed",
            message: "Missing CSRF token",
          });
        }
        csrfToken = body.csrf_token;
        return csrfToken;
      } finally {
        csrfRequest = null;
      }
    })();
    return csrfRequest;
  }

  function resetCsrfToken() {
    csrfToken = null;
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    requestOptions: RequestOptions = {},
    isRetry = false,
  ): Promise<T> {
    const headers = baseHeaders();
    const init: RequestInit = { method, headers };
    if (requestOptions.signal) init.signal = requestOptions.signal;
    if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(requestOptions.body);
    }
    if (UNSAFE_METHODS.has(method)) {
      headers["X-CSRFToken"] = await ensureCsrfToken();
    }

    const response = await send(url(path), init);

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      if (error.code === "csrf_failed" && !isRetry) {
        resetCsrfToken();
        return request<T>(method, path, requestOptions, true);
      }
      if (error.status === 401 && !requestOptions.skipUnauthorizedHook) {
        options.onUnauthorized?.(error);
      }
      throw error;
    }

    if (requestOptions.rotatesSession) resetCsrfToken();

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    baseUrl,
    request,
    get: (path, opts) => request("GET", path, opts),
    post: (path, body, opts) => request("POST", path, { ...opts, body }),
    ensureCsrfToken,
    resetCsrfToken,
  };
}
