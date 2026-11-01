import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import { articleBlocks, pickText } from "../features/help";
import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "./data";
import { MOCK_HELP } from "./features/help";
import { MOCK_FACILITY_ADMIN_EMAIL } from "./features/setup";
import { createMockServer } from "./node";

/** S10-F8: the S10 mocks follow the contract (sprint-10 §3.2), exercised through the client. */

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

describe("help articles", () => {
  it("public: published patient articles only, search in every language, q length", async () => {
    const all = await api.help.public.articles();
    expect(all.results.every((a) => a.audience === "patient")).toBe(true);
    expect(all.results.map((a) => a.slug)).not.toContain("check-in-a-walk-in");
    const fr = await api.help.public.articles({ q: "enfant" });
    expect(fr.results.map((a) => a.slug)).toEqual(["add-a-child"]);
    expect((await failure(api.help.public.articles({ q: "a" }))).status).toBe(400);
    expect((await failure(api.help.public.article("check-in-a-walk-in"))).status).toBe(404);
    const one = await api.help.public.article("add-a-child");
    expect(one.body_i18n.en).toContain("- Open Profile");
  });

  it("staff: staff articles only; drafts hidden", async () => {
    await staff();
    const rows = (await api.help.staff.articles()).results.map((a) => a.slug);
    expect(rows).toEqual(["check-in-a-walk-in"]);
    expect((await failure(api.help.staff.article("draft-closing-checklist"))).status).toBe(404);
  });

  it("platform: create, edit (409 when stale), publish needs every language, unpublish", async () => {
    await staff("admin@medilink.test");
    const draft = await api.help.platform.createArticle({
      slug: "new-guide",
      audience: "patient",
      category: "other",
      title_i18n: { en: "New guide" },
    });
    expect(draft.status).toBe("draft");
    expect(draft.missing_languages).toEqual(["rw", "en", "fr"]);
    expect(
      (await failure(api.help.platform.updateArticle(draft.id, { version: 99, sort_order: 5 })))
        .status,
    ).toBe(409);
    expect((await failure(api.help.platform.publish(draft.id))).status).toBe(422);
    const full = { rw: "Inyandiko", en: "Text", fr: "Texte" };
    const edited = await api.help.platform.updateArticle(draft.id, {
      version: draft.version,
      title_i18n: full,
      summary_i18n: full,
      body_i18n: full,
    });
    expect(edited.missing_languages).toEqual([]);
    const published = await api.help.platform.publish(draft.id);
    expect(published.status).toBe("published");
    expect((await failure(api.help.platform.publish(draft.id))).status).toBe(409);
    expect((await api.help.platform.unpublish(draft.id)).status).toBe("draft");
    const taken = await failure(
      api.help.platform.createArticle({
        slug: "add-a-child",
        audience: "patient",
        category: "other",
        title_i18n: { en: "Copy" },
      }),
    );
    expect(taken.status).toBe(400);
    expect(taken.fields?.slug).toBeDefined();
  });
});

describe("support requests", () => {
  it("patient: own requests, support shown as MediLink support, reply, close, closed rules", async () => {
    await patient();
    const list = await api.help.patient.requests();
    expect(list.results.map((r) => r.reference)).toEqual(["SR-7K3QXM"]);
    const r = await api.help.patient.get(MOCK_HELP.patientRequestId);
    expect(r.messages.find((m) => m.author_kind === "support")?.author_name).toBe(
      "MediLink support",
    );
    const replied = await api.help.patient.reply(r.id, "It still fails after the update.");
    expect(replied.status).toBe("open");
    const closed = await api.help.patient.close(r.id);
    expect(closed.close_reason).toBe("withdrawn");
    expect((await failure(api.help.patient.close(r.id))).status).toBe(409);
    expect((await failure(api.help.patient.reply(r.id, "Hello again"))).status).toBe(422);
    expect((await failure(api.help.patient.get(MOCK_HELP.staffRequestId))).status).toBe(404);
  });

  it("refuses clinical words and the sixth open request", async () => {
    await patient();
    const clinical = await failure(
      api.help.patient.create({
        topic: "other",
        subject: "Question about my HIV test",
        body: "I need help with my results please.",
      }),
    );
    expect(clinical.status).toBe(400);
    expect(clinical.fields?.subject?.[0]).toMatch(/health details/);
    for (let i = 0; i < 4; i++) {
      await api.help.patient.create({
        topic: "technical",
        subject: `App problem ${i}`,
        body: "The app closes when I open it.",
      });
    }
    const sixth = await failure(
      api.help.patient.create({
        topic: "technical",
        subject: "One more",
        body: "The app closes when I open it.",
      }),
    );
    expect(sixth.status).toBe(422);
  });

  it("staff: own requests; facility admin sees the facility's read-only", async () => {
    await staff();
    expect((await api.help.staff.requests()).results.map((r) => r.reference)).toEqual([
      "SR-4HQ2NP",
    ]);
    expect((await failure(api.help.staff.requests({ scope: "facility" }))).status).toBe(403);
    await api.staffAuth.logout();
    await staff(MOCK_FACILITY_ADMIN_EMAIL);
    const facility = await api.help.staff.requests({ scope: "facility" });
    // their own facility's staff requests only (not Kigali Clinic's)
    expect(facility.results.map((r) => r.reference)).toEqual(["SR-9PZ6RD"]);
    const r = await api.help.staff.get(MOCK_HELP.colleagueRequestId);
    expect(r.requester.full_name).toBe("Kamanzi Jean");
    expect((await failure(api.help.staff.reply(r.id, "Looking into it"))).status).toBe(403);
    expect((await failure(api.help.staff.get(MOCK_HELP.staffRequestId))).status).toBe(404);
  });

  it("platform: queue with high first, triage (409 stale), reply, close with a reason", async () => {
    await staff("admin@medilink.test");
    const queue = await api.help.platform.requests({ status: "active" });
    expect(queue.results[0]?.priority).toBe("high");
    const r = await api.help.platform.request(MOCK_HELP.staffRequestId);
    expect(
      (await failure(api.help.platform.triage(r.id, { version: 99, priority: "normal" }))).status,
    ).toBe(409);
    const me = await api.staffAuth.me();
    const assigned = await api.help.platform.triage(r.id, {
      version: r.version,
      assigned_to_id: me.id,
    });
    expect(assigned.assigned_to?.id).toBe(me.id);
    expect((await api.help.platform.requests({ assigned: "me" })).count).toBeGreaterThan(0);
    const answered = await api.help.platform.reply(r.id, "We sent a new printer roll.");
    expect(answered.status).toBe("answered");
    expect(answered.messages.at(-1)?.author_name).toBe(me.full_name);
    const closed = await api.help.platform.close(r.id, "resolved");
    expect(closed.status).toBe("closed");
    expect((await failure(api.help.platform.close(r.id, "resolved"))).status).toBe(409);
  });

  it("platform endpoints refuse non-admins", async () => {
    await staff();
    expect((await failure(api.help.platform.requests())).status).toBe(403);
  });
});

describe("text helpers", () => {
  it("picks the UI language, then rw, en, fr", () => {
    expect(pickText({ en: "Hello", rw: "Muraho" }, "fr")).toEqual({
      text: "Muraho",
      language: "rw",
    });
    expect(pickText({ en: "Hello" }, "en")).toEqual({ text: "Hello", language: "en" });
    expect(pickText({}, "en")).toEqual({ text: "", language: null });
  });

  it("splits plain text into paragraphs and lists", () => {
    expect(articleBlocks("First line\nsame paragraph.\n\n- one\n- two\n\nLast.")).toEqual([
      { kind: "paragraph", text: "First line same paragraph." },
      { kind: "list", items: ["one", "two"] },
      { kind: "paragraph", text: "Last." },
    ]);
  });
});
