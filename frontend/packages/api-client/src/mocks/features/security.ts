import { http, HttpResponse } from "msw";

import type { LockState } from "../../features/security";
import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "../data";
import type { FeatureMockFactory } from "../features";
import { fieldError, rule, s1, stepUpFailure, str } from "./s1-common";

/**
 * S1 lock, PIN unlock and step-up mocks (sprint-01 §3.3). Mock PIN: any acceptable PIN set with
 * PUT /staff/auth/pin/ (docs use 4826); the S0 mock TOTP code works for step-up.
 */
const MAX_FAILURES = 5;
const COMMON_PINS = new Set(["1212", "2580", "0852", "6969", "1004", "2000", "7777"]);

export function pinProblem(pin: string): "pinFormat" | "pinTooSimple" | null {
  if (!/^\d{4,6}$/.test(pin)) return "pinFormat";
  if (new Set(pin).size === 1 || COMMON_PINS.has(pin)) return "pinTooSimple";
  const steps = new Set(Array.from(pin.slice(1), (d, i) => Number(d) - Number(pin[i])));
  if (steps.size === 1 && (steps.has(1) || steps.has(-1))) return "pinTooSimple";
  return null;
}

export const securityMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let lockedAt: string | null = null;
  let failures = 0;
  let stepUpFailures = 0;

  const lockState = (
    fullName: string,
    locked: boolean,
    email: string,
    facilityId: string | null,
  ): LockState => ({
    is_locked: locked,
    locked_at: locked ? lockedAt : null,
    full_name: fullName,
    unlock_methods:
      context.pins.has(email) &&
      context.featureFlags.enabledFor(facilityId).includes("security.pin_unlock")
        ? ["pin", "password"]
        : ["password"],
    attempts_remaining: MAX_FAILURES - failures,
  });

  return {
    reset() {
      lockedAt = null;
      failures = 0;
      stepUpFailures = 0;
    },
    handlers: [
      http.get(`${api}/staff/auth/lock/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const session = context.staffSession();
        if (!session)
          return context.errorResponse(
            401,
            "not_authenticated",
            context.message("notAuthenticated", lang),
          );
        return HttpResponse.json(
          lockState(
            session.me.full_name,
            session.locked,
            session.email,
            session.me.active_facility_id,
          ),
        );
      }),

      http.post(`${api}/staff/auth/lock/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const session = context.staffSession();
        if (!session)
          return context.errorResponse(
            401,
            "not_authenticated",
            context.message("notAuthenticated", lang),
          );
        if (!session.locked) {
          lockedAt = new Date().toISOString();
          failures = 0;
          context.lockStaffSession();
        }
        return new HttpResponse(null, { status: 204 });
      }),

      http.post(`${api}/staff/auth/unlock/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const session = context.staffSession();
        if (!session)
          return context.errorResponse(
            401,
            "not_authenticated",
            context.message("notAuthenticated", lang),
          );
        const body = await context.readJson(request);
        const pin = typeof body.pin === "string" ? body.pin : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (Boolean(pin) === Boolean(password))
          return fieldError(context, lang, { pin: s1("required", lang) });
        if (!session.locked) return HttpResponse.json(session.me);
        const methods = lockState(
          "",
          true,
          session.email,
          session.me.active_facility_id,
        ).unlock_methods;
        if (pin && !methods.includes("pin")) return rule(context, lang, "pinUnavailable");
        const ok = pin ? context.pins.get(session.email) === pin : password === MOCK_PASSWORD;
        if (!ok) {
          failures += 1;
          if (failures >= MAX_FAILURES) {
            failures = 0;
            context.endStaffSession();
            return context.errorResponse(
              401,
              "not_authenticated",
              context.message("notAuthenticated", lang),
            );
          }
          return pin
            ? fieldError(context, lang, { pin: s1("wrongPin", lang) })
            : fieldError(context, lang, { password: s1("wrongPassword", lang) });
        }
        failures = 0;
        lockedAt = null;
        context.unlockStaffSession();
        return HttpResponse.json(context.staffSession()!.me);
      }),

      http.put(`${api}/staff/auth/pin/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const result = context.authenticatedStaff(lang);
        if ("error" in result) return result.error;
        const stepUp = stepUpFailure(context, lang);
        if (stepUp) return stepUp;
        const pin = str((await context.readJson(request)).pin);
        const problem = pinProblem(pin);
        if (problem) return fieldError(context, lang, { pin: s1(problem, lang) });
        context.pins.set(result.me.email, pin);
        return new HttpResponse(null, { status: 204 });
      }),

      http.delete(`${api}/staff/auth/pin/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const result = context.authenticatedStaff(lang);
        if ("error" in result) return result.error;
        context.pins.delete(result.me.email);
        return new HttpResponse(null, { status: 204 });
      }),

      http.post(`${api}/staff/auth/step-up/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const result = context.authenticatedStaff(lang);
        if ("error" in result) return result.error;
        const body = await context.readJson(request);
        if (
          body.password === MOCK_PASSWORD &&
          str(body.code ?? "").replace(/\s+/g, "") === MOCK_TOTP_CODE
        ) {
          stepUpFailures = 0;
          context.markStepUp();
          return HttpResponse.json({
            step_up_valid_until: context.staffSession()!.me.security.step_up_valid_until,
          });
        }
        stepUpFailures += 1;
        if (stepUpFailures >= MAX_FAILURES) {
          stepUpFailures = 0;
          context.endStaffSession();
          return context.errorResponse(
            401,
            "not_authenticated",
            context.message("notAuthenticated", lang),
          );
        }
        return context.errorResponse(400, "bad_request", s1("stepUpFailed", lang));
      }),
    ],
  };
};
