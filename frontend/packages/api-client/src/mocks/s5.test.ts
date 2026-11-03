import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import { FACILITIES, MOCK_PASSWORD, MOCK_TOTP_CODE } from "./data";
import { PARENT_PATIENT_ID } from "./features/patients-store";
import { createMockServer } from "./node";

/** S5-F1: the S5 mocks follow the contract (sprint-05 §3, R4 field names), through the client. */

const BASE = "http://localhost:8000";
const { server, reset } = createMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => reset());
afterAll(() => server.close());

let api: MediLinkApi;
beforeEach(() => {
  api = createMediLinkApi(createApiClient({ baseUrl: BASE, getLanguage: () => "en" }));
});

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const patient = () =>
  api.patientAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD });

async function reception() {
  await api.staffAuth.login({ email: "reception@medilink.test", password: MOCK_PASSWORD });
  await api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
}

async function serviceAt(slug: string, remote: boolean) {
  const facility = await api.booking.facility(slug);
  return facility.services.find((s) => s.remote_join === remote)!;
}

describe("remote join and I'm here (B8, B9)", () => {
  it("joins today's queue once per Idempotency-Key, as a remote ticket", async () => {
    await patient();
    const me = await api.patientAuth.me();
    const service = await serviceAt(FACILITIES.remera.slug, true);
    const body = {
      facility_slug: FACILITIES.remera.slug,
      service_id: service.id,
      patient_id: me.profiles[0]!.patient_id,
    };
    const joined = await api.booking.remoteJoin(body, "join-key-1");
    expect(joined).toMatchObject({
      facility_name: FACILITIES.remera.name,
      state: "waiting",
      is_remote: true,
      remote_arrival_claimed_at: null,
      remote_arrival_confirmed_at: null,
    });
    const again = await api.booking.remoteJoin(body, "join-key-1");
    expect(again.visit_id).toBe(joined.visit_id);
    const visits = await api.queue.patientVisits();
    expect(visits.results.map((v) => v.visit_id)).toContain(joined.visit_id);
  });

  it("refuses a service without remote join (422)", async () => {
    await patient();
    const me = await api.patientAuth.me();
    const service = await serviceAt(FACILITIES.nyamirambo.slug, false);
    const error = await failure(
      api.booking.remoteJoin({
        facility_slug: FACILITIES.nyamirambo.slug,
        service_id: service.id,
        patient_id: me.profiles[0]!.patient_id,
      }),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe("remote_closed");
  });

  it("I'm here records the claim only; reception confirms the arrival", async () => {
    await patient();
    const me = await api.patientAuth.me();
    const service = await serviceAt(FACILITIES.remera.slug, true);
    const joined = await api.booking.remoteJoin({
      facility_slug: FACILITIES.remera.slug,
      service_id: service.id,
      patient_id: me.profiles[0]!.patient_id,
    });
    const claimed = await api.booking.arrived(joined.visit_id);
    expect(claimed.remote_arrival_claimed_at).not.toBeNull();
    expect(claimed.remote_arrival_confirmed_at).toBeNull();
    expect(claimed.is_remote).toBe(true);
    expect(claimed.state).toBe("waiting");
  });

  it("a delegate cannot join a queue for the patient (403)", async () => {
    await patient();
    const service = await serviceAt(FACILITIES.remera.slug, true);
    const error = await failure(
      api.booking.remoteJoin({
        facility_slug: FACILITIES.remera.slug,
        service_id: service.id,
        patient_id: PARENT_PATIENT_ID,
        symptoms: [{ code: "cough" }],
      }),
    );
    expect(error.status).toBe(403);
  });

  it("a walk-in ticket has no I'm here (422)", async () => {
    await patient();
    const visits = await api.queue.patientVisits();
    const walkIn = visits.results.find((v) => !v.is_remote)!;
    const error = await failure(api.booking.arrived(walkIn.visit_id));
    expect(error.status).toBe(422);
  });
});

describe("reception: remote arrival and booked check-in", () => {
  it("the board flags remote joiners; confirm arrival is a ticket action (R4 #102)", async () => {
    await reception();
    const board = await api.queue.board();
    const waiting = board.queues.flatMap((q) => q.waiting);
    const claimed = waiting.find((t) => t.is_remote && t.remote_arrival_claimed_at)!;
    expect(claimed.remote_arrival_confirmed_at).toBeNull();
    expect(claimed.flags).toContain("remote_claimed");
    const notHere = waiting.find((t) => t.is_remote && !t.remote_arrival_claimed_at)!;
    expect(notHere.flags).toContain("remote");
    const stale = await failure(
      api.queue.confirmArrival({ id: claimed.id, version: claimed.version + 3 }),
    );
    expect(stale.status).toBe(409);
    const confirmed = await api.queue.confirmArrival(claimed);
    expect(confirmed.remote_arrival_confirmed_at).not.toBeNull();
    expect(confirmed.version).toBe(claimed.version + 1);
    expect(confirmed.flags).not.toContain("remote_claimed");
    // already confirmed: 422
    const again = await failure(api.queue.confirmArrival(confirmed));
    expect(again.status).toBe(422);
  });

  it("confirm arrival refuses a walk-in ticket (422)", async () => {
    await reception();
    const board = await api.queue.board();
    const walkIn = board.queues.flatMap((q) => q.waiting).find((t) => !t.is_remote)!;
    const error = await failure(api.queue.confirmArrival(walkIn));
    expect(error.status).toBe(422);
  });

  it("a booking checked in after the grace window is queued as a walk-in (late)", async () => {
    await reception();
    const { results } = await api.booking.staff.bookings({ status: "confirmed" });
    const late = results.find((b) => b.late);
    const onTime = results.find((b) => !b.late);
    if (late) {
      const out = await api.queue.checkIn({ booking_id: late.id });
      expect(out.late).toBe(true);
      expect(out.ticket.slot_starts_at).toBeNull();
      expect(out.ticket.late).toBe(true);
      expect(out.ticket.flags).toContain("late");
    }
    if (onTime) {
      const out = await api.queue.checkIn({
        booking_id: onTime.id,
        symptoms: [{ code: "fever", duration_days: 2 }],
      });
      expect(out.late).toBe(false);
      expect(out.ticket.slot_starts_at).toBe(onTime.starts_at);
    }
    expect(late ?? onTime).toBeDefined();
  });
});

describe("public facility profile (P2, R4 #102)", () => {
  it("lists accepted insurers and no amounts (U-01)", async () => {
    const facility = await api.booking.facility(FACILITIES.kigaliClinic.slug);
    const general = facility.services.find((s) => s.code === "general_consultation")!;
    expect(general.insurers).toEqual(["rama", "mmi"]);
    expect(general).not.toHaveProperty("fee_rwf");
  });
});

describe("bookings (B3, B5, R3, R4)", () => {
  async function bookFirstSlot(key?: string) {
    const me = await api.patientAuth.me();
    const service = await serviceAt(FACILITIES.remera.slug, true);
    const week = await api.booking.slots(FACILITIES.remera.slug, { service_id: service.id });
    const slot = week.days.flatMap((d) => d.slots)[0]!;
    const hold = await api.booking.hold(slot.id);
    return api.booking.book(
      {
        hold_id: hold.hold_id,
        patient_id: me.profiles[0]!.patient_id,
        insurance_profile_id: null,
        symptoms: [{ code: "cough" }],
        reason_text: "",
      },
      key,
    );
  }

  it("a repeated booking request with the same Idempotency-Key returns the same booking", async () => {
    await patient();
    const first = await bookFirstSlot("book-key-1");
    const replay = await api.booking.book(
      {
        hold_id: "00000000-0000-4000-8000-000000000000",
        patient_id: first.patient_id,
        insurance_profile_id: null,
        symptoms: [{ code: "cough" }],
        reason_text: "",
      },
      "book-key-1",
    );
    expect(replay.id).toBe(first.id);
  });

  it("serves the booking as an iCalendar file", async () => {
    await patient();
    const booking = await bookFirstSlot();
    const response = await fetch(api.booking.icsUrl(booking.id));
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    const text = await response.text();
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain(`UID:${booking.id}@medilink.rw`);
  });

  it("reschedule checks the version before the hold (409, not hold_expired)", async () => {
    await patient();
    const booking = await bookFirstSlot();
    const error = await failure(
      api.booking.reschedule(
        booking.id,
        booking.version + 1,
        "00000000-0000-4000-8000-000000000000",
      ),
    );
    expect(error.status).toBe(409);
    const expired = await failure(
      api.booking.reschedule(booking.id, booking.version, "00000000-0000-4000-8000-000000000000"),
    );
    expect(expired.code).toBe("hold_expired");
  });

  it("staff reschedule refuses a booking that is no longer confirmed (422 cancel_closed)", async () => {
    await reception();
    const { results } = await api.booking.staff.bookings({ status: "no_show" });
    const missed = results[0]!;
    const error = await failure(
      api.booking.staff.reschedule(
        missed.id,
        missed.version,
        "00000000-0000-4000-8000-000000000000",
      ),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe("cancel_closed");
  });
});
