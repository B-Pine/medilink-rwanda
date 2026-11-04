/**
 * Custom illustrations (upgrade 11 §7): flat vector in forest, emerald, white and a touch of
 * ochre, one 3 px line weight, colours from theme tokens so both themes work. Decorative only
 * (aria-hidden) and without text, so they need no translation.
 */

const C = {
  forest: "var(--color-forest)",
  emerald: "var(--color-primary)",
  mint: "var(--color-brand-subtle)",
  surface: "var(--color-surface)",
  line: "var(--color-border)",
  ochre: "var(--color-attention-solid)",
  ink: "var(--color-fg)",
  skin: "var(--ml-illustration-skin)",
};

/** Empty results: a magnifier over a folded map, quiet and small. */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 120"
      fill="none"
      className={className}
    >
      <ellipse cx="80" cy="64" rx="70" ry="50" fill={C.mint} />
      <path
        d="M30 40l30-10 40 10 30-10v58l-30 10-40-10-30 10z"
        fill={C.surface}
        stroke={C.line}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M60 30v58M100 40v58" stroke={C.line} strokeWidth="2" />
      <circle cx="92" cy="62" r="16" fill={C.surface} stroke={C.emerald} strokeWidth="4" />
      <path d="M104 74l14 14" stroke={C.emerald} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
