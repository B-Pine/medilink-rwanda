import { http, HttpResponse } from "msw";

import type { CareScheduleEntry, CareScheduleKind, ComingUpItem } from "../../features/booking";
import { CARE_SCHEDULE_KINDS } from "../../features/booking";
import { extendMockRoleGrants, FACILITIES } from "../data";
import type { FeatureMockFactory } from "../features";
import { SELF_PATIENT_ID } from "./patients-store";
import { id, str } from "./s1-common";

/**
 * W7 mocks (upgrade 13): the care schedule. Doctors hold `care_schedule.manage`. The patient
 * (patient@medilink.test) has a vaccination planned in 10 days ("Second dose") and a follow-up date
 * in 21 days with no booking; entries a doctor adds for any record show in that list too.
 */
extendMockRoleGrants({ doctor: ["care_schedule.manage"] });

const MOCK_PATIENT_SELF = SELF_PATIENT_ID;
const HORIZON_DAYS = 2 * 366;

/** A Kigali calendar day offset from today (Kigali is UTC+2, no daylight saving). */
const kigaliIso = (offset: number) =>
  new Date(Date.now() + 2 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

interface Stored extends CareScheduleEntry {
  facility_patient_id: string;
}

function seed() {
  const entries: Stored[] = [
    {
      id: "c7000000-0000-4000-8000-000000000001",
      facility_patient_id: "",
      kind: "vaccination",
      due_on: kigaliIso(10),
      note: "Second dose",
      status: "due",
      created_at: new Date().toISOString(),
      version: 1,
    },
  ];
  const followUps: ComingUpItem[] = [
    {
      id: "c7000000-0000-4000-8000-000000000002",
      type: "follow_up",
      due_on: kigaliIso(21),
      note: "",
      facility_name: FACILITIES.kigaliClinic.name,
      patient_id: MOCK_PATIENT_SELF,
    },
  ];
  return { entries, followUps };
}

const visible = ({ facility_patient_id: _fp, ...entry }: Stored): CareScheduleEntry => entry;

export const careScheduleMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();

  const staff = (request: Request) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    if (!(result.me.permissions as readonly string[]).includes("care_schedule.manage"))
      return { error: context.errorResponse(403, "permission_denied", "Not allowed.") };
    return { me: result.me };
  };
  const rule = (field: string, message: string) =>
    context.errorResponse(422, "business_rule_violation", message, {
      fields: { [field]: [message] },
    });

  return {
    reset: () => {
      db = seed();
    },
    handlers: [
      http.get(`${api}/patient/care-schedule/`, async ({ request }) => {
        await context.settle();
        const result = context.authenticatedPatient(context.languageFrom(request));
        if ("error" in result) return result.error;
        const today = kigaliIso(0);
        const planned: ComingUpItem[] = db.entries
          .filter((e) => e.status === "due" && e.due_on >= today)
          .map((e) => ({
            id: e.id,
            type: e.kind,
            due_on: e.due_on,
            note: e.note,
            facility_name: FACILITIES.kigaliClinic.name,
            patient_id: MOCK_PATIENT_SELF,
          }));
        const results = [...planned, ...db.followUps].sort((a, b) =>
          a.due_on.localeCompare(b.due_on),
        );
        return HttpResponse.json({ results });
      }),
      http.get(`${api}/staff/care-schedule/patients/:fpId/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request);
        if ("error" in ok) return ok.error;
        const results = db.entries
          .filter((e) => e.facility_patient_id === str(params.fpId) && e.status === "due")
          .sort((a, b) => a.due_on.localeCompare(b.due_on))
          .map(visible);
        return HttpResponse.json({ results });
      }),
      http.post(`${api}/staff/care-schedule/patients/:fpId/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request);
        if ("error" in ok) return ok.error;
        const body = await context.readJson(request);
        const kind = str(body.kind) as CareScheduleKind;
        if (!CARE_SCHEDULE_KINDS.includes(kind))
          return context.errorResponse(400, "validation_error", "Some fields need attention.", {
            fields: { kind: ["Choose vaccination or antenatal visit."] },
          });
        const due = str(body.due_on);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < kigaliIso(0))
          return rule("due_on", "Choose today or a later day.");
        if (due > kigaliIso(HORIZON_DAYS))
          return rule("due_on", "Choose a day within the next two years.");
        const entry: Stored = {
          id: id(),
          facility_patient_id: str(params.fpId),
          kind,
          due_on: due,
          note: str(body.note).trim().slice(0, 80),
          status: "due",
          created_at: new Date().toISOString(),
          version: 1,
        };
        db.entries.push(entry);
        return HttpResponse.json(visible(entry), { status: 201 });
      }),
      http.post(`${api}/staff/care-schedule/:id/cancel/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request);
        if ("error" in ok) return ok.error;
        const entry = db.entries.find((e) => e.id === str(params.id));
        if (!entry) return context.errorResponse(404, "not_found", "Not found.");
        const body = await context.readJson(request);
        if (Number(body.version) !== entry.version)
          return context.errorResponse(409, "conflict", "Someone else changed this entry.");
        if (entry.status !== "due")
          return context.errorResponse(
            422,
            "business_rule_violation",
            "This entry is already cancelled.",
          );
        entry.status = "cancelled";
        entry.version += 1;
        return HttpResponse.json(visible(entry));
      }),
    ],
  };
};
