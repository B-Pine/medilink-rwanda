import {
  isApiError,
  newIdempotencyKey,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_BYTES,
  type ApplicantApplication,
  type ApplicationPatch,
  type DocumentKind,
  type LocationItem,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  CheckboxField,
  FileUpload,
  SelectField,
  TextField,
  type FileUploadItem,
  type FileUploadLabels,
} from "@medilink/ui";
import { MapPin } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { env } from "../../env";
import { applicationKey, insideRwanda, usePublicList } from "./data";

// Leaflet and the tiles load only on the location step
const LocationPicker = lazy(() => import("@medilink/ui/map-picker"));

type Save = (patch: Omit<ApplicationPatch, "version">) => void;
// facility photos: images only, up to 6 (they become the facility profile's photos)
const PHOTO_ACCEPT = "image/jpeg,image/png,image/heic,image/heif";
const MAX_PHOTOS = 6;
// as the API: the RRA TIN has 9 digits; the MoH facility code (FOSA ID) is short and plain
const TIN = /^\d{9}$/;
const MOH_CODE = /^[A-Za-z0-9/._-]{1,20}$/;
const OWNERSHIPS = ["public", "private", "faith_based", "ngo"] as const;

/** The reviewer's comment on a field (changes requested), shown as that field's error. */
function useFeedback(app: ApplicantApplication) {
  return (target: string): string | undefined =>
    app.feedback.items.find((item) => item.target === target)?.comment;
}

export function FacilityStep({ app, save }: { app: ApplicantApplication; save: Save }) {
  const { t } = useTranslation();
  const types = usePublicList("facility-types");
  const [values, setValues] = useState(app.facility);
  const feedback = useFeedback(app);
  const change =
    (key: keyof ApplicantApplication["facility"]) => (e: { target: { value: string } }) => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [key]: value }));
      // the identifiers are checked here first: autosave sends only a well-formed value
      if (key === "tin" && value && !TIN.test(value)) return;
      if (key === "moh_facility_code" && value && !MOH_CODE.test(value)) return;
      save({ facility: { [key]: value } });
    };
  const tinError =
    values.tin && !TIN.test(values.tin) ? t("facilityApplication.fields.tinInvalid") : undefined;
  const codeError =
    values.moh_facility_code && !MOH_CODE.test(values.moh_facility_code)
      ? t("facilityApplication.fields.mohCodeInvalid")
      : undefined;
  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={(e) => e.preventDefault()}>
      <TextField
        id="facility.name"
        label={t("facilityApplication.fields.facilityName")}
        value={values.name}
        onChange={change("name")}
        error={feedback("facility.name")}
      />
      <SelectField
        id="facility.facility_type"
        label={t("facilityApplication.fields.facilityType")}
        value={values.facility_type}
        onChange={change("facility_type")}
        error={feedback("facility.facility_type")}
      >
        <option value="">{t("facilityApplication.fields.choose")}</option>
        {types.data?.results.map((type) => (
          <option key={type.code} value={type.code}>
            {type.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="facility.ownership"
        label={t("facilityApplication.fields.ownership")}
        value={values.ownership}
        onChange={change("ownership")}
      >
        <option value="">{t("facilityApplication.fields.choose")}</option>
        {OWNERSHIPS.map((o) => (
          <option key={o} value={o}>
            {t(`facilityApplication.ownership.${o}`)}
          </option>
        ))}
      </SelectField>
      <TextField
        id="facility.organization_name"
        label={t("facilityApplication.fields.organization")}
        optional
        value={values.organization_name}
        onChange={change("organization_name")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="facility.moh_facility_code"
          label={t("facilityApplication.fields.mohCode")}
          hint={t("facilityApplication.fields.mohCodeHint")}
          optional
          autoComplete="off"
          value={values.moh_facility_code}
          onChange={change("moh_facility_code")}
          error={codeError ?? feedback("facility.moh_facility_code")}
        />
        <TextField
          id="facility.tin"
          label={t("facilityApplication.fields.tin")}
          hint={t("facilityApplication.fields.tinHint")}
          optional
          inputMode="numeric"
          autoComplete="off"
          maxLength={9}
          value={values.tin}
          onChange={change("tin")}
          error={tinError ?? feedback("facility.tin")}
        />
      </div>
      <TextField
        id="facility.phone"
        label={t("facilityApplication.fields.facilityPhone")}
        type="tel"
        autoComplete="tel"
        value={values.phone}
        onChange={change("phone")}
      />
      <TextField
        id="facility.email"
        label={t("facilityApplication.fields.facilityEmail")}
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={change("email")}
      />
    </form>
  );
}

const LEVELS = ["province", "district", "sector", "cell", "village"] as const;
type Level = (typeof LEVELS)[number];

export function LocationStep({ app, save }: { app: ApplicantApplication; save: Save }) {
  const { t } = useTranslation();
  const initial = Object.fromEntries(app.location.path.map((p) => [p.level, p.code])) as Partial<
    Record<Level, string>
  >;
  const [picked, setPicked] = useState<Partial<Record<Level, string>>>(initial);
  const [address, setAddress] = useState(app.location.address);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: app.location.latitude,
    lng: app.location.longitude,
  });
  const [geoMessage, setGeoMessage] = useState<string | undefined>();
  // the typed fields (keyboard alternative to the map); saved once both are valid
  const [typed, setTyped] = useState({
    lat: app.location.latitude?.toString() ?? "",
    lng: app.location.longitude?.toString() ?? "",
  });
  const [typedError, setTypedError] = useState<string | undefined>();
  const feedback = useFeedback(app);
  const pinMissing =
    app.missing_for_submit.includes("location.latitude") &&
    (coords.lat === null || coords.lng === null);
  const provinces = usePublicList<LocationItem>("locations");
  const districts = usePublicList<LocationItem>(
    "locations",
    { parent: picked.province },
    Boolean(picked.province),
  );
  const sectors = usePublicList<LocationItem>(
    "locations",
    { parent: picked.district },
    Boolean(picked.district),
  );
  const cells = usePublicList<LocationItem>(
    "locations",
    { parent: picked.sector },
    Boolean(picked.sector),
  );
  const villages = usePublicList<LocationItem>(
    "locations",
    { parent: picked.cell },
    Boolean(picked.cell),
  );
  const lists = {
    province: provinces,
    district: districts,
    sector: sectors,
    cell: cells,
    village: villages,
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
    if (level === "village") save({ location: { village_code: code } });
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoMessage(t("facilityApplication.location.geoUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        if (!insideRwanda(c.latitude, c.longitude)) {
          setGeoMessage(t("facilityApplication.location.outsideRwanda"));
          return;
        }
        place(Number(c.latitude.toFixed(6)), Number(c.longitude.toFixed(6)));
        setGeoMessage(t("facilityApplication.location.saved"));
      },
      () => setGeoMessage(t("facilityApplication.location.geoDenied")),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  /** The pin from the GPS, the map or the typed fields. */
  function place(lat: number, lng: number) {
    setCoords({ lat, lng });
    setTyped({ lat: String(lat), lng: String(lng) });
    setTypedError(undefined);
    save({ location: { latitude: lat, longitude: lng } });
  }

  function typeCoordinate(key: "lat" | "lng", value: string) {
    const next = { ...typed, [key]: value };
    setTyped(next);
    const lat = Number(next.lat.replace(",", "."));
    const lng = Number(next.lng.replace(",", "."));
    if (!next.lat.trim() || !next.lng.trim() || Number.isNaN(lat) || Number.isNaN(lng)) return;
    if (!insideRwanda(lat, lng)) {
      setTypedError(t("facilityApplication.location.outsideRwanda"));
      return;
    }
    setTypedError(undefined);
    setCoords({ lat, lng });
    save({ location: { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) } });
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={(e) => e.preventDefault()}>
      {LEVELS.map((level, index) => {
        const parentLevel = LEVELS[index - 1];
        if (parentLevel && !picked[parentLevel]) return null;
        const list = lists[level];
        return (
          <SelectField
            key={level}
            id={level === "village" ? "location.village_code" : `location.${level}`}
            label={t(`facilityApplication.location.${level}`)}
            value={picked[level] ?? ""}
            onChange={(e) => pick(level, e.target.value)}
            disabled={list.isPending}
          >
            <option value="">{t("facilityApplication.fields.choose")}</option>
            {list.data?.results.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </SelectField>
        );
      })}
      <TextField
        id="location.address"
        label={t("facilityApplication.location.address")}
        hint={t("facilityApplication.location.addressHint")}
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          save({ location: { address: e.target.value } });
        }}
      />
      <fieldset id="location.latitude" className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 p-0 font-semibold text-fg">
          {t("facilityApplication.location.pinTitle")}
        </legend>
        <p className="m-0 text-body-sm text-fg-secondary">
          {t("facilityApplication.location.pinHint")}
        </p>
        {pinMissing && (
          <p className="m-0 text-body-sm font-semibold text-danger" role="alert">
            {t("facilityApplication.location.pinRequired")}
          </p>
        )}
        {feedback("location.latitude") && (
          <Alert tone="warning">{feedback("location.latitude")}</Alert>
        )}
        <div>
          <Button
            variant="secondary"
            iconStart={<MapPin aria-hidden="true" />}
            onClick={useMyLocation}
          >
            {t("facilityApplication.location.useMine")}
          </Button>
        </div>
        {geoMessage && (
          <p className="m-0 text-body-sm font-semibold" role="status">
            {geoMessage}
          </p>
        )}
        <Suspense fallback={<div className="h-72 rounded-3xl bg-subtle" aria-hidden="true" />}>
          <LocationPicker
            value={
              coords.lat !== null && coords.lng !== null
                ? { lat: coords.lat, lng: coords.lng }
                : null
            }
            onChange={({ lat, lng }) => {
              setGeoMessage(undefined);
              place(lat, lng);
            }}
            tilesUrl={env.mapTilesUrl}
            attribution={t("facilityApplication.location.mapAttribution")}
            label={t("facilityApplication.location.mapLabel")}
            pinLabel={t("facilityApplication.location.pinLabel")}
          />
        </Suspense>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="location.latitude.value"
            label={t("facilityApplication.location.latitude")}
            hint={t("facilityApplication.location.latitudeHint")}
            inputMode="decimal"
            value={typed.lat}
            onChange={(e) => typeCoordinate("lat", e.target.value)}
            error={typedError}
          />
          <TextField
            id="location.longitude.value"
            label={t("facilityApplication.location.longitude")}
            hint={t("facilityApplication.location.longitudeHint")}
            inputMode="decimal"
            value={typed.lng}
            onChange={(e) => typeCoordinate("lng", e.target.value)}
          />
        </div>
      </fieldset>
    </form>
  );
}

export function AdminStep({ app, save }: { app: ApplicantApplication; save: Save }) {
  const { t } = useTranslation();
  const [admin, setAdmin] = useState(app.proposed_admin);
  const [position, setPosition] = useState(app.applicant.position);
  const [phone, setPhone] = useState(app.applicant.phone);
  const change =
    (key: keyof ApplicantApplication["proposed_admin"]) => (e: { target: { value: string } }) => {
      const value = e.target.value;
      setAdmin((v) => ({ ...v, [key]: value }));
      save({ proposed_admin: { [key]: value } });
    };
  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={(e) => e.preventDefault()}>
      <p className="m-0 text-fg-secondary">{t("facilityApplication.admin.intro")}</p>
      <TextField
        id="proposed_admin.name"
        label={t("facilityApplication.admin.name")}
        autoComplete="off"
        value={admin.name}
        onChange={change("name")}
      />
      <TextField
        id="proposed_admin.email"
        label={t("facilityApplication.admin.email")}
        type="email"
        autoComplete="off"
        value={admin.email}
        onChange={change("email")}
      />
      <TextField
        id="proposed_admin.phone"
        label={t("facilityApplication.admin.phone")}
        type="tel"
        autoComplete="off"
        value={admin.phone}
        onChange={change("phone")}
      />
      <TextField
        id="applicant.phone"
        label={t("facilityApplication.fields.yourPhone")}
        type="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          save({ applicant: { phone: e.target.value } });
        }}
      />
      <TextField
        id="applicant.position"
        label={t("facilityApplication.fields.position")}
        value={position}
        onChange={(e) => {
          setPosition(e.target.value);
          save({ applicant: { position: e.target.value } });
        }}
      />
    </form>
  );
}

export function useUploadLabels(): FileUploadLabels {
  const { t } = useTranslation();
  return {
    drop: t("facilityApplication.upload.drop"),
    browse: t("facilityApplication.upload.browse"),
    camera: t("facilityApplication.upload.camera"),
    hint: t("facilityApplication.upload.hint"),
    retry: t("facilityApplication.upload.retry"),
    remove: t("facilityApplication.upload.remove"),
    status: {
      uploading: t("facilityApplication.upload.status.uploading"),
      pending: t("facilityApplication.upload.status.pending"),
      clean: t("facilityApplication.upload.status.clean"),
      infected: t("facilityApplication.upload.status.infected"),
      rejected: t("facilityApplication.upload.status.rejected"),
      failed: t("facilityApplication.upload.status.failed"),
      error: t("facilityApplication.upload.status.error"),
    },
    tooLarge: t("facilityApplication.upload.tooLarge"),
    wrongType: t("facilityApplication.upload.wrongType"),
  };
}

interface Uploading {
  id: string;
  kind: DocumentKind;
  file: File;
  progress: number;
  error?: string;
}

function DocumentSlot({
  app,
  kind,
  required,
  insurerCode,
}: {
  app: ApplicantApplication;
  kind: DocumentKind;
  required: boolean;
  insurerCode?: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const labels = useUploadLabels();
  const needsNumber = kind === "moh_licence";
  const [number, setNumber] = useState("");
  const [expires, setExpires] = useState("");
  const [inFlight, setInFlight] = useState<Uploading[]>([]);
  const [error, setError] = useState<string | undefined>();
  const docs = app.documents.filter(
    (d) => d.kind === kind && (!insurerCode || d.insurer_code === insurerCode),
  );
  const missing = app.missing_for_submit.includes(`documents.${kind}`);

  async function upload(item: Uploading) {
    setInFlight((list) => [...list.filter((i) => i.id !== item.id), { ...item, progress: 0 }]);
    try {
      await api.onboarding.applicant.uploadDocument(
        app.id,
        item.file,
        {
          kind,
          ...(insurerCode ? { insurer_code: insurerCode } : {}),
          ...(number ? { number } : {}),
          ...(expires ? { expires_on: expires } : {}),
        },
        {
          idempotencyKey: item.id,
          onProgress: (progress) =>
            setInFlight((list) => list.map((i) => (i.id === item.id ? { ...i, progress } : i))),
        },
      );
      setInFlight((list) => list.filter((i) => i.id !== item.id));
      await queryClient.invalidateQueries({ queryKey: applicationKey(app.id) });
    } catch (failure) {
      const message = isApiError(failure)
        ? (failure.fieldError("file") ?? failure.message)
        : t("errors.generic");
      setInFlight((list) => list.map((i) => (i.id === item.id ? { ...i, error: message } : i)));
    }
  }

  async function remove(documentId: string) {
    try {
      await api.onboarding.applicant.deleteDocument(app.id, documentId);
      await queryClient.invalidateQueries({ queryKey: applicationKey(app.id) });
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : t("errors.generic"));
    }
  }

  const items: FileUploadItem[] = [
    ...docs.map((d) => ({
      id: d.id,
      name: d.number ? `${d.upload.original_filename} · ${d.number}` : d.upload.original_filename,
      status: d.upload.status,
      ...(d.review_status === "needs_change" && d.review_comment
        ? { error: d.review_comment }
        : {}),
    })),
    ...inFlight.map((i) => ({
      id: i.id,
      name: i.file.name,
      progress: i.progress,
      status: i.error ? ("error" as const) : ("uploading" as const),
      ...(i.error ? { error: i.error } : {}),
    })),
  ];

  const title = insurerCode
    ? t("facilityApplication.documents.insurerContract", { insurer: insurerCode })
    : t(`facilityApplication.documents.kinds.${kind}`);
  return (
    <section
      id={`documents.${kind}`}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
    >
      {needsNumber && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t("facilityApplication.documents.number")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <TextField
            label={t("facilityApplication.documents.expires")}
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </div>
      )}
      <FileUpload
        label={
          <>
            {title}
            {!required && (
              <span className="font-normal text-fg-muted">
                {" "}
                {t("facilityApplication.fields.optionalSuffix")}
              </span>
            )}
          </>
        }
        labels={
          kind === "facility_photo"
            ? { ...labels, hint: t("facilityApplication.upload.photoHint") }
            : labels
        }
        items={items}
        accept={kind === "facility_photo" ? PHOTO_ACCEPT : UPLOAD_ACCEPT}
        maxBytes={UPLOAD_MAX_BYTES}
        error={
          missing && needsNumber && docs.length > 0
            ? t("facilityApplication.documents.numberRequired")
            : error
        }
        onFiles={(files) => {
          for (const file of files)
            void upload({ id: newIdempotencyKey(), kind, file, progress: 0 });
        }}
        onRetry={(id) => {
          const item = inFlight.find((i) => i.id === id);
          if (item) void upload({ id: item.id, kind: item.kind, file: item.file, progress: 0 });
        }}
        onRemove={(id) => {
          if (inFlight.some((i) => i.id === id))
            setInFlight((list) => list.filter((i) => i.id !== id));
          else void remove(id);
        }}
      />
    </section>
  );
}

export function DocumentsStep({ app }: { app: ApplicantApplication }) {
  const { t } = useTranslation();
  const insurers = usePublicList("insurers");
  const save = useInsurerSave(app);
  const required: DocumentKind[] =
    app.facility.ownership === "public"
      ? ["moh_licence"]
      : ["moh_licence", "rdb_registration", "tin_certificate"];
  const optional: DocumentKind[] = ["accreditation", "other"];
  return (
    <div className="flex flex-col gap-6">
      {!app.facility.ownership && (
        <Alert tone="info">{t("facilityApplication.documents.chooseOwnership")}</Alert>
      )}
      <p className="m-0 text-fg-secondary">{t("facilityApplication.documents.intro")}</p>
      {required.map((kind) => (
        <DocumentSlot key={kind} app={app} kind={kind} required />
      ))}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
        <legend className="px-1 font-semibold">
          {t("facilityApplication.documents.insurers")}
        </legend>
        <p className="m-0 text-body-sm text-fg-secondary">
          {t("facilityApplication.documents.insurersHint")}
        </p>
        {insurers.data?.results.map((insurer) => (
          <CheckboxField
            key={String(insurer.code)}
            label={String(insurer.name)}
            checked={app.claimed_insurer_codes.includes(String(insurer.code))}
            onChange={(e) => save(String(insurer.code), e.target.checked)}
          />
        ))}
      </fieldset>
      {app.claimed_insurer_codes.map((code) => (
        <DocumentSlot
          key={code}
          app={app}
          kind="insurer_contract"
          insurerCode={code}
          required={false}
        />
      ))}
      {optional.map((kind) => (
        <DocumentSlot key={kind} app={app} kind={kind} required={false} />
      ))}
      <section className="flex flex-col gap-2">
        <h3 className="m-0 font-heading text-h4 font-bold">
          {t("facilityApplication.documents.photosTitle")}
        </h3>
        <p className="m-0 text-body-sm text-fg-secondary">
          {t("facilityApplication.documents.photosHint", {
            count: MAX_PHOTOS,
            left: Math.max(
              0,
              MAX_PHOTOS - app.documents.filter((d) => d.kind === "facility_photo").length,
            ),
          })}
        </p>
        <DocumentSlot app={app} kind="facility_photo" required={false} />
      </section>
    </div>
  );
}

function useInsurerSave(app: ApplicantApplication) {
  const api = useApi();
  const queryClient = useQueryClient();
  return (code: string, checked: boolean) => {
    const codes = checked
      ? [...new Set([...app.claimed_insurer_codes, code])]
      : app.claimed_insurer_codes.filter((c) => c !== code);
    void api.onboarding.applicant
      .update(app.id, { version: app.version, claimed_insurer_codes: codes })
      .then((saved) => queryClient.setQueryData(applicationKey(app.id), saved))
      .catch(() => void queryClient.invalidateQueries({ queryKey: applicationKey(app.id) }));
  };
}
