import { isApiError, type DocumentKind, type PlatformApplication } from "@medilink/api-client";
import { Alert, Button, SelectField, TextField } from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

const KINDS: DocumentKind[] = [
  "moh_licence",
  "rdb_registration",
  "tin_certificate",
  "accreditation",
  "insurer_contract",
  "facility_photo",
  "other",
];

/**
 * The super admin adds a document for the facility (a licence brought to a visit, a photo taken
 * there) while the application is a draft or changes are requested. Files are virus-checked.
 */
export function AdminDocumentUpload({ app }: { app: PlatformApplication }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>("moh_licence");
  const [number, setNumber] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();

  async function send(file: File) {
    setBusy(true);
    setMessage(undefined);
    try {
      await api.onboarding.platform.uploadDocument(app.id, file, {
        kind,
        ...(number ? { number } : {}),
        ...(expires ? { expires_on: expires } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["platform", "application", app.id] });
      setMessage({ tone: "success", text: t("platform.form.uploaded", { name: file.name }) });
      setNumber("");
      setExpires("");
    } catch (failure) {
      setMessage({
        tone: "danger",
        text: isApiError(failure)
          ? (failure.fieldError("file") ?? failure.message)
          : t("errors.generic"),
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
      <h3 className="m-0 font-heading text-h4 font-bold">{t("platform.form.addDocument")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t("platform.form.documentKind")}
          value={kind}
          onChange={(e) => setKind(e.target.value as DocumentKind)}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`platform.documentKind.${k}`)}
            </option>
          ))}
        </SelectField>
        {kind === "moh_licence" && (
          <>
            <TextField
              label={t("platform.form.licenceNumber")}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <TextField
              label={t("platform.form.expires")}
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        aria-label={t("platform.form.chooseFile")}
        accept={
          kind === "facility_photo"
            ? "image/jpeg,image/png,image/heic,image/heif"
            : "application/pdf,image/jpeg,image/png,image/heic,image/heif"
        }
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <Button
        variant="secondary"
        className="self-start"
        loading={busy}
        onClick={() => input.current?.click()}
      >
        {t("platform.form.chooseFile")}
      </Button>
      {message && (
        <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </Alert>
      )}
    </div>
  );
}
