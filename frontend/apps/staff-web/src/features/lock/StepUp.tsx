import { isApiError } from "@medilink/api-client";
import { Alert, Button, Dialog, PasswordField, TextField } from "@medilink/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { staffMeKey } from "../../auth/queries";

/** Thrown when the user closes the step-up dialog: the action stays undone. */
export class StepUpCancelled extends Error {
  constructor() {
    super("Step-up cancelled");
    this.name = "StepUpCancelled";
  }
}

export function isStepUpCancelled(error: unknown): boolean {
  return error instanceof StepUpCancelled;
}

interface StepUpContextValue {
  /**
   * Run a sensitive action. On `403 step_up_required` the step-up dialog opens; after the user
   * confirms, the action runs once more. Keep the Idempotency-Key outside `action` so the retry
   * reuses it (contract §6.1).
   */
  withStepUp: <T>(action: () => Promise<T>) => Promise<T>;
}

const StepUpContext = createContext<StepUpContextValue | null>(null);

export function useStepUp(): StepUpContextValue {
  const value = useContext(StepUpContext);
  if (!value) throw new Error("useStepUp must be used inside <StepUpProvider>");
  return value;
}

interface Pending {
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const pending = useRef<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setPassword("");
        setCode("");
        setError(undefined);
        setOpen(true);
      }),
    [],
  );

  const withStepUp = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (failure) {
        if (!isApiError(failure) || failure.code !== "step_up_required") throw failure;
        await ask();
        return action();
      }
    },
    [ask],
  );

  function close(cancelled: boolean) {
    setOpen(false);
    if (cancelled) pending.current?.reject(new StepUpCancelled());
    pending.current = null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || !code) {
      setError(t("lock.stepUp.required"));
      return;
    }
    setBusy(true);
    try {
      await api.security.stepUp({ password, code: code.replace(/\s+/g, "") });
      void queryClient.invalidateQueries({ queryKey: staffMeKey });
      const current = pending.current;
      close(false);
      current?.resolve();
    } catch (failure) {
      if (isApiError(failure) && failure.status === 401) {
        close(true);
        void queryClient.resetQueries({ queryKey: staffMeKey });
        return;
      }
      setError(isApiError(failure) ? failure.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo(() => ({ withStepUp }), [withStepUp]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => !next && close(true)}
        title={t("lock.stepUp.title")}
        description={t("lock.stepUp.description")}
        closeLabel={t("lock.close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(true)}>
              {t("lock.cancel")}
            </Button>
            <Button type="submit" form="step-up-form" loading={busy}>
              {t("lock.stepUp.confirm")}
            </Button>
          </>
        }
      >
        <form
          id="step-up-form"
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <PasswordField
            label={t("lock.stepUp.password")}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label={t("lock.stepUp.code")}
            hint={t("lock.stepUp.codeHint")}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          )}
        </form>
      </Dialog>
    </StepUpContext.Provider>
  );
}
