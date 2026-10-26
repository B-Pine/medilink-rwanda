import {
  isApiError,
  newIdempotencyKey,
  type DuplicateCheckResult,
  type FacilityPatientDetail,
  type IdentifierKind,
  type RegisterInput,
  type Sex,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  cx,
  PhoneField,
  SelectField,
  TextField,
  toE164,
} from "@medilink/ui";
import { useMutation } from "@tanstack/react-query";
import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { actionError, CONSENT_VERSION, fieldErrors, useAge } from "./shared";

const SEXES: Sex[] = ["female", "male", "other"];
const INSURERS = ["mutuelle", "rssb", "mmi", "radiant"];

interface FormState {
  full_name: string;
  sex: Sex | "";
  ageMode: "dob" | "years" | "months";
  date_of_birth: string;
  age: string;
  phone: string;
  insurer_code: string;
  member_number: string;
  idKind: IdentifierKind | "";
  idValue: string;
  idCountry: string;
  file_number: string;
  consent: boolean;
}

const EMPTY: FormState = {
  full_name: "",
  sex: "",
  ageMode: "dob",
  date_of_birth: "",
  age: "",
  phone: "",
  insurer_code: "",
  member_number: "",
  idKind: "",
  idValue: "",
  idCountry: "",
  file_number: "",
  consent: false,
};

export interface WalkInFormProps {
  /** Called with the new record (S4's Today side panel reuses this form). */
  onRegistered: (record: FacilityPatientDetail) => void;
}

/**
 * Walk-in registration (sprint-03 §6.1, FR-PAT-04): required fields first, "More" for documents,
 * a spoken-consent checkbox, and duplicate suggestions beside the form, debounced 400 ms.
 */
export function WalkInForm({ onRegistered }: WalkInFormProps) {
  const { t } = useTranslation();
  const api = useApi();
  const age = useAge();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [more, setMore] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checked, setDuplicates] = useState<DuplicateCheckResult | null>(null);
  const key = useRef(newIdempotencyKey());
  const set = <K extends keyof FormState>(name: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [name]: value }));

  const ageInput = () => {
    if (form.ageMode === "dob") return { date_of_birth: form.date_of_birth || null };
    const n = Number(form.age);
    if (!form.age || Number.isNaN(n)) return {};
    return form.ageMode === "years" ? { estimated_age_years: n } : { estimated_age_months: n };
  };
  const phone = toE164(form.phone);
  const identifier =
    form.idKind && form.idValue
      ? { kind: form.idKind, value: form.idValue, issuing_country: form.idCountry || undefined }
      : null;

  // duplicate suggestions once names + age, or a phone, are filled
  const ready =
    (form.full_name.trim().length >= 3 && (form.date_of_birth || form.age)) || Boolean(phone);
  const checkKey = JSON.stringify([form.full_name, form.sex, ageInput(), phone, identifier]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      api.patients
        .duplicateCheck({
          full_name: form.full_name,
          sex: form.sex || null,
          phone_e164: phone || null,
          identifier,
          ...ageInput(),
        })
        .then(setDuplicates)
        .catch(() => setDuplicates(null));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey, ready]);

  // suggestions only while the form has enough to compare
  const duplicates = ready ? checked : null;

  const register = useMutation({
    mutationFn: (body: RegisterInput) => api.patients.register(body, key.current),
    onSuccess: onRegistered,
  });
  const errors = fieldErrors(register.error);
  const needsConfirmation =
    isApiError(register.error) && register.error.status === 409 && "non_field_errors" in errors;
  const existsElsewhere =
    isApiError(register.error) && register.error.status === 409 && "identifier" in errors;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate({
      full_name: form.full_name.trim(),
      sex: form.sex as Sex,
      phone_e164: phone || null,
      identifier,
      file_number: form.file_number || null,
      insurance:
        form.insurer_code && form.member_number
          ? { insurer_code: form.insurer_code, member_number: form.member_number }
          : null,
      care_consent: { version: CONSENT_VERSION, granted: form.consent },
      confirm_not_duplicate: confirmed,
      ...ageInput(),
    });
  };

  const strongMatches = duplicates?.matches.filter((m) => m.level !== "possible") ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5 sm:p-6"
        aria-label={t("patients.register.title")}
      >
        <FormSection title={t("patients.register.sections.person")}>
          <TextField
            label={t("patients.fields.name")}
            hint={t("patients.register.nameHint")}
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            error={errors.full_name}
            autoComplete="off"
            required
            className="max-w-xl"
          />
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-body-sm font-medium">{t("patients.fields.sex")}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {SEXES.map((sex) => (
                <label
                  key={sex}
                  className="inline-flex min-h-target cursor-pointer items-center gap-2 rounded-md border border-border px-3"
                >
                  <input
                    type="radio"
                    name="sex"
                    value={sex}
                    checked={form.sex === sex}
                    onChange={() => set("sex", sex)}
                  />
                  {t(`patients.sex.${sex}`)}
                </label>
              ))}
            </div>
            {errors.sex && <p className="m-0 text-body-sm text-danger">{errors.sex}</p>}
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label={t("patients.register.ageMode")}
              value={form.ageMode}
              onChange={(e) => set("ageMode", e.target.value as FormState["ageMode"])}
              className="w-48"
            >
              <option value="dob">{t("patients.register.ageModes.dob")}</option>
              <option value="years">{t("patients.register.ageModes.years")}</option>
              <option value="months">{t("patients.register.ageModes.months")}</option>
            </SelectField>
            {form.ageMode === "dob" ? (
              <TextField
                type="date"
                label={t("patients.fields.dateOfBirth")}
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
                error={errors.date_of_birth}
                className="w-56"
              />
            ) : (
              <TextField
                type="number"
                inputMode="numeric"
                min={0}
                max={form.ageMode === "years" ? 120 : 23}
                label={t(`patients.register.ageModes.${form.ageMode}`)}
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                error={
                  errors.estimated_age_years ?? errors.estimated_age_months ?? errors.date_of_birth
                }
                className="w-40"
              />
            )}
          </div>
        </FormSection>
        <FormSection title={t("patients.register.sections.contact")}>
          <PhoneField
            label={t("patients.fields.phone")}
            optional
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={phone === "" ? t("patients.register.phoneInvalid") : errors.phone_e164}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-3">
            <SelectField
              label={t("patients.fields.insurer")}
              optional
              value={form.insurer_code}
              onChange={(e) => set("insurer_code", e.target.value)}
              className="w-56"
            >
              <option value="">{t("patients.register.noInsurance")}</option>
              {INSURERS.map((code) => (
                <option key={code} value={code}>
                  {t(`patients.insurers.${code}`)}
                </option>
              ))}
            </SelectField>
            {form.insurer_code && (
              <TextField
                label={t("patients.fields.memberNumber")}
                value={form.member_number}
                onChange={(e) => set("member_number", e.target.value)}
                error={errors["insurance.member_number"]}
                className="w-64"
              />
            )}
          </div>
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            className="inline-flex min-h-target cursor-pointer items-center gap-1.5 self-start font-semibold text-link"
          >
            <CaretRight
              aria-hidden="true"
              weight="bold"
              className={cx("size-4 transition-transform", more && "rotate-90")}
            />
            {more ? t("patients.register.less") : t("patients.register.more")}
          </button>
          {more && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap gap-3">
                <SelectField
                  label={t("patients.fields.document")}
                  optional
                  value={form.idKind}
                  onChange={(e) => set("idKind", e.target.value as FormState["idKind"])}
                  className="w-56"
                >
                  <option value="">—</option>
                  <option value="national_id">{t("patients.identifierKinds.national_id")}</option>
                  <option value="passport">{t("patients.identifierKinds.passport")}</option>
                  <option value="refugee_id">{t("patients.identifierKinds.refugee_id")}</option>
                </SelectField>
                {form.idKind && (
                  <TextField
                    label={t("patients.fields.documentNumber")}
                    value={form.idValue}
                    onChange={(e) => set("idValue", e.target.value)}
                    error={errors["identifier.value"] ?? errors.identifier}
                    autoComplete="off"
                    className="w-64"
                  />
                )}
                {form.idKind && form.idKind !== "national_id" && (
                  <TextField
                    label={t("patients.fields.country")}
                    hint={t("patients.register.countryHint")}
                    value={form.idCountry}
                    maxLength={2}
                    onChange={(e) => set("idCountry", e.target.value.toUpperCase())}
                    className="w-32"
                  />
                )}
              </div>
              <TextField
                label={t("patients.fields.fileNumber")}
                optional
                value={form.file_number}
                onChange={(e) => set("file_number", e.target.value)}
                error={errors.file_number}
                className="max-w-xs"
              />
            </div>
          )}
        </FormSection>
        <Card padding="md" className="flex flex-col gap-2 bg-subtle">
          <p className="m-0">{t("patients.register.consentScript")}</p>
          <CheckboxField
            label={t("patients.register.consent")}
            checked={form.consent}
            onChange={(e) => set("consent", e.target.checked)}
            error={errors.care_consent}
          />
        </Card>
        {needsConfirmation && (
          <Alert tone="warning" role="alert" title={t("patients.register.possibleDuplicate")}>
            <CheckboxField
              label={t("patients.register.confirmNotDuplicate")}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
          </Alert>
        )}
        {existsElsewhere && (
          <Alert tone="info" role="alert">
            {errors.identifier} <Link to="/patients">{t("patients.register.findThem")}</Link>
          </Alert>
        )}
        {register.isError && !needsConfirmation && !existsElsewhere && (
          <Alert tone="danger" role="alert">
            {actionError(register.error, t("errors.generic"))}
          </Alert>
        )}
        <div className="border-t border-border pt-5">
          <Button type="submit" size="lg" disabled={register.isPending}>
            {t("patients.register.submit")}
          </Button>
        </div>
      </form>
      <aside
        aria-label={t("patients.register.suggestions")}
        aria-live="polite"
        className="flex flex-col gap-3 self-start rounded-lg border border-border bg-raised p-4 lg:sticky lg:top-24"
      >
        <h2 className="m-0 font-heading text-h3">{t("patients.register.suggestions")}</h2>
        {!duplicates && (
          <p className="m-0 text-body-sm text-fg-muted">{t("patients.register.suggestionsHint")}</p>
        )}
        {duplicates && duplicates.matches.length === 0 && !duplicates.external_match && (
          <p className="m-0 text-body-sm">{t("patients.register.noMatches")}</p>
        )}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {duplicates?.matches.map((m) => (
            <li key={m.patient.facility_patient_id}>
              <Card padding="md">
                <Badge tone={m.level === "possible" ? "warning" : "danger"}>
                  {t(`patients.register.levels.${m.level}`)}
                </Badge>
                <div className="mt-1">
                  <Link to={`/patients/${m.patient.facility_patient_id}`}>
                    {m.patient.full_name}
                  </Link>
                </div>
                <div className="text-body-sm text-fg-muted">
                  {age(m.patient.age_years, m.patient.is_birth_date_estimated)} ·{" "}
                  {m.patient.phone_masked ?? "—"} · {m.patient.file_number ?? "—"}
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {duplicates?.external_match && (
          <Card padding="md" className="mt-2">
            <p className="m-0 font-medium">{t("patients.external.title")}</p>
            <p className="m-0 text-body-sm">
              {duplicates.external_match.full_name} · {duplicates.external_match.birth_year}
            </p>
          </Card>
        )}
        {(duplicates?.other_facility_possible_count ?? 0) > 0 && (
          <p className="text-body-sm text-fg-muted">
            {t("patients.register.elsewhere", { count: duplicates?.other_facility_possible_count })}
          </p>
        )}
        {strongMatches.length > 0 && (
          <p className="text-body-sm text-fg-muted">{t("patients.register.strongHint")}</p>
        )}
      </aside>
    </div>
  );
}

/** A titled group of fields inside the walk-in form. */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-border pb-6 last-of-type:border-0">
      <h2 className="m-0 font-heading text-h3 text-fg">{title}</h2>
      {children}
    </section>
  );
}
