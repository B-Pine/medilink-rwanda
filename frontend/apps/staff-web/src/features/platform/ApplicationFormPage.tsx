import type {
  ApplicantApplication,
  ApplicationPatch,
  FacilityType,
  LocalisedItem,
  LocationItem,
  Ownership,
  PlatformApplication,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  LoadingState,
  SelectField,
  TextField,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";
import { facilityTypeLabel } from "../../facility/labels";
import { actionError, PlatformOnly } from "./shared";

// Leaflet loads only on this page
const LocationPicker = lazy(() => import("@medilink/ui/map-picker"));

const LEVELS = ["province", "district", "sector", "cell", "village"] as const;
type Level = (typeof LEVELS)[number];
const OWNERSHIPS: Ownership[] = ["public", "private", "faith_based", "ngo"];
const TIN = /^\d{9}$/;
const MOH_CODE = /^[A-Za-z0-9/._-]{1,20}$/;
const insideRwanda = (lat: number, lng: number) =>
  lat >= -2.85 && lat <= -1.04 && lng >= 28.85 && lng <= 30.9;

interface Values {
  facility: ApplicantApplication["facility"];
  location: { village_code: string; address: string; lat: string; lng: string };
  applicant: ApplicantApplication["applicant"];
  admin: ApplicantApplication["proposed_admin"];
  insurers: string[];
}

function initial(app?: PlatformApplication): Values {
  return {
    facility: app?.facility ?? {
      name: "",
      facility_type: "",
      level_of_care: "",
      ownership: "",
      organization_name: "",
      moh_facility_code: "",
      tin: "",
      phone: "",
      email: "",
    },
    location: {
      village_code: app?.location.village_code ?? "",
      address: app?.location.address ?? "",
      lat: app?.location.latitude?.toString() ?? "",
      lng: app?.location.longitude?.toString() ?? "",
    },
    applicant: app?.applicant ?? { name: "", email: "", phone: "", position: "" },
    admin: app?.proposed_admin ?? { name: "", email: "", phone: "" },
    insurers: app?.claimed_insurer_codes ?? [],
  };
}

/** /platform/applications/new: register a facility on its behalf (by phone or a visit). */
export function ApplicationNewPage() {
  return (
    <PlatformOnly>
      <ApplicationForm />
    </PlatformOnly>
  );
}

/** /platform/applications/:id/edit: complete or correct a draft (or changes requested). */
export function ApplicationEditPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const { t } = useTranslation();
  const app = useQuery({
    queryKey: ["platform", "application", id],
    queryFn: () => api.onboarding.platform.application(id),
  });
  return (
    <PlatformOnly>
      {app.isPending ? (
        <LoadingState />
      ) : app.isError ? (
        <Alert tone="danger">{t("platform.table.error")}</Alert>
      ) : (
        <ApplicationForm app={app.data} />
      )}
    </PlatformOnly>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-heading text-h3">{title}</h2>
        {hint && <p className="m-0 text-body-sm text-fg-secondary">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function ApplicationForm({ app }: { app?: PlatformApplication }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>(() => initial(app));
  const [sendLink, setSendLink] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const types = useQuery({
    queryKey: ["platform", "md", "facility-types"],
    queryFn: () => api.masterData.publicList("facility-types", { page_size: 100 }),
  });
  const insurers = useQuery({
    queryKey: ["platform", "md", "insurers"],
    queryFn: () => api.masterData.publicList("insurers", { page_size: 100 }),
  });

  const setFacility = (key: keyof Values["facility"]) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, facility: { ...v.facility, [key]: e.target.value } }));
  const setGroup =
    <G extends "applicant" | "admin" | "location">(group: G, key: keyof Values[G]) =>
    (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [group]: { ...v[group], [key]: e.target.value } }));

  function body(): Omit<ApplicationPatch, "version"> {
    const lat = Number(values.location.lat.replace(",", "."));
    const lng = Number(values.location.lng.replace(",", "."));
    const pinned = values.location.lat.trim() && values.location.lng.trim();
    return {
      facility: values.facility,
      location: {
        ...(values.location.village_code ? { village_code: values.location.village_code } : {}),
        address: values.location.address,
        latitude: pinned ? Number(lat.toFixed(6)) : null,
        longitude: pinned ? Number(lng.toFixed(6)) : null,
      },
      applicant: values.applicant,
      proposed_admin: values.admin,
      claimed_insurer_codes: values.insurers,
    };
  }

  function check(): Record<string, string> {
    const out: Record<string, string> = {};
    const f = values.facility;
    if (!f.name.trim()) out["facility.name"] = t("platform.form.required");
    if (!values.applicant.name.trim()) out["applicant.name"] = t("platform.form.required");
    if (!values.applicant.email.includes("@"))
      out["applicant.email"] = t("platform.form.email_invalid");
    if (f.tin && !TIN.test(f.tin)) out["facility.tin"] = t("platform.form.tin");
    if (f.moh_facility_code && !MOH_CODE.test(f.moh_facility_code))
      out["facility.moh_facility_code"] = t("platform.form.mohCode");
    const { lat, lng } = values.location;
    if (lat.trim() || lng.trim()) {
      const a = Number(lat.replace(",", "."));
      const b = Number(lng.replace(",", "."));
      if (Number.isNaN(a) || Number.isNaN(b) || !insideRwanda(a, b))
        out["location.latitude"] = t("platform.form.outsideRwanda");
    }
    return out;
  }

  const save = useMutation({
    mutationFn: async () => {
      const data = body();
      if (app) return api.onboarding.platform.update(app.id, { version: app.version, ...data });
      return api.onboarding.platform.create({
        ...data,
        applicant: values.applicant,
        facility: { ...values.facility, name: values.facility.name.trim() },
        send_link: sendLink,
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      void navigate(`/platform/applications/${saved.id}`);
    },
    onError: (failure) => {
      const server = (failure as { fields?: Record<string, string[]> }).fields ?? {};
      setFields(Object.fromEntries(Object.entries(server).map(([k, v]) => [k, v[0] ?? ""])));
      setError(actionError(failure, t("errors.generic")));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = check();
    setFields(found);
    setError(Object.keys(found).length ? t("platform.form.fix") : undefined);
    if (!Object.keys(found).length) save.mutate();
  }

  const field = (name: string) => fields[name];
  const title = app
    ? t("platform.form.editTitle", { name: app.facility.name })
    : t("platform.form.newTitle");
  const pin =
    values.location.lat && values.location.lng
      ? { lat: Number(values.location.lat), lng: Number(values.location.lng) }
      : null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={title}
        back={{
          to: app ? `/platform/applications/${app.id}` : "/platform/applications",
          label: t("platform.form.back"),
        }}
      />
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Section title={t("platform.form.facility")}>
          <TextField
            label={t("platform.form.facilityName")}
            value={values.facility.name}
            onChange={setFacility("name")}
            error={field("facility.name")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("platform.review.type")}
              value={values.facility.facility_type}
              onChange={setFacility("facility_type")}
            >
              <option value="">{t("platform.form.choose")}</option>
              {(types.data?.results ?? []).map((type: LocalisedItem) => (
                <option key={String(type.code)} value={String(type.code)}>
                  {facilityTypeLabel(type.code as FacilityType, t)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("platform.review.ownership")}
              value={values.facility.ownership}
              onChange={setFacility("ownership")}
            >
              <option value="">{t("platform.form.choose")}</option>
              {OWNERSHIPS.map((o) => (
                <option key={o} value={o}>
                  {t(`platform.ownership.${o}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("platform.review.levelOfCare")}
              value={values.facility.level_of_care}
              onChange={setFacility("level_of_care")}
            >
              <option value="">{t("platform.review.levelFromType")}</option>
              {(["primary", "secondary", "tertiary"] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`platform.review.level.${l}`)}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t("platform.review.organization")}
              optional
              value={values.facility.organization_name}
              onChange={setFacility("organization_name")}
            />
            <TextField
              label={t("platform.review.mohCode")}
              optional
              value={values.facility.moh_facility_code}
              onChange={setFacility("moh_facility_code")}
              error={field("facility.moh_facility_code")}
            />
            <TextField
              label={t("platform.review.tin")}
              optional
              inputMode="numeric"
              maxLength={9}
              value={values.facility.tin}
              onChange={setFacility("tin")}
              error={field("facility.tin")}
            />
            <TextField
              label={t("platform.form.phone")}
              type="tel"
              value={values.facility.phone}
              onChange={setFacility("phone")}
              error={field("facility.phone")}
            />
            <TextField
              label={t("platform.form.email")}
              type="email"
              value={values.facility.email}
              onChange={setFacility("email")}
              error={field("facility.email")}
            />
          </div>
        </Section>

        <Section title={t("platform.form.location")} hint={t("platform.form.locationHint")}>
          <VillagePicker
            value={values.location.village_code}
            path={app?.location.path ?? []}
            onChange={(village_code) =>
              setValues((v) => ({ ...v, location: { ...v.location, village_code } }))
            }
            error={field("location.village_code")}
          />
          <TextField
            label={t("platform.form.address")}
            value={values.location.address}
            onChange={setGroup("location", "address")}
          />
          <Suspense fallback={<div className="h-72 rounded-3xl bg-subtle" aria-hidden="true" />}>
            <LocationPicker
              value={pin && !Number.isNaN(pin.lat) && !Number.isNaN(pin.lng) ? pin : null}
              onChange={({ lat, lng }) =>
                setValues((v) => ({
                  ...v,
                  location: { ...v.location, lat: String(lat), lng: String(lng) },
                }))
              }
              tilesUrl={env.mapTilesUrl}
              attribution="© OpenStreetMap contributors"
              label={t("platform.form.mapLabel")}
              pinLabel={t("platform.form.pinLabel")}
            />
          </Suspense>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t("platform.form.latitude")}
              inputMode="decimal"
              value={values.location.lat}
              onChange={setGroup("location", "lat")}
              error={field("location.latitude")}
            />
            <TextField
              label={t("platform.form.longitude")}
              inputMode="decimal"
              value={values.location.lng}
              onChange={setGroup("location", "lng")}
            />
          </div>
        </Section>

        <Section title={t("platform.form.applicant")} hint={t("platform.form.applicantHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t("platform.form.name")}
              value={values.applicant.name}
              onChange={setGroup("applicant", "name")}
              error={field("applicant.name")}
            />
            <TextField
              label={t("platform.form.position")}
              optional
              value={values.applicant.position}
              onChange={setGroup("applicant", "position")}
            />
            <TextField
              label={t("platform.form.email")}
              type="email"
              value={values.applicant.email}
              onChange={setGroup("applicant", "email")}
              error={field("applicant.email")}
            />
            <TextField
              label={t("platform.form.phone")}
              type="tel"
              value={values.applicant.phone}
              onChange={setGroup("applicant", "phone")}
            />
          </div>
        </Section>

        <Section title={t("platform.form.admin")} hint={t("platform.form.adminHint")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label={t("platform.form.name")}
              value={values.admin.name}
              onChange={setGroup("admin", "name")}
            />
            <TextField
              label={t("platform.form.email")}
              type="email"
              value={values.admin.email}
              onChange={setGroup("admin", "email")}
              error={field("proposed_admin.email")}
            />
            <TextField
              label={t("platform.form.phone")}
              type="tel"
              value={values.admin.phone}
              onChange={setGroup("admin", "phone")}
            />
          </div>
        </Section>

        <Section title={t("platform.review.insurers")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(insurers.data?.results ?? []).map((insurer: LocalisedItem) => {
              const code = String(insurer.code);
              return (
                <CheckboxField
                  key={code}
                  label={String(insurer.name)}
                  checked={values.insurers.includes(code)}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      insurers: e.target.checked
                        ? [...new Set([...v.insurers, code])]
                        : v.insurers.filter((c) => c !== code),
                    }))
                  }
                />
              );
            })}
          </div>
        </Section>

        {!app && (
          <CheckboxField
            label={t("platform.applications.sendLink")}
            checked={sendLink}
            onChange={(e) => setSendLink(e.target.checked)}
          />
        )}
        <p className="m-0 text-body-sm text-fg-secondary">{t("platform.form.nextSteps")}</p>
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              void navigate(app ? `/platform/applications/${app.id}` : "/platform/applications")
            }
          >
            {t("lock.cancel")}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {app ? t("platform.form.save") : t("platform.applications.createSubmit")}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Province, district, sector, cell, village: each list loads when its parent is chosen. */
function VillagePicker({
  value,
  path,
  onChange,
  error,
}: {
  value: string;
  path: { level: string; code: string }[];
  onChange: (village: string) => void;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [picked, setPicked] = useState<Partial<Record<Level, string>>>(() =>
    Object.fromEntries(path.map((p) => [p.level, p.code])),
  );
  const useLevel = (parent: string | undefined, root = false) =>
    useQuery({
      queryKey: ["platform", "md", "locations", parent ?? "root"],
      queryFn: () =>
        api.masterData.publicList<LocationItem>("locations", {
          page_size: 100,
          ...(parent ? { parent } : {}),
        }),
      enabled: root || Boolean(parent),
    });
  const lists: Record<Level, ReturnType<typeof useLevel>> = {
    province: useLevel(undefined, true),
    district: useLevel(picked.province),
    sector: useLevel(picked.district),
    cell: useLevel(picked.sector),
    village: useLevel(picked.cell),
  };

  function pick(level: Level, code: string) {
    const next: Partial<Record<Level, string>> = {};
    for (const l of LEVELS) {
      if (l === level) {
        next[l] = code;
        break;
      }
      next[l] = picked[l];
    }
    setPicked(next);
    if (level === "village") onChange(code);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {LEVELS.map((level, i) => {
        if (i > 0 && !picked[LEVELS[i - 1]!]) return null;
        return (
          <SelectField
            key={level}
            label={t(`platform.form.levels.${level}`)}
            value={picked[level] ?? (level === "village" ? value : "")}
            onChange={(e) => pick(level, e.target.value)}
            disabled={lists[level].isPending}
            error={level === "village" ? error : undefined}
          >
            <option value="">{t("platform.form.choose")}</option>
            {(lists[level].data?.results ?? []).map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </SelectField>
        );
      })}
    </div>
  );
}
