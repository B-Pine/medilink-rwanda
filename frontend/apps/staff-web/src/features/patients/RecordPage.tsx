import type {
  FacilityPatientDetail,
  HealthItem,
  HealthKind,
  Identifier,
  InsuranceProfile,
  RevealReason,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  ConfirmDialog,
  Dialog,
  LoadingState,
  MaskedValue,
  PhoneField,
  SelectField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextareaField,
  TextField,
  toE164,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import {
  actionError,
  CONSENT_VERSION,
  fieldErrors,
  formatDate,
  Gate,
  InsuranceBadge,
  useAge,
  useCan,
  useLocale,
} from "./shared";

const REASONS: RevealReason[] = ["identity_check", "insurance_claim", "patient_request", "other"];

/** /patients/:fpId: the facility record with its tabs (sprint-03 §6.1). Every open is audited. */
export function RecordPage() {
  return (
    <Gate codes={["patients.view"]}>
      <Record />
    </Gate>
  );
}

function useRecord(fpId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["patients", "record", fpId],
    queryFn: () => api.patients.get(fpId),
  });
}

function Record() {
  const { t } = useTranslation();
  const { fpId = "" } = useParams();
  const record = useRecord(fpId);
  const age = useAge();
  const canHealth = useCan("clinical.view", "prescription.view");
  if (record.isPending) return <LoadingState />;
  if (record.isError || !record.data)
    return <PageHeading title={t("patients.notFound")}>{t("patients.notFound")}</PageHeading>;
  const p = record.data;
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <PageHeading title={p.full_name}>{p.full_name}</PageHeading>
        <p className="m-0 text-fg-secondary">
          {age(p.age_years, p.is_birth_date_estimated)} · {p.sex ? t(`patients.sex.${p.sex}`) : "—"}{" "}
          · <span className="font-mono">{p.medilink_number}</span> ·{" "}
          {t("patients.fields.fileNumber")} {p.file_number ?? "—"}
        </p>
        <div className="flex flex-wrap gap-2">
          {!p.is_active && <Badge tone="warning">{t("patients.record.merged")}</Badge>}
          {p.is_staff_member && <Badge tone="info">{t("patients.record.staffMember")}</Badge>}
          {p.has_account && <Badge tone="brand">{t("patients.record.hasAccount")}</Badge>}
          {p.insurance.map((ins) => (
            <InsuranceBadge key={ins.insurer_code} status={ins.status} expired={ins.is_expired} />
          ))}
        </div>
        {!p.is_active && p.merged_into_facility_patient_id && (
          <Alert tone="info" role="status">
            <Link to={`/patients/${p.merged_into_facility_patient_id}`}>
              {t("patients.record.openSurvivor")}
            </Link>
          </Alert>
        )}
      </header>
      <Tabs defaultValue="details">
        <TabsList aria-label={t("patients.record.sections")}>
          <TabsTrigger value="details">{t("patients.record.tabs.details")}</TabsTrigger>
          <TabsTrigger value="identifiers">{t("patients.record.tabs.identifiers")}</TabsTrigger>
          <TabsTrigger value="insurance">{t("patients.record.tabs.insurance")}</TabsTrigger>
          {canHealth && (
            <TabsTrigger value="health">{t("patients.record.tabs.health")}</TabsTrigger>
          )}
          <TabsTrigger value="consents">{t("patients.record.tabs.consents")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <Details record={p} />
        </TabsContent>
        <TabsContent value="identifiers">
          <Identifiers record={p} />
        </TabsContent>
        <TabsContent value="insurance">
          <Insurance record={p} />
        </TabsContent>
        {canHealth && (
          <TabsContent value="health">
            <Health record={p} />
          </TabsContent>
        )}
        <TabsContent value="consents">
          <Consents record={p} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Details({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const canEdit = useCan("patient.register");
  const canMerge = useCan("patients.merge_request");
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [form, setForm] = useState({
    preferred_name: record.preferred_name ?? "",
    phone: "",
    address: record.address ?? "",
    email: record.email ?? "",
    file_number: record.file_number ?? "",
    reception_notes: record.reception_notes ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const phone = toE164(form.phone);
      return api.patients.update(record.facility_patient_id, {
        version: record.version,
        patient_version: record.patient_version,
        preferred_name: form.preferred_name || null,
        address: form.address || null,
        email: form.email || null,
        file_number: form.file_number || null,
        reception_notes: form.reception_notes || null,
        ...(form.phone ? { phone_e164: phone || form.phone } : {}),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["patients", "record", record.facility_patient_id], data);
      setEditing(false);
    },
  });
  const errors = fieldErrors(save.error);
  if (!editing)
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Row label={t("patients.fields.preferredName")} value={record.preferred_name} />
          <Row label={t("patients.fields.phone")}>
            {record.phone_masked ? <PhoneReveal record={record} /> : "—"}
          </Row>
          <Row label={t("patients.fields.email")} value={record.email} />
          <Row label={t("patients.fields.address")} value={record.address} />
          <Row
            label={t("patients.fields.emergencyContact")}
            value={
              record.emergency_contact
                ? `${record.emergency_contact.name} · ${record.emergency_contact.phone_e164}`
                : null
            }
          />
          <Row label={t("patients.fields.notes")} value={record.reception_notes} />
        </dl>
        <div className="flex flex-wrap gap-2">
          {canEdit && record.is_active && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t("patients.record.edit")}
            </Button>
          )}
          {canMerge && record.is_active && (
            <Button variant="ghost" onClick={() => setReporting(true)}>
              {t("patients.record.reportDuplicate")}
            </Button>
          )}
        </div>
        {reporting && <ReportDuplicate record={record} onClose={() => setReporting(false)} />}
      </Card>
    );
  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField
        label={t("patients.fields.preferredName")}
        optional
        value={form.preferred_name}
        onChange={(e) => setForm({ ...form, preferred_name: e.target.value })}
      />
      <PhoneField
        label={t("patients.fields.newPhone")}
        optional
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        error={errors.phone_e164}
      />
      <TextField
        type="email"
        label={t("patients.fields.email")}
        optional
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        error={errors.email}
      />
      <TextField
        label={t("patients.fields.address")}
        optional
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
      />
      <TextField
        label={t("patients.fields.fileNumber")}
        optional
        value={form.file_number}
        onChange={(e) => setForm({ ...form, file_number: e.target.value })}
        error={errors.file_number}
      />
      <TextareaField
        label={t("patients.fields.notes")}
        optional
        value={form.reception_notes}
        onChange={(e) => setForm({ ...form, reception_notes: e.target.value })}
      />
      {save.isError && (
        <Alert tone="danger" role="alert">
          {actionError(save.error, t("errors.generic"))}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t("patients.save")}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
          {t("patients.cancel")}
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className="m-0">{children ?? (value || "—")}</dd>
    </div>
  );
}

/** Reveal dialog with a reason list (design 08 privacy); resolves to the value or null. */
function useRevealDialog() {
  const [pending, setPending] = useState<{
    title: string;
    run: (reason: RevealReason, text: string) => Promise<string>;
    resolve: (value: string | null) => void;
  } | null>(null);
  const ask = (title: string, run: (reason: RevealReason, text: string) => Promise<string>) =>
    new Promise<string | null>((resolve) => setPending({ title, run, resolve }));
  const dialog = pending ? (
    <RevealDialog
      title={pending.title}
      run={pending.run}
      onDone={(value) => {
        pending.resolve(value);
        setPending(null);
      }}
    />
  ) : null;
  return { ask, dialog };
}

function RevealDialog({
  title,
  run,
  onDone,
}: {
  title: string;
  run: (reason: RevealReason, text: string) => Promise<string>;
  onDone: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<RevealReason>("identity_check");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await run(reason, text));
    } catch (failure) {
      setError(actionError(failure, t("errors.generic")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onDone(null)}
      title={title}
      description={t("patients.reveal.description")}
      closeLabel={t("patients.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onDone(null)}>
            {t("patients.cancel")}
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={busy || (reason === "other" && !text.trim())}
          >
            {t("patients.reveal.show")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SelectField
          label={t("patients.reveal.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value as RevealReason)}
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`patients.reveal.reasons.${r}`)}
            </option>
          ))}
        </SelectField>
        {reason === "other" && (
          <TextField
            label={t("patients.reveal.reasonText")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function useMaskLabels() {
  const { t } = useTranslation();
  return {
    reveal: t("patients.reveal.show"),
    hide: t("patients.reveal.hide"),
    revealing: t("patients.reveal.showing"),
    failed: t("errors.generic"),
  };
}

function PhoneReveal({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const labels = useMaskLabels();
  const { ask, dialog } = useRevealDialog();
  return (
    <>
      <MaskedValue
        masked={record.phone_masked ?? ""}
        name={t("patients.fields.phone")}
        labels={labels}
        onReveal={() =>
          ask(
            t("patients.reveal.titlePhone"),
            async (reason_code, reason_text) =>
              (
                await api.patients.reveal(record.facility_patient_id, {
                  field: "phone",
                  reason_code,
                  reason_text,
                })
              ).value,
          )
        }
      />
      {dialog}
    </>
  );
}

function Identifiers({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const labels = useMaskLabels();
  const canReveal = useCan("patients.identifier_reveal");
  const canAdd = useCan("patient.register");
  const { ask, dialog } = useRevealDialog();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "national_id", value: "", country: "", seen: false });
  const add = useMutation({
    mutationFn: () =>
      api.patients.addIdentifier(record.facility_patient_id, {
        kind: form.kind as Identifier["kind"],
        value: form.value,
        issuing_country: form.country || undefined,
        seen_document: form.seen,
      }),
    onSuccess: () => {
      setAdding(false);
      void queryClient.invalidateQueries({
        queryKey: ["patients", "record", record.facility_patient_id],
      });
    },
  });
  return (
    <Card padding="md" className="flex flex-col gap-3">
      {record.identifiers.length === 0 && <p className="m-0">{t("patients.identifiers.none")}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {record.identifiers.map((identifier) => (
          <li key={identifier.id} className="flex flex-wrap items-center gap-3">
            <span className="min-w-40">{t(`patients.identifierKinds.${identifier.kind}`)}</span>
            <MaskedValue
              masked={identifier.masked_value}
              name={t(`patients.identifierKinds.${identifier.kind}`)}
              labels={labels}
              onReveal={
                canReveal
                  ? () =>
                      ask(
                        t("patients.reveal.titleIdentifier"),
                        async (reason_code, reason_text) =>
                          (
                            await api.patients.reveal(record.facility_patient_id, {
                              field: "identifier",
                              identifier_id: identifier.id,
                              reason_code,
                              reason_text,
                            })
                          ).value,
                      )
                  : undefined
              }
            />
            {identifier.is_verified && (
              <Badge tone="success">{t("patients.identifiers.checked")}</Badge>
            )}
          </li>
        ))}
      </ul>
      {dialog}
      {canAdd && record.is_active && !adding && (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t("patients.identifiers.add")}
          </Button>
        </div>
      )}
      {adding && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <SelectField
            label={t("patients.fields.document")}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            {(["national_id", "passport", "refugee_id", "birth_certificate"] as const).map((k) => (
              <option key={k} value={k}>
                {t(`patients.identifierKinds.${k}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t("patients.fields.documentNumber")}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            error={fieldErrors(add.error).value}
            autoComplete="off"
          />
          {form.kind !== "national_id" && (
            <TextField
              label={t("patients.fields.country")}
              value={form.country}
              maxLength={2}
              onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
            />
          )}
          <CheckboxField
            label={t("patients.identifiers.seen")}
            checked={form.seen}
            onChange={(e) => setForm({ ...form, seen: e.target.checked })}
          />
          {add.isError && !fieldErrors(add.error).value && (
            <Alert tone="danger" role="alert">
              {actionError(add.error, t("errors.generic"))}
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={add.isPending}>
              {t("patients.save")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              {t("patients.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Insurance({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const canVerify = useCan("patients.insurance_verify");
  const canAdd = useCan("patient.register");
  const key = ["patients", "insurance", record.facility_patient_id];
  const profiles = useQuery({
    queryKey: key,
    queryFn: () => api.patients.insurance(record.facility_patient_id),
  });
  const [rejecting, setRejecting] = useState<InsuranceProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ insurer_code: "mutuelle", member_number: "" });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({
      queryKey: ["patients", "record", record.facility_patient_id],
    });
  };
  const verify = useMutation({
    mutationFn: ({
      profile,
      outcome,
      reason,
    }: {
      profile: InsuranceProfile;
      outcome: "verified" | "rejected";
      reason?: string;
    }) => api.patients.verifyInsurance(record.facility_patient_id, profile.id, { outcome, reason }),
    onSuccess: () => {
      setRejecting(null);
      refresh();
    },
  });
  const add = useMutation({
    mutationFn: () => api.patients.addInsurance(record.facility_patient_id, form),
    onSuccess: () => {
      setAdding(false);
      refresh();
    },
  });
  if (profiles.isPending) return <LoadingState />;
  return (
    <div className="flex flex-col gap-3">
      {(profiles.data?.results ?? []).length === 0 && (
        <p className="m-0">{t("patients.insurance.none")}</p>
      )}
      {(profiles.data?.results ?? []).map((profile) => (
        <Card key={profile.id} padding="md" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{profile.insurer_display}</strong>
            <span className="font-mono">{profile.member_number}</span>
            <InsuranceBadge status={profile.status} expired={profile.is_expired} />
            {!profile.is_active && <Badge tone="neutral">{t("patients.insurance.inactive")}</Badge>}
          </div>
          {profile.last_verified && (
            <p className="m-0 text-small text-fg-muted">
              {t("patients.insurance.lastVerified", {
                facility: profile.last_verified.facility_name ?? "—",
                date: formatDate(profile.last_verified.at, locale),
              })}
            </p>
          )}
          {profile.status_reason && <p className="m-0 text-small">{profile.status_reason}</p>}
          {canVerify && profile.is_active && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => verify.mutate({ profile, outcome: "verified" })}
                disabled={verify.isPending}
              >
                {t("patients.insurance.verify")}
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(profile)}>
                {t("patients.insurance.reject")}
              </Button>
            </div>
          )}
        </Card>
      ))}
      {canAdd && record.is_active && !adding && (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t("patients.insurance.add")}
          </Button>
        </div>
      )}
      {adding && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <SelectField
            label={t("patients.fields.insurer")}
            value={form.insurer_code}
            onChange={(e) => setForm({ ...form, insurer_code: e.target.value })}
          >
            {["mutuelle", "rssb", "mmi", "radiant"].map((code) => (
              <option key={code} value={code}>
                {t(`patients.insurers.${code}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t("patients.fields.memberNumber")}
            value={form.member_number}
            onChange={(e) => setForm({ ...form, member_number: e.target.value })}
            error={fieldErrors(add.error).member_number}
          />
          <Button type="submit" disabled={add.isPending}>
            {t("patients.save")}
          </Button>
        </form>
      )}
      {rejecting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRejecting(null)}
          title={t("patients.insurance.rejectTitle")}
          consequences={t("patients.insurance.rejectConsequences")}
          confirmLabel={t("patients.insurance.reject")}
          cancelLabel={t("patients.cancel")}
          closeLabel={t("patients.close")}
          tone="danger"
          reasonLabel={t("patients.insurance.reason")}
          reasonRequired
          reasonRequiredMessage={t("patients.required")}
          busy={verify.isPending}
          error={verify.isError ? actionError(verify.error, t("errors.generic")) : undefined}
          onConfirm={(reason) => verify.mutate({ profile: rejecting, outcome: "rejected", reason })}
        />
      )}
    </div>
  );
}

const KINDS: HealthKind[] = ["allergies", "conditions", "medications"];

function itemLabel(item: HealthItem) {
  return item.substance_text ?? item.display ?? item.drug_display ?? "";
}

function Health({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const canWrite = useCan("clinical.write");
  const key = ["patients", "health", record.facility_patient_id];
  const profile = useQuery({
    queryKey: key,
    queryFn: () => api.patients.healthProfile(record.facility_patient_id),
  });
  const [text, setText] = useState<Record<HealthKind, string>>({
    allergies: "",
    conditions: "",
    medications: "",
  });
  const add = useMutation({
    mutationFn: (kind: HealthKind) =>
      api.patients.addHealthItem(
        record.facility_patient_id,
        kind,
        kind === "allergies"
          ? { category: "drug", substance_text: text[kind] }
          : kind === "conditions"
            ? { display: text[kind] }
            : { drug_display: text[kind] },
      ),
    onSuccess: (_item, kind) => {
      setText((v) => ({ ...v, [kind]: "" }));
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const review = useMutation({
    mutationFn: ({
      kind,
      item,
      outcome,
    }: {
      kind: HealthKind;
      item: HealthItem;
      outcome: "verified";
    }) => api.patients.reviewHealthItem(record.facility_patient_id, kind, item.id, { outcome }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  if (profile.isPending) return <LoadingState />;
  return (
    <div className="flex flex-col gap-4">
      {profile.data?.no_known_allergies && (
        <Badge tone="success">{t("patients.health.noKnownAllergies")}</Badge>
      )}
      {KINDS.map((kind) => {
        const items = profile.data?.[kind];
        if (items === null || items === undefined) return null;
        return (
          <Card key={kind} padding="md" className="flex flex-col gap-2">
            <h2 className="m-0 text-h3">{t(`patients.health.${kind}`)}</h2>
            {items.length === 0 && (
              <p className="m-0 text-small text-fg-muted">{t("patients.health.none")}</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <span>{itemLabel(item)}</span>
                  <Badge tone={item.verification_status === "verified" ? "success" : "warning"}>
                    {t(`patients.health.status.${item.verification_status}`)}
                  </Badge>
                  {canWrite && item.verification_status === "unverified" && (
                    <Button
                      variant="ghost"
                      onClick={() => review.mutate({ kind, item, outcome: "verified" })}
                    >
                      {t("patients.health.confirm")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {canWrite && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text[kind].trim()) add.mutate(kind);
                }}
              >
                <TextField
                  label={t(`patients.health.add.${kind}`)}
                  value={text[kind]}
                  onChange={(e) => setText({ ...text, [kind]: e.target.value })}
                />
                <Button type="submit" variant="secondary" disabled={add.isPending}>
                  {t("patients.health.addButton")}
                </Button>
              </form>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Consents({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canRegister = useCan("patient.register");
  const [script, setScript] = useState(false);
  const [reference, setReference] = useState(record.open_claim_reference ?? "");
  const [matches, setMatches] = useState(false);
  const consent = useMutation({
    mutationFn: () =>
      api.patients.recordConsent(record.facility_patient_id, {
        kind: "care",
        version: CONSENT_VERSION,
        granted: true,
        script_read: true,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["patients", "record", record.facility_patient_id],
      }),
  });
  const confirm = useMutation({
    mutationFn: () =>
      api.patients.confirmClaim(record.facility_patient_id, {
        claim_reference: reference,
        document_kind: "national_id",
        document_matches: true,
      }),
    onSuccess: () => void navigate(0),
  });
  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex flex-col gap-2">
        <p className="m-0">
          {record.has_care_consent ? t("patients.consents.hasCare") : t("patients.consents.noCare")}
        </p>
        {canRegister && !record.has_care_consent && (
          <>
            <p className="m-0 text-small">{t("patients.register.consentScript")}</p>
            <CheckboxField
              label={t("patients.consents.scriptRead")}
              checked={script}
              onChange={(e) => setScript(e.target.checked)}
            />
            <div>
              <Button onClick={() => consent.mutate()} disabled={!script || consent.isPending}>
                {t("patients.consents.record")}
              </Button>
            </div>
          </>
        )}
      </Card>
      {canRegister && record.open_claim_reference && (
        <Card padding="md" className="flex flex-col gap-2">
          <h2 className="m-0 text-h3">{t("patients.claims.title")}</h2>
          <p className="m-0 text-small">{t("patients.claims.hint")}</p>
          <TextField
            label={t("patients.claims.reference")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <CheckboxField
            label={t("patients.claims.documentMatches")}
            checked={matches}
            onChange={(e) => setMatches(e.target.checked)}
          />
          {confirm.isError && (
            <Alert tone="danger" role="alert">
              {actionError(confirm.error, t("errors.generic"))}
            </Alert>
          )}
          {confirm.isSuccess && (
            <Alert tone="success" role="status">
              {t("patients.claims.done")}
            </Alert>
          )}
          <div>
            <Button
              onClick={() => confirm.mutate()}
              disabled={!matches || !reference || confirm.isPending}
            >
              {t("patients.claims.confirm")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ReportDuplicate({
  record,
  onClose,
}: {
  record: FacilityPatientDetail;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [other, setOther] = useState<string>("");
  const [reason, setReason] = useState("");
  const search = useMutation({ mutationFn: () => api.patients.search({ query }) });
  const request = useMutation({
    mutationFn: () =>
      api.patients.requestMerge({
        surviving_facility_patient_id: record.facility_patient_id,
        merged_facility_patient_id: other,
        reason,
      }),
    onSuccess: () => void navigate("/patients/merge-requests"),
  });
  const candidates = (search.data?.results ?? []).filter(
    (r) => r.facility_patient_id !== record.facility_patient_id,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("patients.record.reportDuplicate")}
      description={t("patients.merges.requestHint", { name: record.full_name })}
      closeLabel={t("patients.close")}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("patients.cancel")}
          </Button>
          <Button
            onClick={() => request.mutate()}
            disabled={!other || !reason.trim() || request.isPending}
          >
            {t("patients.merges.request")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
        >
          <TextField
            label={t("patients.merges.findOther")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t("patients.search.button")}
          </Button>
        </form>
        {candidates.length > 0 && (
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="text-small font-medium">
              {t("patients.merges.duplicateRecord")}
            </legend>
            {candidates.map((c) => (
              <label key={c.facility_patient_id} className="flex min-h-target items-center gap-2">
                <input
                  type="radio"
                  name="duplicate"
                  value={c.facility_patient_id}
                  checked={other === c.facility_patient_id}
                  onChange={() => setOther(c.facility_patient_id)}
                />
                {c.full_name} · {c.file_number ?? "—"} · {c.medilink_number}
              </label>
            ))}
          </fieldset>
        )}
        <TextareaField
          label={t("patients.merges.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {request.isError && (
          <Alert tone="danger" role="alert">
            {actionError(request.error, t("errors.generic"))}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
