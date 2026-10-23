import { isApiError } from "@medilink/api-client";
import { Alert, Button, Card, TextField } from "@medilink/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi, useServices } from "../../app/services";
import { staffMeKey, useStaffMe } from "../../auth/queries";
import { PageHeading } from "../../components/PageHeading";
import { isStepUpCancelled, useStepUp } from "./StepUp";

/** /account/security: set, change or remove the unlock PIN (setting needs step-up); lock now. */
export function SecurityPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { lock } = useServices();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const { data: me } = useStaffMe();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const pinSet = me?.security.pin_set ?? false;

  const save = useMutation({
    mutationFn: () => withStepUp(() => api.security.setPin(pin)),
    onSuccess: () => {
      setPin("");
      setError(undefined);
      setNotice(t("lock.security.pinSaved"));
      void queryClient.invalidateQueries({ queryKey: staffMeKey });
    },
    onError: (failure) => {
      if (isStepUpCancelled(failure)) return;
      setNotice(undefined);
      setError(
        isApiError(failure) ? (failure.fieldError("pin") ?? failure.message) : t("errors.generic"),
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => api.security.removePin(),
    onSuccess: () => {
      setNotice(t("lock.security.pinRemoved"));
      void queryClient.invalidateQueries({ queryKey: staffMeKey });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError(t("lock.security.pinFormat"));
      return;
    }
    save.mutate();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeading title={t("lock.security.title")}>{t("lock.security.title")}</PageHeading>
      {notice && (
        <Alert tone="success" role="status">
          {notice}
        </Alert>
      )}
      <Card className="flex flex-col gap-4">
        <h2 className="m-0 font-heading text-h3">{t("lock.security.pinTitle")}</h2>
        <p className="m-0 text-fg-secondary">
          {pinSet ? t("lock.security.pinIsSet") : t("lock.security.pinNotSet")}
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <TextField
            label={pinSet ? t("lock.security.newPin") : t("lock.security.pin")}
            hint={t("lock.security.pinHint")}
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            error={error}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending}>
              {pinSet ? t("lock.security.changePin") : t("lock.security.setPin")}
            </Button>
            {pinSet && (
              <Button
                variant="secondary"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t("lock.security.removePin")}
              </Button>
            )}
          </div>
        </form>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 font-heading text-h3">{t("lock.security.lockTitle")}</h2>
        <p className="m-0 text-fg-secondary">
          {t("lock.security.lockBody", {
            minutes: Math.round((me?.security.lock_after_seconds ?? 900) / 60),
          })}
        </p>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              lock.setLocked(true);
              void api.security.lock().catch(() => undefined);
            }}
          >
            {t("lock.lockNow")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
