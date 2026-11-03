import type { ClinicianPublicProfile } from "@medilink/api-client";
import {
  Alert,
  Button,
  cx,
  SwitchField,
  Tabs,
  TabsList,
  TabsTrigger,
  TextareaField,
} from "@medilink/ui";
import { Eye, Globe } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { errorText } from "./shared";

type Lang = "rw" | "en" | "fr";
const LANGS: Lang[] = ["rw", "en", "fr"];
const SPOKEN: ClinicianPublicProfile["languages"] = ["rw", "en", "fr", "sw"];
const MAX = 600;
const key = ["setup", "clinician", "public"] as const;

function Form({ profile }: { profile: ClinicianPublicProfile }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [lang, setLang] = useState<Lang>("en");
  const [bio, setBio] = useState(profile.bio_i18n);
  const [languages, setLanguages] = useState(profile.languages);
  const [isPublic, setIsPublic] = useState(profile.is_public);
  const save = useMutation({
    mutationFn: () =>
      api.setup.updateClinicianPublicProfile({ bio_i18n: bio, languages, is_public: isPublic }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  const toggle = (code: (typeof SPOKEN)[number]) =>
    setLanguages(
      languages.includes(code) ? languages.filter((l) => l !== code) : [...languages, code],
    );
  const preview = bio[lang] || bio.en || bio.rw || bio.fr || "";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <SwitchField
          label={t("setup.publicProfile.visible")}
          hint={t("setup.publicProfile.visibleHint")}
          checked={isPublic}
          stateLabel={isPublic ? t("setup.publicProfile.on") : t("setup.publicProfile.off")}
          onCheckedChange={setIsPublic}
        />
        <div className="flex flex-col gap-2">
          <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <TabsList aria-label={t("setup.publicProfile.bioLanguage")}>
              {LANGS.map((code) => (
                <TabsTrigger key={code} value={code}>
                  {t(`language.names.${code}`, { ns: "ui" })}
                  {bio[code]?.trim() ? (
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <TextareaField
            label={t("setup.publicProfile.bio")}
            hint={t("setup.publicProfile.bioHint", { count: MAX - (bio[lang]?.length ?? 0) })}
            rows={5}
            maxLength={MAX}
            lang={lang}
            value={bio[lang] ?? ""}
            onChange={(e) => setBio({ ...bio, [lang]: e.target.value })}
          />
        </div>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 font-semibold">{t("setup.publicProfile.languages")}</legend>
          <div className="flex flex-wrap gap-2">
            {SPOKEN.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={languages.includes(code)}
                onClick={() => toggle(code)}
                className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg-secondary transition-colors hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
              >
                {t(`setup.publicProfile.spoken.${code}`)}
              </button>
            ))}
          </div>
        </fieldset>
        {save.isSuccess && (
          <Alert tone="success" role="status">
            {t("setup.saved")}
          </Alert>
        )}
        {save.isError && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
        <div className="flex justify-end">
          <Button type="submit" pill loading={save.isPending}>
            {t("setup.save")}
          </Button>
        </div>
      </form>
      <aside
        aria-label={t("setup.publicProfile.preview")}
        className={cx(
          "flex flex-col gap-3 self-start rounded-2xl p-5 ring-1 ring-border",
          isPublic ? "bg-page" : "bg-subtle opacity-70",
        )}
      >
        <span className="inline-flex items-center gap-1.5 text-caption font-semibold tracking-wide text-fg-secondary uppercase">
          <Eye aria-hidden="true" className="size-4" />
          {t("setup.publicProfile.preview")}
        </span>
        {profile.specialty && <span className="font-semibold">{profile.specialty}</span>}
        <p className="m-0 text-body-sm whitespace-pre-line text-fg">
          {preview || t("setup.publicProfile.noBio")}
        </p>
        {languages.length > 0 && (
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-body-sm text-fg-secondary">
            <Globe aria-hidden="true" className="size-4" />
            {languages.map((code) => t(`setup.publicProfile.spoken.${code}`)).join(" · ")}
          </p>
        )}
        {!isPublic && (
          <p className="m-0 text-caption text-fg-muted">{t("setup.publicProfile.hidden")}</p>
        )}
      </aside>
    </div>
  );
}

/** upgrade 05 §3: what patients read about me on the public doctor page. */
export function PublicProfileCard() {
  const { t } = useTranslation();
  const api = useApi();
  const profile = useQuery({ queryKey: key, queryFn: () => api.setup.clinicianPublicProfile() });
  return (
    <section
      aria-labelledby="public-profile"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <h2 id="public-profile" className="m-0 font-heading text-h3 tracking-tight">
          {t("setup.publicProfile.title")}
        </h2>
        <p className="m-0 text-body-sm text-fg-secondary">{t("setup.publicProfile.intro")}</p>
      </div>
      {profile.isPending ? null : profile.isError ? (
        <p className="m-0 text-body-sm text-fg-muted">{t("setup.publicProfile.needLicence")}</p>
      ) : (
        <Form profile={profile.data} />
      )}
    </section>
  );
}
