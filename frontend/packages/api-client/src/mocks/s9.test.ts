import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import {
  connectNotificationSocket,
  type NotificationSocketMessage,
} from "../features/notifications";
import { FACILITIES, MOCK_PASSWORD, MOCK_TOTP_CODE } from "./data";
import { CHILD_PATIENT_ID } from "./features/patients-store";
import {
  allowedPushHost,
  emitMockNotification,
  MOCK_VAPID_PUBLIC_KEY,
  setMockCriticalLocked,
  setMockPushEnabled,
} from "./features/notifications";
import { MOCK_FACILITY_ADMIN_EMAIL } from "./features/setup";
import { createMockServer } from "./node";

/** S9-F10: the S9 mocks follow the contract (sprint-09 §3.3, §3.4), exercised through the client. */

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

async function staff(email = "reception@medilink.test") {
  await api.staffAuth.login({ email, password: MOCK_PASSWORD });
  return api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
}

const patient = () =>
  api.patientAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD });

// 65 and 16 bytes, base64url (shaped like PushSubscription.toJSON()).
const P256DH = "B".padEnd(87, "A");
const AUTH = "A".repeat(22);
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: P256DH, auth: AUTH } });

describe("inboxes", () => {
  it("needs a session; the patient inbox is seeded, newest first, with a dependent item", async () => {
    expect((await failure(api.notifications.patient.unreadCount())).status).toBe(401);
    await patient();
    const page = await api.notifications.patient.list();
    expect(page.count).toBe(3);
    expect(page.results[0]!.event_type).toBe("account.login.new_device");
    expect(page.results.some((n) => n.patient_id === CHILD_PATIENT_ID)).toBe(true);
    expect((await api.notifications.patient.unreadCount()).unread).toBe(2);
    const unread = await api.notifications.patient.list({ is_read: false });
    expect(unread.results.every((n) => !n.is_read)).toBe(true);
    const about = await api.notifications.patient.list({ patient_id: CHILD_PATIENT_ID });
    expect(about.count).toBe(1);
    expect(
      (await failure(api.notifications.patient.list({ patient_id: crypto.randomUUID() }))).status,
    ).toBe(404);
  });

  it("marks one and all as read (idempotent), and 404s for unknown ids", async () => {
    await patient();
    const [first] = (await api.notifications.patient.list({ is_read: false })).results;
    const read = await api.notifications.patient.markRead(first!.id);
    expect(read.is_read).toBe(true);
    expect((await api.notifications.patient.markRead(first!.id)).read_at).toBe(read.read_at);
    expect((await api.notifications.patient.markAllRead()).marked).toBe(1);
    expect((await api.notifications.patient.markAllRead()).marked).toBe(0);
    expect((await api.notifications.patient.unreadCount()).unread).toBe(0);
    expect((await failure(api.notifications.patient.get(crypto.randomUUID()))).status).toBe(404);
  });

  it("staff inbox: active facility + facility-less items; other facilities counted", async () => {
    await staff("doctor@medilink.test");
    await api.staffAuth.setActiveFacility(FACILITIES.kigaliClinic.id);
    const page = await api.notifications.staff.list();
    expect(
      page.results.every(
        (n) => n.facility === null || n.facility.id === FACILITIES.kigaliClinic.id,
      ),
    ).toBe(true);
    const count = await api.notifications.staff.unreadCount();
    expect(count.unread).toBe(3);
    expect(count.other_facilities).toHaveLength(2);
    expect(count.other_facilities!.every((o) => o.unread === 1)).toBe(true);
  });

  it("refuses writes without CSRF", async () => {
    await patient();
    const [first] = (await api.notifications.patient.list()).results;
    const response = await fetch(`${BASE}/api/v1/patient/notifications/${first!.id}/read/`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("csrf_failed");
  });
});

describe("preferences", () => {
  it("patient defaults (version 0), 409 on a stale version, locked critical 422", async () => {
    await patient();
    const prefs = await api.notifications.patient.preferences();
    expect(prefs.version).toBe(0);
    expect(prefs.quiet_hours).toEqual({ is_enabled: true, start: "21:00", end: "06:00" });
    expect(prefs.dependents.map((d) => d.display_name)).toEqual(["Keza", "Mukarugwiza"]);
    const saved = await api.notifications.patient.updatePreferences({
      version: 0,
      quiet_hours: { is_enabled: false, start: "21:00", end: "06:00" },
      dependents: [{ patient_id: CHILD_PATIENT_ID, receive_alerts: false }],
    });
    expect(saved.version).toBe(1);
    expect(saved.quiet_hours.is_enabled).toBe(false);
    expect(saved.dependents[0]!.receive_alerts).toBe(false);
    expect(
      (await failure(api.notifications.patient.updatePreferences({ version: 0 }))).status,
    ).toBe(409);
    const unknown = await failure(
      api.notifications.patient.updatePreferences({
        version: 1,
        channels: { critical: ["sms"], important: [], routine: [] },
      }),
    );
    expect(unknown.fields).toHaveProperty(["channels.critical"]);
    setMockCriticalLocked(true);
    const locked = await failure(
      api.notifications.patient.updatePreferences({
        version: 1,
        channels: { critical: [], important: [], routine: [] },
      }),
    );
    expect(locked.status).toBe(422);
    expect(locked.code).toBe("business_rule_violation");
  });

  it("staff preferences: sound off by default, versioned", async () => {
    await staff();
    const prefs = await api.notifications.staff.preferences();
    expect(prefs).toMatchObject({
      sound_enabled: false,
      approvals_digest: "immediate",
      version: 0,
    });
    const saved = await api.notifications.staff.updatePreferences({
      version: 0,
      sound_enabled: true,
    });
    expect(saved).toMatchObject({ sound_enabled: true, version: 1 });
    expect((await failure(api.notifications.staff.updatePreferences({ version: 0 }))).code).toBe(
      "conflict",
    );
  });
});

describe("push subscriptions", () => {
  it("public key, allowlist, 201 then 200, delete", async () => {
    expect(await api.notifications.public.webPushKey()).toEqual({
      public_key: MOCK_VAPID_PUBLIC_KEY,
      is_enabled: true,
    });
    await patient();
    for (const bad of [
      "https://evil.example/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://169.254.169.254/x",
      "https://[::1]/x",
      "http://fcm.googleapis.com/x",
      "https://user@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
    ]) {
      expect(allowedPushHost(bad), bad).toBeNull();
      const error = await failure(api.notifications.patient.subscribePush(sub(bad)));
      expect(error.status, bad).toBe(400);
      expect(error.fields).toHaveProperty("endpoint");
    }
    for (const good of [
      "https://fcm.googleapis.com/fcm/send/a",
      "https://updates.push.services.mozilla.com/wpush/v2/a",
      "https://web.push.apple.com/a",
      "https://wns2-par02p.notify.windows.com/w/a",
    ]) {
      expect(allowedPushHost(good), good).not.toBeNull();
    }
    const bad = await failure(
      api.notifications.patient.subscribePush({
        endpoint: "https://fcm.googleapis.com/fcm/send/a",
        keys: { p256dh: "short", auth: AUTH },
      }),
    );
    expect(bad.fields).toHaveProperty(["keys.p256dh"]);
    const row = await api.notifications.patient.subscribePush(
      sub("https://fcm.googleapis.com/fcm/send/a"),
    );
    expect(row.endpoint_host).toBe("fcm.googleapis.com");
    const again = await api.notifications.patient.subscribePush(
      sub("https://fcm.googleapis.com/fcm/send/a"),
    );
    expect(again.id).toBe(row.id);
    expect(await api.notifications.patient.pushSubscriptions()).toHaveLength(1);
    await api.notifications.patient.removePushSubscription(row.id);
    expect(await api.notifications.patient.pushSubscriptions()).toHaveLength(0);
    expect((await failure(api.notifications.patient.removePushSubscription(row.id))).status).toBe(
      404,
    );
  });

  it("refuses to subscribe while push is disabled (422)", async () => {
    setMockPushEnabled(false);
    expect((await api.notifications.public.webPushKey()).is_enabled).toBe(false);
    await patient();
    const error = await failure(
      api.notifications.patient.subscribePush(sub("https://fcm.googleapis.com/fcm/send/a")),
    );
    expect(error.status).toBe(422);
  });
});

describe("announcements", () => {
  const draft = {
    audience: "patients_in_range" as const,
    range_starts_on: "2026-11-06",
    range_ends_on: "2026-11-06",
    priority: "important" as const,
    title_i18n: { en: "Pediatrics closed Friday afternoon" },
    body_i18n: { en: "Patients with a visit that afternoon will be offered a new time." },
  };

  it("needs announcements.manage (facility admins)", async () => {
    await staff();
    expect((await failure(api.notifications.staff.announcements.list())).status).toBe(403);
  });

  it("draft, edit, publish (409 twice), withdraw (422 for a draft); content rules", async () => {
    const { user } = await staff(MOCK_FACILITY_ADMIN_EMAIL);
    expect(user.permissions).toContain("announcements.manage");
    const a = api.notifications.staff.announcements;
    expect((await a.list()).count).toBeGreaterThan(0);

    const clinical = await failure(
      a.create({ ...draft, body_i18n: { en: "Free HIV testing on Friday" } }),
    );
    expect(clinical.fields).toHaveProperty(["body_i18n.en"]);
    const link = await failure(
      a.create({ ...draft, body_i18n: { en: "See https://example.com for details" } }),
    );
    expect(link.fields).toHaveProperty(["body_i18n.en"]);
    const none = await failure(a.create({ ...draft, title_i18n: {}, body_i18n: {} }));
    expect(none.fields).toHaveProperty("title_i18n");
    const range = await failure(a.create({ ...draft, range_starts_on: null }));
    expect(range.fields).toHaveProperty("range_starts_on");
    const platformOnly = await failure(a.create({ ...draft, audience: "all_facilities" }));
    expect(platformOnly.fields).toHaveProperty("audience");

    const row = await a.create(draft);
    expect(row).toMatchObject({ status: "draft", version: 1 });
    const edited = await a.update(row.id, {
      version: 1,
      title_i18n: { en: "Closed Friday", rw: "Dufunze" },
    });
    expect(edited.version).toBe(2);
    expect((await failure(a.update(row.id, { version: 1 }))).status).toBe(409);
    expect((await failure(a.withdraw(row.id))).status).toBe(422);
    const published = await a.publish(row.id);
    expect(published.status).toBe("published");
    expect(published.recipient_count).toBe(0);
    expect((await failure(a.publish(row.id))).status).toBe(409);
    expect((await failure(a.update(row.id, { version: published.version }))).status).toBe(422);
    expect((await a.withdraw(row.id)).status).toBe("withdrawn");
  });

  it("platform announcements are for platform admins and reach staff inboxes", async () => {
    await staff(MOCK_FACILITY_ADMIN_EMAIL);
    expect((await failure(api.notifications.platform.announcements.list())).status).toBe(403);
    // the facility admin's inbox exists (seeded on first read)
    await api.notifications.staff.list();
    await api.staffAuth.logout();
    await staff("admin@medilink.test");
    const p = api.notifications.platform.announcements;
    const row = await p.create({
      audience: "all_facilities",
      title_i18n: { en: "New feature" },
      body_i18n: { en: "Announcements are live." },
    });
    const published = await p.publish(row.id);
    expect(published.recipient_count).toBeGreaterThan(0);
    const unknown = await failure(
      p.create({
        audience: "selected_facilities",
        target_facility_ids: [crypto.randomUUID()],
        title_i18n: { en: "x" },
        body_i18n: { en: "y" },
      }),
    );
    expect(unknown.status).toBe(404);
  });
});

describe("templates and delivery log (platform)", () => {
  it("revise (clinical word 400, stale 409) and activate (rollback)", async () => {
    await staff("admin@medilink.test");
    const t = api.notifications.platform;
    const [first] = (await t.templates({ channel: "email", language: "en" })).results;
    const hiv = await failure(
      t.reviseTemplate(first!.id, { subject: "x", body: "HIV result", based_on_version: 1 }),
    );
    expect(hiv.status).toBe(400);
    const placeholder = await failure(
      t.reviseTemplate(first!.id, { subject: "x", body: "$diagnosis", based_on_version: 1 }),
    );
    expect(placeholder.status).toBe(400);
    const v2 = await t.reviseTemplate(first!.id, {
      subject: "New sign-in",
      body: "A sign-in from $device_label.",
      based_on_version: 1,
    });
    expect(v2.template_version).toBe(2);
    expect(
      (await failure(t.reviseTemplate(first!.id, { subject: "x", body: "y", based_on_version: 1 })))
        .status,
    ).toBe(409);
    expect((await t.activateTemplate(first!.id)).is_active).toBe(true);
    expect((await failure(t.activateTemplate(first!.id))).status).toBe(409);
    expect((await t.stats()).push_opt_in.patient_accounts).toBeGreaterThan(0);
    expect((await t.deliveries()).results).toEqual(expect.any(Array));
  });
});

describe("sockets", () => {
  it("emits notification.created on the patient socket", async () => {
    await patient();
    const messages: NotificationSocketMessage[] = [];
    const statuses: string[] = [];
    const connection = connectNotificationSocket({
      baseUrl: BASE,
      audience: "patient",
      onMessage: (m) => messages.push(m),
      onStatus: (s) => statuses.push(s),
    });
    await expect.poll(() => statuses.includes("live")).toBe(true);
    const created = emitMockNotification({ audience: "patient", title: "Hello" });
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toMatchObject({ type: "notification.created", data: { id: created!.id } });
    connection.close();
  });
});
