import type {
  FacilityProfile,
  FacilitySettings,
  SettingFieldSpec,
  SettingsSection,
  SettingValues,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  EmptyState,
  SelectField,
  SwitchField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextareaField,
  TextField,
} from "@medilink/ui";
import {
  Buildings,
  CalendarBlank,
  CaretRight,
  ClipboardText,
  ClockCounterClockwise,
  Clock,
  FirstAidKit,
  Crosshair,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Trash,
  UploadSimple,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import {
  ConflictNotice,
  errorText,
  fieldErrors,
  formatDate,
  isConflict,
  QueryState,
  SetupGate,
  setupKeys,
  useLocale,
} from "./shared";

const SECTIONS: { to: string; key: string; icon: Icon }[] = [
  { to: "/settings/profile", key: "profile", icon: Buildings },
  { to: "/settings/services", key: "services", icon: FirstAidKit },
  { to: "/settings/hours", key: "hours", icon: Clock },
  { to: "/settings/schedules", key: "schedules", icon: CalendarBlank },
  { to: "/settings/tariffs", key: "tariffs", icon: Receipt },
  { to: "/settings/insurers", key: "insurers", icon: ShieldCheck },
  { to: "/settings/rules", key: "rules", icon: SlidersHorizontal },
  { to: "/settings/history", key: "history", icon: ClockCounterClockwise },
];

/** /settings: one tile per configuration area (contract §6.1). */
export function SettingsHomePage() {
  const { t } = useTranslation();
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.title")}
          description={t("setup.settings.intro")}
          actions={
            <Link to="/setup" className="inline-flex items-center gap-1.5 font-semibold">
              <ClipboardText aria-hidden="true" className="size-5" />
              {t("setup.settings.checklistLink")}
            </Link>
          }
        />
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map(({ to, key, icon: SectionIcon }) => (
            <li key={key} className="flex">
              <Link
                to={to}
                className="group flex flex-1 items-start gap-4 rounded-lg border border-border bg-surface p-4 text-fg no-underline transition-colors hover:border-border-input hover:bg-raised"
              >
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-on-brand-subtle">
                  <SectionIcon aria-hidden="true" weight="duotone" className="size-6" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{t(`setup.settings.sections.${key}.title`)}</span>
                  <span className="text-body-sm text-fg-secondary">
                    {t(`setup.settings.sections.${key}.description`)}
                  </span>
                </span>
                <CaretRight
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 text-fg-muted group-hover:text-fg"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </SetupGate>
  );
}

const back = (t: (key: string) => string) => ({
  to: "/settings",
  label: t("setup.settings.title"),
});

// ---- profile -------------------------------------------------------------------------------------

/** Rwanda's bounding box: coordinates outside it are refused (contract §6.1). */
const RWANDA = { latMin: -2.9, latMax: -1.0, lngMin: 28.8, lngMax: 30.95 };

/** /settings/profile: public facility profile, photos and location. */
export function ProfilePage() {
  const { t } = useTranslation();
  const api = useApi();
  const facility = useQuery({ queryKey: setupKeys.facility, queryFn: () => api.setup.facility() });
  const [reloads, setReloads] = useState(0);
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex max-w-4xl flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.profile.title")}
          description={t("setup.profile.intro")}
          back={back(t)}
        />
        <QueryState query={facility}>
          {(data) => (
            <ProfileForm
              key={reloads}
              profile={data}
              onReload={() => void facility.refetch().then(() => setReloads((n) => n + 1))}
            />
          )}
        </QueryState>
      </div>
    </SetupGate>
  );
}

function ProfileForm({ profile, onReload }: { profile: FacilityProfile; onReload: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    address: profile.address,
    latitude: profile.latitude ?? "",
    longitude: profile.longitude ?? "",
    description_en: profile.description_i18n.en ?? "",
    description_rw: profile.description_i18n.rw ?? "",
    description_fr: profile.description_i18n.fr ?? "",
  });
  const [locError, setLocError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const set = (key: keyof typeof form, value: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  const outside =
    form.latitude !== "" &&
    form.longitude !== "" &&
    !(lat >= RWANDA.latMin && lat <= RWANDA.latMax && lng >= RWANDA.lngMin && lng <= RWANDA.lngMax);

  const save = useMutation({
    mutationFn: () =>
      api.setup.updateFacility({
        version: profile.version,
        phone: form.phone,
        email: form.email,
        website: form.website,
        address: form.address,
        latitude: form.latitude || null,
        longitude: form.longitude || null,
        description_i18n: {
          en: form.description_en,
          rw: form.description_rw,
          fr: form.description_fr,
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(setupKeys.facility, data);
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      setSaved(true);
    },
  });
  const errors = fieldErrors(save.error);

  const locate = () => {
    setLocError(undefined);
    if (!("geolocation" in navigator)) return setLocError(t("setup.profile.locationUnavailable"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        set("latitude", coords.latitude.toFixed(6));
        set("longitude", coords.longitude.toFixed(6));
      },
      () => setLocError(t("setup.profile.locationUnavailable")),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!outside) save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {isConflict(save.error) && <ConflictNotice onReload={onReload} />}
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="m-0 font-heading text-h3">{t("setup.profile.identity")}</h2>
        <dl className="m-0 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["name", profile.name],
              [
                "type",
                t(`setup.facilityTypes.${profile.facility_type}`, {
                  defaultValue: profile.facility_type,
                }),
              ],
              ["status", t(`setup.status.${profile.status}`, { defaultValue: profile.status })],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <dt className="text-body-sm text-fg-muted">{t(`setup.profile.${key}`)}</dt>
              <dd className="m-0 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-body-sm text-fg-muted">{t("setup.profile.platformManaged")}</p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="m-0 font-heading text-h3">{t("setup.profile.contact")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("setup.profile.phone")}
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={errors.phone}
            optional
          />
          <TextField
            label={t("setup.profile.email")}
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            error={errors.email}
            optional
          />
          <TextField
            label={t("setup.profile.website")}
            type="url"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            error={errors.website}
            optional
          />
          <TextField
            label={t("setup.profile.address")}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            error={errors.address}
            optional
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="m-0 font-heading text-h3">{t("setup.profile.location")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label={t("setup.profile.latitude")}
            inputMode="decimal"
            value={form.latitude}
            onChange={(e) => set("latitude", e.target.value)}
            error={errors.latitude}
            className="w-44"
            optional
          />
          <TextField
            label={t("setup.profile.longitude")}
            inputMode="decimal"
            value={form.longitude}
            onChange={(e) => set("longitude", e.target.value)}
            error={errors.longitude}
            className="w-44"
            optional
          />
          <Button type="button" variant="secondary" onClick={locate}>
            <Crosshair aria-hidden="true" />
            {t("setup.profile.useLocation")}
          </Button>
        </div>
        {(outside || locError) && (
          <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
            {locError ?? t("setup.profile.outsideRwanda")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="m-0 font-heading text-h3">{t("setup.profile.description")}</h2>
        <p className="m-0 -mt-2 text-body-sm text-fg-secondary">
          {t("setup.profile.descriptionHint")}
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {(["rw", "en", "fr"] as const).map((lang) => (
            <TextareaField
              key={lang}
              label={t(`setup.languages.${lang}`)}
              rows={4}
              value={form[`description_${lang}`]}
              onChange={(e) => set(`description_${lang}`, e.target.value)}
              optional
            />
          ))}
        </div>
      </section>

      <Photos profile={profile} />

      {save.isError && !isConflict(save.error) && Object.keys(errors).length === 0 && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("setup.failed"))}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" role="status">
          {t("setup.saved")}
        </Alert>
      )}
      <div className="flex justify-end border-t border-border pt-5">
        <Button type="submit" size="lg" disabled={save.isPending || outside}>
          {t("setup.save")}
        </Button>
      </div>
    </form>
  );
}

function Photos({ profile }: { profile: FacilityProfile }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const update = (data: FacilityProfile) => queryClient.setQueryData(setupKeys.facility, data);
  const add = useMutation({
    mutationFn: (file: File) => api.setup.addPhoto(file),
    onSuccess: update,
  });
  const remove = useMutation({
    mutationFn: (uploadId: string) => api.setup.removePhoto(uploadId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: setupKeys.facility }),
  });
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 font-heading text-h3">{t("setup.profile.photos")}</h2>
          <p className="m-0 text-body-sm text-fg-secondary">
            {t("setup.profile.photosHint", { count: profile.photos.length })}
          </p>
        </div>
        <label className="inline-flex min-h-target cursor-pointer items-center gap-2 rounded-md border border-border-input px-4 font-semibold hover:bg-subtle has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <UploadSimple aria-hidden="true" className="size-5" />
          {t("setup.profile.addPhoto")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={profile.photos.length >= 6 || add.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) add.mutate(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {profile.photos.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {profile.photos.map((photo, index) => (
            <li
              key={photo}
              className="flex aspect-[4/3] flex-col justify-between rounded-md border border-border bg-subtle p-2"
            >
              <span className="text-body-sm text-fg-secondary">
                {t("setup.profile.photoN", { n: index + 1 })}
              </span>
              <Button
                variant="ghost"
                onClick={() => remove.mutate(photo)}
                aria-label={t("setup.profile.removePhotoN", { n: index + 1 })}
                className="self-end"
              >
                <Trash aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(add.isError || remove.isError) && (
        <Alert tone="danger" role="alert">
          {errorText(add.error ?? remove.error, t("setup.failed"))}
        </Alert>
      )}
    </section>
  );
}

// ---- rules (settings sections) ---------------------------------------------------------------

const RULE_SECTIONS: SettingsSection[] = [
  "queue",
  "booking",
  "billing",
  "documents",
  "notifications",
];

/** /settings/rules (S2-F9): forms generated from each section's schema; billing needs step-up. */
export function RulesPage() {
  const { t } = useTranslation();
  const api = useApi();
  const settings = useQuery({ queryKey: setupKeys.settings, queryFn: () => api.setup.settings() });
  const [reloads, setReloads] = useState(0);
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex max-w-4xl flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.rules.title")}
          description={t("setup.rules.intro")}
          back={back(t)}
        />
        <QueryState query={settings}>
          {(data) => (
            <Tabs defaultValue="queue">
              <TabsList aria-label={t("setup.settings.sections.rules.title")}>
                {RULE_SECTIONS.map((section) => (
                  <TabsTrigger key={section} value={section}>
                    {t(`setup.rules.sections.${section}`)}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="branding">{t("setup.rules.sections.branding")}</TabsTrigger>
              </TabsList>
              {RULE_SECTIONS.map((section) => (
                <TabsContent key={section} value={section}>
                  <SectionForm
                    key={`${section}-${reloads}`}
                    section={section}
                    settings={data}
                    onReload={() => void settings.refetch().then(() => setReloads((n) => n + 1))}
                  />
                </TabsContent>
              ))}
              <TabsContent value="branding">
                <BrandingForm />
              </TabsContent>
            </Tabs>
          )}
        </QueryState>
      </div>
    </SetupGate>
  );
}

function SectionForm({
  section,
  settings,
  onReload,
}: {
  section: SettingsSection;
  settings: FacilitySettings;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const fields = Object.entries(settings.schema[section] ?? {});
  const [values, setValues] = useState<SettingValues>(() => ({ ...settings[section] }));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const call = () => api.setup.updateSettings({ version: settings.version, section, values });
      return section === "billing" ? withStepUp(call) : call();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(setupKeys.settings, data);
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      setSaved(true);
    },
  });
  const errors = fieldErrors(save.error);
  const label = (name: string) =>
    t(`setup.rules.fields.${section}.${name}`, { defaultValue: name });
  const hint = (spec: SettingFieldSpec) =>
    spec.kind === "int" && spec.minimum !== null && spec.maximum !== null
      ? t("setup.rules.range", { min: spec.minimum, max: spec.maximum })
      : undefined;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="mt-4 flex flex-col gap-5 rounded-lg border border-border bg-surface p-5"
    >
      {isConflict(save.error) && <ConflictNotice onReload={onReload} />}
      {section === "billing" && (
        <p className="m-0 text-body-sm text-fg-secondary">{t("setup.rules.billingStepUp")}</p>
      )}
      <div className="flex flex-col divide-y divide-border">
        {fields.map(([name, spec]) => {
          const value = values[name] ?? spec.default;
          const set = (next: boolean | number | string) => {
            setSaved(false);
            setValues((v) => ({ ...v, [name]: next }));
          };
          return (
            <div key={name} className="py-3 first:pt-0 last:pb-0">
              {spec.kind === "bool" ? (
                <SwitchField label={label(name)} checked={Boolean(value)} onCheckedChange={set} />
              ) : spec.kind === "choice" ? (
                <SelectField
                  label={label(name)}
                  value={String(value)}
                  onChange={(e) => set(e.target.value)}
                  error={errors[name]}
                  className="max-w-xs"
                >
                  {spec.choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {t(`setup.rules.choices.${choice}`, { defaultValue: choice })}
                    </option>
                  ))}
                </SelectField>
              ) : spec.kind === "int" ? (
                <TextField
                  label={label(name)}
                  hint={hint(spec)}
                  type="number"
                  inputMode="numeric"
                  min={spec.minimum ?? undefined}
                  max={spec.maximum ?? undefined}
                  value={String(value)}
                  onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
                  error={errors[name]}
                  className="max-w-48"
                  inputClassName="tabular-nums"
                />
              ) : (
                <TextField
                  label={label(name)}
                  value={String(value)}
                  onChange={(e) => set(e.target.value)}
                  error={errors[name]}
                  className="max-w-xs"
                />
              )}
            </div>
          );
        })}
      </div>
      {save.isError && !isConflict(save.error) && errorText(save.error, t("setup.failed")) && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("setup.failed"))}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" role="status">
          {t("setup.saved")}
        </Alert>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {t("setup.save")}
        </Button>
      </div>
    </form>
  );
}

function BrandingForm() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const branding = useQuery({
    queryKey: ["setup", "branding"],
    queryFn: () => api.setup.branding(),
  });
  const [footer, setFooter] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.setup.saveBranding({ version: branding.data?.version ?? 1, footer_text: footer ?? "" }),
    onSuccess: (data) => queryClient.setQueryData(["setup", "branding"], data),
  });
  return (
    <QueryState query={branding}>
      {(data) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="mt-4 flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
        >
          <p className="m-0 text-body-sm text-fg-secondary">{t("setup.rules.brandingHint")}</p>
          <TextareaField
            label={t("setup.rules.footer")}
            rows={3}
            maxLength={300}
            value={footer ?? data.footer_text}
            onChange={(e) => setFooter(e.target.value)}
            optional
          />
          {save.isError && (
            <Alert tone="danger" role="alert">
              {errorText(save.error, t("setup.failed"))}
            </Alert>
          )}
          {save.isSuccess && (
            <Alert tone="success" role="status">
              {t("setup.saved")}
            </Alert>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              {t("setup.save")}
            </Button>
          </div>
        </form>
      )}
    </QueryState>
  );
}

// ---- history ---------------------------------------------------------------------------------

const ENTITIES = ["", "facility", "opening_hours", "settings", "tariff", "service"];

const show = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

/** /settings/history: configuration change log with an entity filter. */
export function HistoryPage() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const changes = useQuery({
    queryKey: setupKeys.changes(entity, page),
    queryFn: () => api.setup.changes({ entity: entity || undefined, page }),
  });
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.history.title")}
          description={t("setup.history.intro")}
          back={back(t)}
        />
        <SelectField
          label={t("setup.history.entity")}
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        >
          {ENTITIES.map((value) => (
            <option key={value} value={value}>
              {t(`setup.history.entities.${value || "all"}`)}
            </option>
          ))}
        </SelectField>
        <QueryState query={changes}>
          {(data) =>
            data.results.length === 0 ? (
              <EmptyState
                icon={ClockCounterClockwise}
                title={t("setup.history.emptyTitle")}
                description={t("setup.history.empty")}
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full border-collapse text-left text-body-sm">
                  <caption className="sr-only">
                    {t("setup.settings.sections.history.title")}
                  </caption>
                  <thead className="bg-subtle text-fg-secondary">
                    <tr>
                      {["when", "who", "what", "field", "before", "after"].map((col) => (
                        <th key={col} scope="col" className="px-3 py-2.5 font-semibold">
                          {t(`setup.history.columns.${col}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((row) => (
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                          {formatDate(row.changed_at, locale, true)}
                        </td>
                        <td className="px-3 py-2.5">{row.actor_name ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {t(`setup.history.entities.${row.entity.split(".")[0]}`, {
                            defaultValue: row.entity,
                          })}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-caption">{row.field}</td>
                        <td
                          className="max-w-56 truncate px-3 py-2.5 text-fg-muted"
                          title={show(row.old_value)}
                        >
                          {show(row.old_value)}
                        </td>
                        <td className="max-w-56 truncate px-3 py-2.5" title={show(row.new_value)}>
                          {show(row.new_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                  <span className="text-body-sm text-fg-secondary tabular-nums">
                    {t("setup.history.count", { count: data.count })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={!data.previous}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      {t("setup.previous")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!data.next}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("setup.next")}
                    </Button>
                  </div>
                </div>
              </div>
            )
          }
        </QueryState>
      </div>
    </SetupGate>
  );
}
