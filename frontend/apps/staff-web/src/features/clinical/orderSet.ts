import type {
  NoteTemplate,
  NoteTemplateItem,
  PrescriptionItem,
  SectionField,
  TemplateSections,
} from "@medilink/api-client";

import type { PickedDiagnosis } from "./DiagnosisPicker";

/** The draft fields an order set writes into (the rest of the consultation is untouched). */
export interface DraftFields {
  sections: Record<SectionField, string>;
  diagnoses: PickedDiagnosis[];
}

/** Same limit as the API (clinical/services.py MAX_DIAGNOSES). */
export const MAX_DIAGNOSES = 12;

export const ORDER_SET_SECTIONS: (keyof TemplateSections)[] = [
  "history_text",
  "examination_text",
  "plan_text",
  "patient_instructions_text",
];

/**
 * What applying an order set did, item by item (W3, #202): nothing is skipped silently. The
 * consultation shows this list until the doctor closes it.
 */
export interface OrderSetReport {
  name: string;
  sections: (keyof TemplateSections)[];
  diagnosesAdded: string[];
  diagnosesAlready: string[];
  /** Codes that are not active ICD-10 codes, or over the limit: not added. */
  diagnosesSkipped: string[];
  medicinesAdded: string[];
  medicinesAlready: string[];
  medicinesFailed: string[];
  /** Lab tests on the order set: not ordered yet (W2 lab orders), to order by hand. */
  tests: string[];
}

export const diagnosisLabel = (d: { code: string; display: string; plain_language: string }) =>
  d.plain_language && d.plain_language !== d.display
    ? `${d.plain_language} (${d.display})`
    : d.display || d.code;

export const medicineName = (item: NoteTemplateItem) =>
  item.drug_display || item.free_text_drug || item.drug_code || "";

/** Template text goes into empty sections, or after what is already written (never replaces). */
export function mergeOrderSet(
  local: DraftFields,
  tpl: NoteTemplate,
): { next: DraftFields; report: OrderSetReport } {
  const report: OrderSetReport = {
    name: tpl.name,
    sections: [],
    diagnosesAdded: [],
    diagnosesAlready: [],
    diagnosesSkipped: [],
    medicinesAdded: [],
    medicinesAlready: [],
    medicinesFailed: [],
    tests: tpl.tests.map((test) => test.name || test.code),
  };
  const sections = { ...local.sections };
  for (const key of ORDER_SET_SECTIONS) {
    const add = tpl.sections[key]?.trim();
    if (!add) continue;
    const now = sections[key].trim();
    if (now.includes(add)) continue;
    sections[key] = now ? `${now}\n${add}` : add;
    report.sections.push(key);
  }
  const diagnoses = [...local.diagnoses];
  for (const d of tpl.diagnoses) {
    if (diagnoses.some((x) => x.code === d.code)) {
      report.diagnosesAlready.push(d.code);
      continue;
    }
    if (!d.is_known || diagnoses.length >= MAX_DIAGNOSES) {
      report.diagnosesSkipped.push(d.code);
      continue;
    }
    diagnoses.push({
      code: d.code,
      rank: diagnoses.some((x) => x.rank === "primary") ? "secondary" : "primary",
      certainty: "provisional",
      label: diagnosisLabel(d),
      isSensitive: d.is_sensitive,
    });
    report.diagnosesAdded.push(`${d.code} · ${diagnosisLabel(d)}`);
  }
  return { next: { sections, diagnoses }, report };
}

/** True when the prescription already holds this medicine (not cancelled): never added twice. */
export function onPrescription(item: NoteTemplateItem, current: PrescriptionItem[]): boolean {
  const open = current.filter((line) => line.status !== "cancelled");
  if (item.drug_code) return open.some((line) => line.drug_code === item.drug_code);
  const name = (item.free_text_drug || item.drug_display || "").trim().toLowerCase();
  return open.some((line) => line.is_off_catalogue && line.drug_display.toLowerCase() === name);
}

/** The draft prescription as template medicines, for "Save as template". */
export function templateItems(current: PrescriptionItem[]): NoteTemplateItem[] {
  return current
    .filter((line) => line.status !== "cancelled")
    .slice(0, 10)
    .map((line) => ({
      ...(line.is_off_catalogue
        ? { free_text_drug: line.drug_display.slice(0, 120) }
        : { drug_code: line.drug_code }),
      drug_display: line.drug_display,
      dose: line.dose,
      frequency_code: line.frequency_code,
      route: line.route,
      duration_days: line.duration_days,
      instructions: line.instructions,
    }));
}
