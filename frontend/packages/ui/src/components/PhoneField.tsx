import type { ReactNode } from "react";

import { TextField, type TextFieldProps } from "./TextField";

/** `07…`, `7…`, `2507…` or `+2507…` → `+2507xxxxxxxx`; null when empty; "" when not a Rwandan mobile. */
export function toE164(value: string): string | null {
  const digits = value.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!digits) return null;
  let local = digits.startsWith("250") ? digits.slice(3) : digits;
  if (local.startsWith("0")) local = local.slice(1);
  return /^7\d{8}$/.test(local) ? `+250${local}` : "";
}

/** Display form: `+250 788 123 456`. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const local = e164.replace(/^\+250/, "");
  return `+250 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`.trim();
}

export interface PhoneFieldProps extends Omit<TextFieldProps, "type" | "inputMode" | "label"> {
  label: ReactNode;
}

/**
 * Rwandan mobile number input (sprint-03 §6.3): accepts `0788 123 456` and `+250…`; the caller
 * normalises with `toE164()` before sending. Uses `tel` input mode and autocomplete.
 */
export function PhoneField({ placeholder = "0788 123 456", ...props }: PhoneFieldProps) {
  return (
    <TextField type="tel" inputMode="tel" autoComplete="tel" placeholder={placeholder} {...props} />
  );
}
