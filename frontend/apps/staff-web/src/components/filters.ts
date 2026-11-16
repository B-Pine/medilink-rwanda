/**
 * The one filter control of the staff app (audit 2026-11-16): a grey track with the chosen option
 * lifted onto a white chip. Single choice, `role="group"` with `aria-pressed` buttons. Use these
 * classes for every status or period filter so no page invents its own pills.
 */
export const FILTER_GROUP =
  "inline-flex max-w-full flex-wrap gap-1 self-start rounded-full bg-subtle p-1";

export const FILTER_BUTTON =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-body-sm font-semibold whitespace-nowrap text-fg-secondary transition-[background-color,color,box-shadow] duration-200 ease-out-quint hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card";
