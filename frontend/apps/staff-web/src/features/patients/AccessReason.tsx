import { isApiError, type AccessReasonCode } from "@medilink/api-client";
import { Alert, Button, Card, SelectField, TextareaField } from "@medilink/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { actionError, fieldErrors } from "./shared";

const CODES: AccessReasonCode[] = ["care_continuity", "results_review", "admin_request", "other"];
const MAX_TEXT = 200;

/** ST5/ST13 answer `403 access_reason_required` outside a care relationship (R2, FR-SEC-03). */
export function isAccessReasonRequired(error: unknown): boolean {
  return isApiError(error) && error.code === "access_reason_required";
}

/**
 * Asks why the record is opened (security 04 §3), sends it to ST28, then reloads the record and
 * health profile. The reason is audited and lasts a short time in this staff session.
 */
export function AccessReasonPrompt({ fpId }: { fpId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [code, setCode] = useState<AccessReasonCode>("care_continuity");
  const [text, setText] = useState("");
  const give = useMutation({
    mutationFn: () =>
      api.patients.giveAccessReason(fpId, {
        reason_code: code,
        ...(text.trim() ? { reason_text: text.trim() } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patients", "record", fpId] }),
        queryClient.invalidateQueries({ queryKey: ["patients", "health", fpId] }),
      ]);
    },
  });
  const errors = fieldErrors(give.error);
  const missingText = code === "other" && !text.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!missingText) give.mutate();
  };
  return (
    <Card as="section" aria-labelledby="access-reason" padding="md" className="max-w-xl">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <h2 id="access-reason" className="m-0 text-h3">
          {t("patients.accessReason.title")}
        </h2>
        <p className="m-0 text-fg-secondary">{t("patients.accessReason.description")}</p>
        <SelectField
          label={t("patients.accessReason.reason")}
          value={code}
          onChange={(e) => setCode(e.target.value as AccessReasonCode)}
          error={errors.reason_code}
        >
          {CODES.map((c) => (
            <option key={c} value={c}>
              {t(`patients.accessReason.reasons.${c}`)}
            </option>
          ))}
        </SelectField>
        {code === "other" && (
          <TextareaField
            label={t("patients.accessReason.reasonText")}
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            error={errors.reason_text}
          />
        )}
        {give.isError && !errors.reason_code && !errors.reason_text && (
          <Alert tone="danger" role="alert">
            {actionError(give.error, t("errors.generic"))}
          </Alert>
        )}
        <Button type="submit" className="self-start" disabled={missingText || give.isPending}>
          {t("patients.accessReason.open")}
        </Button>
      </form>
    </Card>
  );
}
