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

/** Emergency page: a hospital front with a cross and a road leading to it. */
export function EmergencyIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 220 160"
      fill="none"
      className={className}
    >
      <ellipse cx="110" cy="84" rx="100" ry="70" fill="var(--color-danger-bg)" />
      <rect
        x="62"
        y="44"
        width="96"
        height="80"
        rx="10"
        fill={C.surface}
        stroke={C.line}
        strokeWidth="2"
      />
      <rect x="92" y="88" width="36" height="36" rx="4" fill={C.forest} opacity="0.85" />
      <circle cx="110" cy="62" r="14" fill="var(--color-danger-solid)" />
      <path
        d="M110 54v16M102 62h16"
        stroke="var(--color-on-danger-solid)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M20 150c40-10 60-24 90-26s60 14 90 26"
        stroke={C.line}
        strokeWidth="2"
        strokeDasharray="3 8"
      />
    </svg>
  );
}
