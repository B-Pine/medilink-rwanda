import {
  isApiError,
  PROFESSIONS,
  SPECIALTY_CODES,
  type ClinicianProfile,
  type ClinicianProfileInput,
  type Council,
  type Qualification,
  type Upload,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  FileUpload,
  SelectField,
  TextField,
  type FileUploadItem,
  type FileUploadLabels,
} from "@medilink/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { errorText, fieldErrors, formatDate, useLocale } from "./shared";

const COUNCILS: Council[] = ["rmdc", "ncnm", "npc", "rahpc", "other"];
const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/heic,image/heif";
const MAX_QUALIFICATIONS = 5;

function useUploadLabels(hint: string): FileUploadLabels {
  const { t } = useTranslation();
  return {
    drop: t("setup.upload.drop"),
    browse: t("setup.upload.browse"),
    camera: t("setup.upload.camera"),
    hint,
    retry: t("setup.upload.retry"),
    remove: t("setup.upload.remove"),
    status: {
      uploading: t("setup.upload.status.uploading"),
      pending: t("setup.upload.status.pending"),
      clean: t("setup.upload.status.clean"),
      infected: t("setup.upload.status.infected"),
      rejected: t("setup.upload.status.rejected"),
      failed: t("setup.upload.status.failed"),
      error: t("setup.upload.status.error"),
    },
    tooLarge: t("setup.upload.tooLarge"),
    wrongType: t("setup.upload.wrongType"),
  };
}

/** One file of a purpose: uploaded, then polled until the virus scan is done. */
function useScannedUpload(purpose: "clinician_licence" | "clinician_photo") {
  const api = useApi();
  const { t } = useTranslation();
  const [item, setItem] = useState<FileUploadItem | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);

  async function send(file: File) {
    const id = crypto.randomUUID();
    setUpload(null);
    setItem({ id, name: file.name, status: "uploading", progress: 0 });
    try {
      let next = await api.uploads.staff.upload(purpose, file, {
        onProgress: (progress) => setItem((i) => (i ? { ...i, progress } : i)),
      });
      for (let i = 0; i < 20 && next.status === "pending"; i += 1) {
        setItem({ id, name: file.name, status: "pending" });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        next = await api.uploads.staff.get(next.id);
      }
      setItem({ id, name: file.name, status: next.status });
      if (next.status === "clean") setUpload(next);
    } catch (failure) {
      const message = isApiError(failure)
        ? (failure.fieldError("file") ?? failure.message)
        : t("setup.failed");
      setItem({ id, name: file.name, status: "error", error: message });
    }
  }

  return {
    item,
    upload,
    send,
    clear: () => {
      setItem(null);
      setUpload(null);
    },
  };
}

/**
 * My clinician profile (2026-11-03): what the facility admin checks before attesting, and what
 * the government counts by. A new licence number, council or scan needs a new attestation.
 */
export function ClinicianProfileForm({ profile }: { profile: ClinicianProfile }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    council: profile.council,
    licence_number: profile.licence_number,
    licence_valid_until: profile.licence_valid_until ?? "",
    profession: profile.profession ?? "",
    specialty_code: profile.specialty_code ?? "",
    sex: profile.sex ?? "",
  });
  const [qualifications, setQualifications] = useState<Qualification[]>(
    profile.qualifications ?? [],
  );
  const licence = useScannedUpload("clinician_licence");
  const photo = useScannedUpload("clinician_photo");
  const documentLabels = useUploadLabels(t("setup.clinician.scanHint"));
  const photoLabels = useUploadLabels(t("setup.clinician.photoHint"));

  const reattest =
    form.council !== profile.council ||
    form.licence_number !== profile.licence_number ||
    licence.upload !== null;
  const save = useMutation({
    mutationFn: () => {
      const body: Partial<ClinicianProfileInput> = {
        ...form,
        licence_valid_until: form.licence_valid_until || null,
        qualifications: qualifications.filter((q) => q.degree.trim() && q.institution.trim()),
      };
      if (licence.upload) body.licence_upload_id = licence.upload.id;
      if (photo.upload) body.photo_upload_id = photo.upload.id;
      return api.setup.updateClinicianProfile(body);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["setup", "clinician"], data);
      licence.clear();
      photo.clear();
    },
  });
  const errors = fieldErrors(save.error);
  const busy =
    licence.item?.status === "uploading" ||
    licence.item?.status === "pending" ||
    photo.item?.status === "uploading" ||
    photo.item?.status === "pending";
  const set =
    <K extends keyof typeof form>(key: K) =>
    (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value as (typeof form)[K] }));

  const fileItems = (current: ClinicianProfile["licence_file"], pending: FileUploadItem | null) =>
    pending
      ? [pending]
      : current
        ? [
            {
              id: current.id,
              name: current.original_filename,
              status: current.status as FileUploadItem["status"],
            },
          ]
        : [];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex max-w-3xl flex-col gap-6 rounded-2xl bg-surface p-5 shadow-card"
    >
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 p-0 font-heading text-h4 font-bold">
          {t("setup.clinician.professionTitle")}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("setup.clinician.profession")}
            value={form.profession}
            onChange={set("profession")}
            error={errors.profession}
          >
            <option value="">{t("setup.staff.notSet")}</option>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {t(`setup.professions.${p}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("setup.clinician.specialty")}
            value={form.specialty_code}
            onChange={set("specialty_code")}
            error={errors.specialty_code}
          >
            <option value="">{t("setup.staff.notSet")}</option>
            {SPECIALTY_CODES.map((s) => (
              <option key={s} value={s}>
                {t(`setup.specialties.${s}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("setup.clinician.sex")}
            value={form.sex}
            onChange={set("sex")}
            error={errors.sex}
          >
            <option value="">{t("setup.staff.notSet")}</option>
            <option value="female">{t("setup.clinician.female")}</option>
            <option value="male">{t("setup.clinician.male")}</option>
          </SelectField>
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 flex flex-wrap items-center gap-2 p-0 font-heading text-h4 font-bold">
          {t("setup.clinician.licenceTitle")}
          {profile.licence_state && (
            <Badge
              tone={
                profile.licence_state === "valid"
                  ? "success"
                  : profile.licence_state === "expiring"
                    ? "warning"
                    : profile.licence_state === "expired"
                      ? "danger"
                      : "neutral"
              }
            >
              {t(`setup.licenceState.${profile.licence_state}`)}
            </Badge>
          )}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("setup.clinician.council")}
            value={form.council}
            onChange={set("council")}
          >
            {COUNCILS.map((c) => (
              <option key={c} value={c}>
                {t(`setup.councils.${c}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t("setup.clinician.licence")}
            value={form.licence_number}
            onChange={set("licence_number")}
            error={errors.licence_number}
            inputClassName="font-mono"
          />
          <TextField
            label={t("setup.clinician.validUntil")}
            hint={
              profile.licence_valid_until
                ? t("setup.clinician.validUntilNow", {
                    date: formatDate(profile.licence_valid_until, locale),
                  })
                : t("setup.clinician.validUntilHint")
            }
            type="date"
            value={form.licence_valid_until}
            onChange={set("licence_valid_until")}
            error={errors.licence_valid_until}
          />
        </div>
        <FileUpload
          label={t("setup.clinician.scan")}
          labels={documentLabels}
          items={fileItems(profile.licence_file, licence.item)}
          accept={DOCUMENT_ACCEPT}
          maxBytes={10 * 1024 * 1024}
          allowCamera
          error={errors.licence_upload_id}
          onFiles={(files) => files[0] && void licence.send(files[0])}
          onRemove={() => licence.clear()}
        />
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 p-0 font-heading text-h4 font-bold">
          {t("setup.clinician.qualifications")}
        </legend>
        {qualifications.map((q, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
            <TextField
              label={t("setup.clinician.degree")}
              value={q.degree}
              onChange={(e) =>
                setQualifications((list) =>
                  list.map((x, i) => (i === index ? { ...x, degree: e.target.value } : x)),
                )
              }
            />
            <TextField
              label={t("setup.clinician.institution")}
              value={q.institution}
              onChange={(e) =>
                setQualifications((list) =>
                  list.map((x, i) => (i === index ? { ...x, institution: e.target.value } : x)),
                )
              }
            />
            <TextField
              label={t("setup.clinician.year")}
              inputMode="numeric"
              maxLength={4}
              value={String(q.year || "")}
              onChange={(e) =>
                setQualifications((list) =>
                  list.map((x, i) =>
                    i === index ? { ...x, year: Number(e.target.value.replace(/\D/g, "")) } : x,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              onClick={() => setQualifications((list) => list.filter((_, i) => i !== index))}
              aria-label={t("setup.clinician.removeQualification", {
                degree: q.degree || index + 1,
              })}
            >
              {t("setup.upload.remove")}
            </Button>
          </div>
        ))}
        {errors.qualifications && (
          <p className="m-0 text-body-sm text-danger">{errors.qualifications}</p>
        )}
        {qualifications.length < MAX_QUALIFICATIONS && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() =>
              setQualifications((list) => [...list, { degree: "", institution: "", year: 0 }])
            }
          >
            {t("setup.clinician.addQualification")}
          </Button>
        )}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 p-0 font-heading text-h4 font-bold">
          {t("setup.clinician.photo")}
        </legend>
        <FileUpload
          label={t("setup.clinician.photoLabel")}
          labels={photoLabels}
          items={fileItems(profile.photo_file ?? null, photo.item)}
          accept={PHOTO_ACCEPT}
          maxBytes={5 * 1024 * 1024}
          allowCamera
          error={errors.photo_upload_id}
          onFiles={(files) => files[0] && void photo.send(files[0])}
          onRemove={() => photo.clear()}
        />
      </fieldset>

      {reattest && <Alert tone="warning">{t("setup.clinician.reattest")}</Alert>}
      {save.isSuccess && (
        <Alert tone="success" role="status">
          {t("setup.saved")}
        </Alert>
      )}
      {save.isError && Object.keys(errors).length === 0 && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("setup.failed"))}
        </Alert>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending || busy}>
          {t("setup.save")}
        </Button>
      </div>
    </form>
  );
}
