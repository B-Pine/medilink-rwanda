import { isApiError, type StaffMe } from "@medilink/api-client";
import { Alert, Button, Logo, PasswordField, TextField } from "@medilink/ui";
import { LockKey } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi, useServices } from "../../app/services";
import { staffMeKey } from "../../auth/queries";

export const lockStateKey = ["staff", "lock"] as const;

export interface LockScreenProps {
  onUnlocked: (me: StaffMe) => void;
  /** The session ended (switch user, 5 failures): go to the login page. */
  onSignedOut: (reason: "switch" | "ended") => void;
}

/**
 * Lock screen (contract §6.1, design 05 §3): shows who is locked; PIN (numeric, paste allowed)
 * or "Use password instead"; "Not you? Switch user" signs out. The page behind keeps its state.
 */
export function LockScreen({ onUnlocked, onSignedOut }: LockScreenProps) {
  const { t } = useTranslation();
  const api = useApi();
  const { session } = useServices();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: lockStateKey,
    queryFn: ({ signal }) => api.security.lockState(signal),
    staleTime: 0,
  });
  const pinAvailable = state.data?.unlock_methods.includes("pin") ?? false;
  const [usePassword, setUsePassword] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const method = pinAvailable && !usePassword ? "pin" : "password";

  useEffect(() => inputRef.current?.focus(), [method]);

  const unlock = useMutation({
    mutationFn: () =>
      api.security.unlock(method === "pin" ? { pin: secret } : { password: secret }),
    onSuccess: (me) => {
      queryClient.setQueryData(staffMeKey, me);
      setSecret("");
      onUnlocked(me);
    },
    onError: (failure) => {
      setSecret("");
      if (isApiError(failure) && failure.status === 401) {
        session.markExpired();
        onSignedOut("ended");
        return;
      }
      if (isApiError(failure) && failure.status === 422) setUsePassword(true);
      setError(
        isApiError(failure) ? (failure.fieldError(method) ?? failure.message) : t("errors.generic"),
      );
      void state.refetch();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!secret) {
      setError(method === "pin" ? t("lock.screen.pinRequired") : t("lock.screen.passwordRequired"));
      return;
    }
    setError(undefined);
    unlock.mutate();
  }

  const attempts = state.data?.attempts_remaining;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-page p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-border bg-surface p-6 shadow-lg">
        <Logo className="h-8 self-start" />
        <div className="flex items-center gap-3">
          <LockKey aria-hidden="true" className="size-8 text-primary" />
          <div>
            <h1 id="lock-title" className="m-0 font-heading text-h2">
              {t("lock.screen.title")}
            </h1>
            {state.data && (
              <p className="m-0 text-fg-secondary">
                {t("lock.screen.who", { name: state.data.full_name })}
              </p>
            )}
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {method === "pin" ? (
            <TextField
              ref={inputRef}
              label={t("lock.screen.pin")}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={secret}
              onChange={(e) => setSecret(e.target.value.replace(/\D/g, ""))}
              error={error}
            />
          ) : (
            <PasswordField
              ref={inputRef}
              label={t("lock.screen.password")}
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              error={error}
            />
          )}
          {attempts !== undefined && attempts < 5 && (
            <p className="m-0 text-body-sm text-fg-secondary" aria-live="polite">
              {t("lock.screen.attempts", { count: attempts })}
            </p>
          )}
          <Button type="submit" size="lg" loading={unlock.isPending} fullWidth>
            {t("lock.screen.unlock")}
          </Button>
          {pinAvailable && (
            <Button
              variant="ghost"
              onClick={() => {
                setUsePassword((v) => !v);
                setSecret("");
                setError(undefined);
              }}
            >
              {usePassword ? t("lock.screen.usePin") : t("lock.screen.usePassword")}
            </Button>
          )}
        </form>
        <div className="border-t border-border pt-4">
          <Button variant="secondary" fullWidth onClick={() => onSignedOut("switch")}>
            {t("lock.screen.switchUser")}
          </Button>
        </div>
        {state.isError && (
          <Alert tone="danger" role="alert">
            {t("errors.generic")}
          </Alert>
        )}
      </div>
    </div>
  );
}
