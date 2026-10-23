import type { ApiClient } from "../client";
import type { StaffMe } from "../types";

/** Staff idle lock, PIN unlock and step-up (docs/architecture/contracts/sprint-01 §2.5, §3.3). */

export type UnlockMethod = "pin" | "password";

export interface LockState {
  is_locked: boolean;
  locked_at: string | null;
  full_name: string;
  unlock_methods: UnlockMethod[];
  attempts_remaining: number;
}

export type UnlockRequest = { pin: string } | { password: string };

export interface StepUpRequest {
  method: "password_totp";
  password: string;
  code: string;
}

export interface StepUpResult {
  step_up_valid_until: string;
}

export const securityPaths = {
  lock: "/api/v1/staff/auth/lock/",
  unlock: "/api/v1/staff/auth/unlock/",
  pin: "/api/v1/staff/auth/pin/",
  stepUp: "/api/v1/staff/auth/step-up/",
} as const;

// 401 is a normal answer here (locked session, ended session): the caller handles it.
const own401 = { skipUnauthorizedHook: true } as const;

export function createSecurityApi(client: ApiClient) {
  return {
    lockState: (signal?: AbortSignal) =>
      client.get<LockState>(securityPaths.lock, signal ? { signal, ...own401 } : own401),
    lock: () => client.post<void>(securityPaths.lock, undefined, own401),
    unlock: (body: UnlockRequest) => client.post<StaffMe>(securityPaths.unlock, body, own401),
    setPin: (pin: string) => client.request<void>("PUT", securityPaths.pin, { body: { pin } }),
    removePin: () => client.request<void>("DELETE", securityPaths.pin),
    stepUp: (body: Omit<StepUpRequest, "method">) =>
      client.post<StepUpResult>(securityPaths.stepUp, { method: "password_totp", ...body }, own401),
  };
}

export type SecurityApi = ReturnType<typeof createSecurityApi>;
