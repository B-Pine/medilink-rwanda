import { CheckCircle, Info, WarningCircle, X, type Icon } from "@phosphor-icons/react";
import { cx } from "@medilink/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export type ToastTone = "success" | "danger" | "info";

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** One follow-up, e.g. "View appointment". */
  action?: { label: string; to: string };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

/** Shows a short message after an action the server confirmed (or refused). Never before. */
export const useToast = () => useContext(ToastContext);

const ICON: Record<ToastTone, Icon> = { success: CheckCircle, danger: WarningCircle, info: Info };
const ICON_CLASS: Record<ToastTone, string> = {
  success: "text-brand",
  danger: "text-danger",
  info: "text-info",
};
const SHOW_MS = 6000;

function ToastCard({ toast, dismiss }: { toast: ToastItem; dismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const onClose = useCallback(() => dismiss(toast.id), [dismiss, toast.id]);
  const tone = toast.tone ?? "success";
  const ToneIcon = ICON[tone];
  const timer = useRef<number | undefined>(undefined);
  const start = useCallback(() => {
    timer.current = window.setTimeout(onClose, SHOW_MS);
  }, [onClose]);
  const stop = () => window.clearTimeout(timer.current);
  useEffect(() => {
    start();
    return () => window.clearTimeout(timer.current);
  }, [start]);
  return (
    // Pointer and focus only pause the timer; the link and close button inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      onMouseEnter={stop}
      onMouseLeave={start}
      onFocus={stop}
      onBlur={start}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-border bg-raised p-4 text-fg shadow-raised animate-rise"
    >
      <ToneIcon
        aria-hidden="true"
        weight="fill"
        className={cx("mt-0.5 size-6 shrink-0", ICON_CLASS[tone])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 font-semibold">{toast.title}</p>
        {toast.description && (
          <p className="m-0 text-body-sm text-fg-secondary">{toast.description}</p>
        )}
        {toast.action && (
          <Link
            to={toast.action.to}
            onClick={onClose}
            className="mt-1 self-start text-body-sm font-semibold text-link"
          >
            {toast.action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("dashboard.toast.close")}
        className="-m-1 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:bg-subtle hover:text-fg"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

/**
 * Toasts (upgrade 12 §8): bottom-right on wide screens, above the tab bar on phones. Announced
 * politely; each stays 6 s, longer while hovered or focused.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const push = useCallback((toast: ToastInput) => {
    next.current += 1;
    const id = next.current;
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
  }, []);
  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)),
    [],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <ol
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 m-0 flex list-none flex-col gap-2 p-0 md:inset-x-auto md:right-6 md:bottom-6 md:w-[24rem]"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}
