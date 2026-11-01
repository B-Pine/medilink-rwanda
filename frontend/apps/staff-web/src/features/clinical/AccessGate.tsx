import type { AccessReasonCode } from "@medilink/api-client";
import { Alert, Button, Card, LoadingState, SelectField, TextareaField } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { clinicalKeys, errorText } from "./shared";

const CODES: AccessReasonCode[] = ["care_continuity", "results_review", "admin_request", "other"];
const MAX_TEXT = 300;

/**
 * Reason for access (security 04 §3, contract A1): shown instead of the record when the patient
 * is not in the clinician's care, or works here. Same pattern as the S3 record prompt; the reason
 * is logged and opens this patient's clinical record for 120 minutes.
 */
export function AccessReasonPrompt({ fpId, onGranted }: { fpId: string; onGranted?: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const headingId = useId();
  const [code, setCode] = useState<AccessReasonCode>("care_continuity");
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const give = useMutation({
    mutationFn: () =>
      api.clinical.giveReason(fpId, {
        reason_code: code,
        ...(text.trim() ? { reason_text: text.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clinicalKeys.all });
      onGranted?.();
    },
  });
  const missingText = code === "other" && !text.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!missingText) give.mutate();
  };
  return (
    <Card as="section" aria-labelledby={headingId} padding="md" className="max-w-xl">
      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <h2 id={headingId} className="m-0 text-h3">
          {t("clinical.access.title")}
        </h2>
        <p className="m-0 text-fg-secondary">{t("clinical.access.description")}</p>
        <SelectField
          label={t("clinical.access.reason")}
          value={code}
          onChange={(e) => setCode(e.target.value as AccessReasonCode)}
        >
          {CODES.map((c) => (
            <option key={c} value={c}>
              {t(`clinical.access.reasons.${c}`)}
            </option>
          ))}
        </SelectField>
        {code === "other" && (
          <TextareaField
            label={t("clinical.access.reasonText")}
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            error={tried && missingText ? t("clinical.access.textRequired") : undefined}
          />
        )}
        {give.isError && (
          <Alert tone="danger" role="alert">
            {errorText(give.error, t("errors.generic"))}
          </Alert>
        )}
        <Button type="submit" className="self-start" disabled={give.isPending}>
          {t("clinical.access.open")}
        </Button>
      </form>
    </Card>
  );
}

/** Renders children only when the clinician may read this patient's record (A2). */
export function AccessGate({ fpId, children }: { fpId: string; children: ReactNode }) {
  const { t } = useTranslation();
  const api = useApi();
  const access = useQuery({
    queryKey: clinicalKeys.access(fpId),
    queryFn: () => api.clinical.access(fpId),
  });
  if (access.isPending) return <LoadingState label={t("clinical.loading")} />;
  if (access.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(access.error, t("errors.generic"))}
      </Alert>
    );
  if (access.data.reason_required) return <AccessReasonPrompt fpId={fpId} />;
  return <>{children}</>;
}
