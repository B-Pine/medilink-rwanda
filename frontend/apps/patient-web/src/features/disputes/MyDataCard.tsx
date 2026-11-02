import { isApiError, saveFile } from "@medilink/api-client";
import { Alert, Button, Card, TextField } from "@medilink/ui";
import { DownloadSimple } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

/**
 * Settings card (S10c-F4, FR-SEC-12): download everything MediLink holds about me and my family
 * profiles as one JSON file, after confirming my password. Corrections go through a dispute.
 */
export function MyDataCard() {
  const { t } = useTranslation();
  const api = useApi();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const exportData = useMutation({
    mutationFn: () => api.reports.patient.exportMyData(password),
    onSuccess: (file) => {
      saveFile(file);
      setPassword("");
      setDone(true);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) exportData.mutate();
  };
  const wrong = isApiError(exportData.error) && exportData.error.status === 400;
  return (
    <Card as="section" aria-labelledby="settings-my-data" className="flex flex-col gap-3">
      <h2 id="settings-my-data" className="m-0 text-h3">
        {t("disputes.myData.title")}
      </h2>
      <p className="m-0 text-fg-secondary">{t("disputes.myData.body")}</p>
      <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <TextField
          type="password"
          autoComplete="current-password"
          label={t("disputes.myData.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={wrong ? t("disputes.myData.wrong") : undefined}
          className="min-w-56 flex-1"
        />
        <Button
          type="submit"
          variant="secondary"
          loading={exportData.isPending}
          disabled={!password}
        >
          <DownloadSimple aria-hidden="true" className="size-icon" />
          {t("disputes.myData.download")}
        </Button>
      </form>
      {exportData.isError && !wrong && (
        <Alert tone="danger" role="alert">
          {t("disputes.failed")}
        </Alert>
      )}
      {done && (
        <p role="status" className="m-0 text-body-sm text-fg-muted">
          {t("disputes.myData.done")}
        </p>
      )}
    </Card>
  );
}
