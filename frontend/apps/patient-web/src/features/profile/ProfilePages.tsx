import {
  isApiError,
  type HealthItem,
  type HealthKind,
  type IdentifierKind,
  type PatientProfileDetail,
  type ProfileCompletion,
  type Sex,
} from "@medilink/api-client";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  Card,
  LoadingState,
  MaskedValue,
  PhoneField,
  SelectField,
  TextField,
  toE164,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { can, ProfileLayout, rememberedProfile, useProfiles } from "./ProfileLayout";
import { errorText, fieldErrors, formatDateTime, useLocale } from "./shared";

const COMPLETION_STEPS: { key: keyof ProfileCompletion; to: string }[] = [
  { key: "details", to: "details" },
  { key: "identifier", to: "identifiers" },
  { key: "emergency_contact", to: "details" },
  { key: "care_consent", to: "/privacy/settings" },
  { key: "insurance", to: "insurance" },
  { key: "allergies_reviewed", to: "health" },
];

function useProfile(patientId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["profile", "detail", patientId],
    queryFn: () => api.profile.get(patientId),
  });
}

/** /profile: the self profile, or the last profile chosen in this tab. */
export function ProfileRedirect() {
  const profiles = useProfiles();
  if (profiles.isPending) return <LoadingState />;
  const list = profiles.data?.results ?? [];
  const remembered = rememberedProfile();
  const target = list.find((p) => p.patient_id === remembered) ?? list[0];
  return target ? (
    <Navigate to={`/profile/${target.patient_id}`} replace />
  ) : (
    <Navigate to="/home" replace />
  );
}

/** /profile/:patientId: completion checklist with the next action, MediLink number, sections. */
export function ProfileHubPage() {
  const { t } = useTranslation();
  const { patientId = "" } = useParams();
  const profile = useProfile(patientId);
  const p = profile.data;
  return (
    <ProfileLayout title={p ? (p.preferred_name ?? p.full_name) : t("profile.title")}>
      {profile.isPending && <LoadingState />}
      {profile.isError && <Alert tone="danger">{t("profile.notFound")}</Alert>}
      {p && <Hub profile={p} />}
    </ProfileLayout>
  );
}

function Hub({ profile }: { profile: PatientProfileDetail }) {
  const { t } = useTranslation();
  const next = COMPLETION_STEPS.find((step) => !profile.completion[step.key]);
  const href = (to: string) => (to.startsWith("/") ? to : `/profile/${profile.patient_id}/${to}`);
  const sections = [
    { to: "details", label: t("profile.sections.details") },
    { to: "identifiers", label: t("profile.sections.identifiers") },
    { to: "insurance", label: t("profile.sections.insurance") },
    { to: "health", label: t("profile.sections.health") },
    ...(can.history(profile.relationship)
      ? [{ to: "access-history", label: t("profile.sections.history") }]
      : []),
  ];
  return (
    <>
      <Card padding="md">
        <p className="m-0 text-fg-muted">{t("profile.medilinkNumber")}</p>
        <p className="m-0 font-mono text-h2">{profile.medilink_number ?? "—"}</p>
      </Card>
      <Card as="section" aria-labelledby="completion" padding="md" className="flex flex-col gap-3">
        <h2 id="completion" className="m-0 text-h3">
          {t("profile.completion.title")}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {COMPLETION_STEPS.map((step) => {
            const done = profile.completion[step.key];
            return (
              <li key={step.key} className="flex items-center gap-2">
                {done ? (
                  <CheckCircle aria-hidden="true" className="size-6 text-success" weight="fill" />
                ) : (
                  <Circle aria-hidden="true" className="size-6 text-fg-muted" />
                )}
                <span>{t(`profile.completion.${step.key}`)}</span>
                <span className="sr-only">
                  {done ? t("profile.completion.done") : t("profile.completion.todo")}
                </span>
              </li>
            );
          })}
        </ul>
        {next && (
          <Link to={href(next.to)} className={buttonClassName({ size: "lg", fullWidth: true })}>
            {t("profile.completion.next", { step: t(`profile.completion.${next.key}`) })}
          </Link>
        )}
      </Card>
      <nav aria-label={t("profile.sectionsLabel")} className="flex flex-col gap-2">
        {sections.map((s) => (
          <Link
            key={s.to}
            to={href(s.to)}
            className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true })}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function useBack() {
  const { t } = useTranslation();
  const { patientId = "" } = useParams();
  return { to: `/profile/${patientId}`, label: t("profile.backToProfile") };
}

/** /profile/:patientId/details */
export function DetailsPage() {
  const { t } = useTranslation();
  const { patientId = "" } = useParams();
  const profile = useProfile(patientId);
  return (
    <ProfileLayout title={t("profile.sections.details")} back={useBack()}>
      {profile.data ? <DetailsForm profile={profile.data} /> : <LoadingState />}
    </ProfileLayout>
  );
}

function DetailsForm({ profile }: { profile: PatientProfileDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const core = can.editCore(profile.relationship);
  const [form, setForm] = useState({
    full_name: profile.full_name,
    date_of_birth: profile.date_of_birth ?? "",
    sex: profile.sex ?? "",
    phone: profile.phone_e164 ?? "",
    email: profile.email ?? "",
    address: profile.address ?? "",
    ec_name: profile.emergency_contact?.name ?? "",
    ec_phone: profile.emergency_contact?.phone_e164 ?? "",
    ec_relationship: profile.emergency_contact?.relationship ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      api.profile.update(profile.patient_id, {
        version: profile.version,
        ...(core
          ? {
              full_name: form.full_name,
              date_of_birth: form.date_of_birth || null,
              sex: (form.sex || null) as Sex | null,
            }
          : {}),
        phone_e164: form.phone ? toE164(form.phone) || form.phone : null,
        email: form.email || null,
        address: form.address || null,
        emergency_contact: form.ec_name
          ? {
              name: form.ec_name,
              phone_e164: toE164(form.ec_phone) || form.ec_phone,
              relationship: form.ec_relationship,
            }
          : null,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["profile", "detail", profile.patient_id], data);
      void queryClient.invalidateQueries({ queryKey: ["profile", "list"] });
    },
  });
  const errors = fieldErrors(save.error);
  const set = (name: keyof typeof form, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {core ? (
        <>
          <TextField
            label={t("profile.fields.fullName")}
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            error={errors.full_name}
          />
          <TextField
            type="date"
            label={t("profile.fields.dateOfBirth")}
            value={form.date_of_birth}
            onChange={(e) => set("date_of_birth", e.target.value)}
            error={errors.date_of_birth}
          />
          <SelectField
            label={t("profile.fields.sex")}
            value={form.sex}
            onChange={(e) => set("sex", e.target.value)}
          >
            <option value="">—</option>
            <option value="female">{t("profile.sex.female")}</option>
            <option value="male">{t("profile.sex.male")}</option>
            <option value="other">{t("profile.sex.other")}</option>
          </SelectField>
        </>
      ) : (
        <Alert tone="info">{t("profile.details.delegateNote")}</Alert>
      )}
      <PhoneField
        label={t("profile.fields.phone")}
        optional
        value={form.phone}
        onChange={(e) => set("phone", e.target.value)}
        error={errors.phone_e164}
      />
      <TextField
        type="email"
        label={t("profile.fields.email")}
        optional
        value={form.email}
        onChange={(e) => set("email", e.target.value)}
        error={errors.email}
      />
      <TextField
        label={t("profile.fields.address")}
        optional
        value={form.address}
        onChange={(e) => set("address", e.target.value)}
      />
      <fieldset className="m-0 flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 font-medium">{t("profile.fields.emergencyContact")}</legend>
        <TextField
          label={t("profile.fields.ecName")}
          optional
          value={form.ec_name}
          onChange={(e) => set("ec_name", e.target.value)}
        />
        <PhoneField
          label={t("profile.fields.ecPhone")}
          optional
          value={form.ec_phone}
          onChange={(e) => set("ec_phone", e.target.value)}
          error={errors["emergency_contact.phone_e164"]}
        />
        <TextField
          label={t("profile.fields.ecRelationship")}
          optional
          value={form.ec_relationship}
          onChange={(e) => set("ec_relationship", e.target.value)}
        />
      </fieldset>
      {save.isError && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("profile.error"))}
        </Alert>
      )}
      {save.isSuccess && (
        <Alert tone="success" role="status">
          {t("profile.saved")}
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={save.isPending}>
        {t("profile.save")}
      </Button>
    </form>
  );
}

/** /profile/:patientId/identifiers */
export function IdentifiersPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { patientId = "" } = useParams();
  const profile = useProfile(patientId);
  const key = ["profile", "identifiers", patientId];
  const list = useQuery({ queryKey: key, queryFn: () => api.profile.identifiers(patientId) });
  const allowed = profile.data ? can.identifiers(profile.data.relationship) : false;
  const [kind, setKind] = useState<IdentifierKind>("national_id");
  const [value, setValue] = useState("");
  const [country, setCountry] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api.profile.addIdentifier(patientId, { kind, value, issuing_country: country || undefined }),
    onSuccess: () => {
      setValue("");
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["profile", "detail", patientId] });
    },
  });
  const taken = isApiError(add.error) && add.error.status === 409;
  return (
    <ProfileLayout title={t("profile.sections.identifiers")} back={useBack()}>
      {list.isPending && <LoadingState />}
      {(list.data?.results ?? []).length === 0 && !list.isPending && (
        <p className="m-0">{t("profile.identifiers.none")}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.data?.results.map((item) => (
          <li key={item.id}>
            <Card padding="md" className="flex flex-col gap-1">
              <span className="font-medium">{t(`profile.identifierKinds.${item.kind}`)}</span>
              <MaskedValue
                masked={item.masked_value}
                name={t(`profile.identifierKinds.${item.kind}`)}
                labels={{
                  reveal: t("profile.reveal.show"),
                  hide: t("profile.reveal.hide"),
                  revealing: t("profile.reveal.showing"),
                  failed: t("profile.error"),
                }}
                onReveal={
                  allowed
                    ? async () => (await api.profile.revealIdentifier(patientId, item.id)).value
                    : undefined
                }
              />
              {item.is_verified && <Badge tone="success">{t("profile.identifiers.checked")}</Badge>}
            </Card>
          </li>
        ))}
      </ul>
      {allowed && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <h2 className="m-0 text-h3">{t("profile.identifiers.add")}</h2>
          <SelectField
            label={t("profile.identifiers.kind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as IdentifierKind)}
          >
            {(["national_id", "passport", "refugee_id", "birth_certificate"] as const).map((k) => (
              <option key={k} value={k}>
                {t(`profile.identifierKinds.${k}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t("profile.identifiers.number")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            error={taken ? undefined : fieldErrors(add.error).value}
          />
          {kind !== "national_id" && (
            <TextField
              label={t("profile.identifiers.country")}
              value={country}
              maxLength={2}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
            />
          )}
          {taken && (
            <Alert tone="info" role="alert">
              {errorText(add.error, t("profile.error"))}{" "}
              <Link to="/claim">{t("profile.identifiers.claim")}</Link>
            </Alert>
          )}
          {add.isError && !taken && !fieldErrors(add.error).value && (
            <Alert tone="danger" role="alert">
              {errorText(add.error, t("profile.error"))}
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={!value || add.isPending}>
            {t("profile.save")}
          </Button>
        </form>
      )}
    </ProfileLayout>
  );
}

/** /profile/:patientId/insurance */
export function InsurancePage() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { patientId = "" } = useParams();
  const key = ["profile", "insurance", patientId];
  const list = useQuery({ queryKey: key, queryFn: () => api.profile.insurance(patientId) });
  const [insurer, setInsurer] = useState("mutuelle");
  const [number, setNumber] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["profile", "detail", patientId] });
  };
  const add = useMutation({
    mutationFn: () =>
      api.profile.addInsurance(patientId, { insurer_code: insurer, member_number: number }),
    onSuccess: () => {
      setNumber("");
      refresh();
    },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.profile.deactivateInsurance(id),
    onSuccess: refresh,
  });
  const tone = { unverified: "warning", verified: "success", rejected: "danger" } as const;
  return (
    <ProfileLayout title={t("profile.sections.insurance")} back={useBack()}>
      {list.isPending && <LoadingState />}
      {(list.data?.results ?? []).length === 0 && !list.isPending && (
        <p className="m-0">{t("profile.insurance.none")}</p>
      )}
      {list.data?.results.map((card) => (
        <Card key={card.id} padding="md" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{card.insurer_display}</strong>
            <span className="font-mono">{card.member_number}</span>
            {card.is_expired ? (
              <Badge tone="danger">{t("profile.insurance.expired")}</Badge>
            ) : (
              <Badge tone={tone[card.status]}>{t(`profile.insurance.status.${card.status}`)}</Badge>
            )}
            {!card.is_active && <Badge tone="neutral">{t("profile.insurance.inactive")}</Badge>}
          </div>
          {card.last_verified && (
            <p className="m-0 text-fg-secondary">
              {t("profile.insurance.lastVerified", {
                facility: card.last_verified.facility_name ?? "—",
                date: formatDateTime(card.last_verified.at, locale, false),
              })}
            </p>
          )}
          {card.is_active && (
            <div>
              <Button variant="ghost" onClick={() => deactivate.mutate(card.id)}>
                {t("profile.insurance.deactivate")}
              </Button>
            </div>
          )}
        </Card>
      ))}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h2 className="m-0 text-h3">{t("profile.insurance.add")}</h2>
        <SelectField
          label={t("profile.insurance.insurer")}
          value={insurer}
          onChange={(e) => setInsurer(e.target.value)}
        >
          {["mutuelle", "rssb", "mmi", "radiant"].map((code) => (
            <option key={code} value={code}>
              {t(`profile.insurers.${code}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("profile.insurance.memberNumber")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          error={fieldErrors(add.error).member_number}
        />
        {add.isError && !fieldErrors(add.error).member_number && (
          <Alert tone="danger" role="alert">
            {errorText(add.error, t("profile.error"))}
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={!number || add.isPending}>
          {t("profile.save")}
        </Button>
      </form>
    </ProfileLayout>
  );
}

const KINDS: HealthKind[] = ["allergies", "conditions", "medications"];
const label = (item: HealthItem) => item.substance_text ?? item.display ?? item.drug_display ?? "";

/** /profile/:patientId/health */
export function HealthPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { patientId = "" } = useParams();
  const key = ["profile", "health", patientId];
  const health = useQuery({ queryKey: key, queryFn: () => api.profile.healthProfile(patientId) });
  const profile = useProfile(patientId);
  const [text, setText] = useState<Record<HealthKind, string>>({
    allergies: "",
    conditions: "",
    medications: "",
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["profile", "detail", patientId] });
  };
  const add = useMutation({
    mutationFn: (kind: HealthKind) =>
      api.profile.addHealthItem(
        patientId,
        kind,
        kind === "allergies"
          ? { category: "other", substance_text: text[kind] }
          : kind === "conditions"
            ? { display: text[kind] }
            : { drug_display: text[kind] },
      ),
    onSuccess: (_item, kind) => {
      setText((v) => ({ ...v, [kind]: "" }));
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: HealthKind; id: string }) =>
      api.profile.removeHealthItem(patientId, kind, id),
    onSuccess: refresh,
  });
  const none = useMutation({
    mutationFn: () =>
      api.profile.update(patientId, { version: profile.data!.version, no_known_allergies: true }),
    onSuccess: refresh,
  });
  return (
    <ProfileLayout title={t("profile.sections.health")} back={useBack()}>
      {health.isPending && <LoadingState />}
      {health.data && (
        <>
          {health.data.no_known_allergies === null &&
            (health.data.allergies ?? []).length === 0 &&
            profile.data && (
              <Card padding="md" className="flex flex-col gap-2">
                <p className="m-0">{t("profile.health.askAllergies")}</p>
                <Button variant="secondary" onClick={() => none.mutate()}>
                  {t("profile.health.noKnownAllergies")}
                </Button>
              </Card>
            )}
          {health.data.no_known_allergies && (
            <Badge tone="success">{t("profile.health.noKnownAllergiesSet")}</Badge>
          )}
          {KINDS.map((kind) => (
            <Card
              key={kind}
              as="section"
              aria-labelledby={`h-${kind}`}
              padding="md"
              className="flex flex-col gap-2"
            >
              <h2 id={`h-${kind}`} className="m-0 text-h3">
                {t(`profile.health.${kind}`)}
              </h2>
              {(health.data[kind] ?? []).length === 0 && (
                <p className="m-0 text-fg-muted">{t("profile.health.none")}</p>
              )}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(health.data[kind] ?? []).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2">
                    <span>{label(item)}</span>
                    {item.verification_status !== "verified" && (
                      <Badge tone="warning">{t("profile.health.unverified")}</Badge>
                    )}
                    {item.source === "patient" && item.verification_status === "unverified" && (
                      <Button variant="ghost" onClick={() => remove.mutate({ kind, id: item.id })}>
                        {t("profile.health.remove")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text[kind].trim()) add.mutate(kind);
                }}
              >
                <TextField
                  label={t(`profile.health.add.${kind}`)}
                  value={text[kind]}
                  onChange={(e) => setText({ ...text, [kind]: e.target.value })}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!text[kind].trim() || add.isPending}
                >
                  {t("profile.health.addButton")}
                </Button>
              </form>
            </Card>
          ))}
        </>
      )}
    </ProfileLayout>
  );
}

/** /profile/:patientId/access-history: plain-language sentences from action codes. */
export function AccessHistoryPage() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const { patientId = "" } = useParams();
  const history = useQuery({
    queryKey: ["profile", "history", patientId],
    queryFn: () => api.profile.accessHistory(patientId),
  });
  return (
    <ProfileLayout title={t("profile.sections.history")} back={useBack()}>
      <p className="m-0 text-fg-secondary">{t("profile.history.intro")}</p>
      {history.isPending && <LoadingState />}
      {history.isError && (
        <Alert tone="danger">{errorText(history.error, t("profile.error"))}</Alert>
      )}
      {history.data && history.data.results.length === 0 && (
        <p className="m-0">{t("profile.history.none")}</p>
      )}
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {history.data?.results.map((item) => (
          <li key={item.id}>
            <Card padding="md">
              <p className="m-0">
                {[
                  item.facility?.name,
                  item.actor_role
                    ? t(`profile.history.roles.${item.actor_role}`, {
                        defaultValue: item.actor_role,
                      })
                    : t(`profile.history.actors.${item.actor_kind}`),
                  t(`profile.history.actions.${item.action}`, {
                    defaultValue: t("profile.history.actions.other"),
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="m-0 text-fg-muted">{formatDateTime(item.occurred_at, locale)}</p>
            </Card>
          </li>
        ))}
      </ol>
    </ProfileLayout>
  );
}
