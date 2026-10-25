import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./Button";

export interface MaskedValueLabels {
  reveal: string;
  hide: string;
  revealing: string;
  failed: string;
}

export interface MaskedValueProps {
  /** Masked form from the API, e.g. `••••5678`. */
  masked: string;
  /** Called when the user asks to see the value; resolves to the full value, or null if cancelled. */
  onReveal?: () => Promise<string | null>;
  labels: MaskedValueLabels;
  /** Accessible name of the value, e.g. "National ID". */
  name: string;
  /** Re-mask after this many milliseconds (default 30 s). */
  revealFor?: number;
}

/**
 * A masked identifier with an optional Reveal button (sprint-03 §6.3, design 08 privacy).
 * The revealed value lives only in this component's state: it re-masks after 30 s, on hide and on
 * unmount, and is never written to a cache.
 */
export function MaskedValue({
  masked,
  onReveal,
  labels,
  name,
  revealFor = 30_000,
}: MaskedValueProps) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue(null);
  };

  const reveal = async () => {
    if (!onReveal) return;
    setBusy(true);
    setFailed(false);
    try {
      const full = await onReveal();
      if (full) {
        setValue(full);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setValue(null), revealFor);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono tabular-nums" aria-label={`${name}: ${value ?? masked}`}>
        {value ?? masked}
      </span>
      {onReveal &&
        (value ? (
          <Button variant="ghost" onClick={hide} aria-label={`${labels.hide}: ${name}`}>
            <EyeSlash aria-hidden="true" />
            {labels.hide}
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => void reveal()}
            disabled={busy}
            aria-label={`${labels.reveal}: ${name}`}
          >
            <Eye aria-hidden="true" />
            {busy ? labels.revealing : labels.reveal}
          </Button>
        ))}
      {failed && (
        <span role="alert" className="text-body-sm text-danger">
          {labels.failed}
        </span>
      )}
    </span>
  );
}
