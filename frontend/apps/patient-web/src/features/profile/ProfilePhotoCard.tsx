import { Camera, Trash } from "@phosphor-icons/react";
import { isApiError, type PatientProfileDetail } from "@medilink/api-client";
import { Alert, Button } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { Avatar } from "../dashboard/kit";
import { errorText } from "./shared";

function photoError(error: unknown, fallback: string): string {
  // the file field says what is wrong (type, size); the general message only "check the fields"
  return (isApiError(error) && error.fieldError("file")) || errorText(error, fallback);
}

const ACCEPT = "image/jpeg,image/png,image/heic,image/heif";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Profile photo (decision 2026-11-05): shown to the patient, people they share the profile with,
 * and staff at facilities where they have a file. Optional and removable.
 */
export function ProfilePhotoCard({ profile }: { profile: PatientProfileDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);
  const id = profile.patient_id;
  const name = profile.preferred_name ?? profile.full_name;

  const link = useQuery({
    queryKey: ["profile", "photo", id],
    queryFn: () => api.profile.photoLink(id),
    enabled: Boolean(profile.has_photo),
    staleTime: 4 * 60_000, // links last 5 minutes
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["profile", "detail", id] });
    void queryClient.invalidateQueries({ queryKey: ["profile", "photo", id] });
  };
  const upload = useMutation({
    mutationFn: (file: File) => api.profile.uploadPhoto(id, file),
    onSuccess: refresh,
    onError: (e) => setError(photoError(e, t("profile.error"))),
  });
  const remove = useMutation({
    mutationFn: () => api.profile.removePhoto(id),
    onSuccess: refresh,
    onError: (e) => setError(photoError(e, t("profile.error"))),
  });

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t("profile.photo.tooBig"));
      return;
    }
    upload.mutate(file);
  };

  const url = profile.has_photo ? link.data?.url : undefined;
  return (
    <section
      aria-labelledby="profile-photo"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center"
    >
      {url ? (
        <img
          src={url}
          alt={t("profile.photo.alt", { name })}
          className="size-20 shrink-0 rounded-full object-cover ring-2 ring-brand/30"
        />
      ) : (
        <Avatar name={name} size="lg" className="size-20 text-h2" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 id="profile-photo" className="m-0 text-body font-bold">
          {t("profile.photo.title")}
        </h2>
        <p id={hintId} className="m-0 text-body-sm text-fg-secondary">
          {t("profile.photo.who")}
        </p>
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            // the button below opens it; hidden, so it is not a second, unlabelled control
            hidden
            aria-label={t("profile.photo.add")}
            aria-describedby={hintId}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <Camera aria-hidden="true" className="size-4" />
            {profile.has_photo ? t("profile.photo.change") : t("profile.photo.add")}
          </Button>
          {profile.has_photo && (
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash aria-hidden="true" className="size-4" />
              {t("profile.photo.remove")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
