import { cx } from "@medilink/ui";

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

/**
 * Home hero: a person checks a phone, a dotted route leads over a map to a marker and a health
 * facility, and a queue ticket waits for them. Search, place, facility and ticket in one picture.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 520 440"
      fill="none"
      className={cx("h-auto w-full", className)}
    >
      {/* soft ground */}
      <ellipse cx="270" cy="236" rx="236" ry="196" fill={C.mint} />
      <ellipse cx="270" cy="404" rx="190" ry="14" fill={C.forest} opacity="0.08" />

      {/* map sheet */}
      <g transform="rotate(-6 300 210)">
        <rect x="150" y="96" width="300" height="220" rx="22" fill={C.surface} />
        <rect x="150" y="96" width="300" height="220" rx="22" stroke={C.line} strokeWidth="2" />
        <path d="M150 170h300M150 248h300M232 96v220M352 96v220" stroke={C.line} strokeWidth="2" />
        <path
          d="M180 290c40-30 70-30 96-58s54-64 104-58"
          stroke={C.mint}
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>

      {/* route from the person to the facility */}
      <path
        d="M142 300c46-6 80-34 110-70s70-60 118-62"
        stroke={C.emerald}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 10"
      />

      {/* facility with a cross */}
      <g>
        <rect x="350" y="110" width="104" height="82" rx="12" fill={C.forest} />
        <path d="M340 118l62-38 62 38" stroke={C.forest} strokeWidth="10" strokeLinejoin="round" />
        <rect x="390" y="150" width="24" height="42" rx="4" fill={C.surface} opacity="0.9" />
        <rect x="364" y="128" width="22" height="16" rx="3" fill={C.surface} opacity="0.35" />
        <rect x="418" y="128" width="22" height="16" rx="3" fill={C.surface} opacity="0.35" />
        <circle cx="402" cy="106" r="15" fill={C.surface} />
        <path d="M402 98v16M394 106h16" stroke={C.emerald} strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* location marker */}
      <g>
        <path
          d="M258 152c-20 0-36 16-36 36 0 27 36 60 36 60s36-33 36-60c0-20-16-36-36-36z"
          fill={C.emerald}
        />
        <circle cx="258" cy="188" r="13" fill={C.surface} />
        <ellipse cx="258" cy="252" rx="16" ry="5" fill={C.forest} opacity="0.12" />
      </g>

      {/* queue ticket */}
      <g transform="rotate(5 430 330)">
        <path
          d="M374 290h112a10 10 0 0 1 10 10v14a12 12 0 0 0 0 24v14a10 10 0 0 1-10 10H374a10 10 0 0 1-10-10v-14a12 12 0 0 0 0-24v-14a10 10 0 0 1 10-10z"
          fill={C.surface}
          stroke={C.line}
          strokeWidth="2"
        />
        <path d="M410 296v56" stroke={C.line} strokeWidth="2" strokeDasharray="4 5" />
        <rect x="380" y="310" width="18" height="18" rx="5" fill={C.ochre} />
        <rect x="422" y="306" width="54" height="10" rx="5" fill={C.forest} />
        <rect x="422" y="324" width="36" height="8" rx="4" fill={C.line} />
        <rect x="422" y="338" width="44" height="8" rx="4" fill={C.line} />
      </g>

      {/* person with a phone */}
      <g>
        <path d="M74 400c0-58 22-96 58-96s58 38 58 96" fill={C.forest} />
        <circle cx="132" cy="262" r="30" fill={C.ink} opacity="0.85" />
        <circle cx="132" cy="268" r="26" fill={C.skin} />
        <path d="M106 262c2-20 14-30 28-30s26 10 26 26c-10-8-24-10-54 4z" fill={C.ink} />
        <path
          d="M168 334c18-6 30-14 36-28"
          stroke={C.skin}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <rect x="190" y="268" width="34" height="58" rx="8" fill={C.ink} />
        <rect x="194" y="274" width="26" height="44" rx="4" fill={C.surface} />
        <path d="M207 284c-5 0-9 4-9 9 0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9z" fill={C.emerald} />
      </g>

      {/* small sparkles of activity */}
      <circle cx="478" cy="236" r="6" fill={C.ochre} />
      <circle cx="96" cy="150" r="5" fill={C.emerald} opacity="0.6" />
      <circle cx="306" cy="74" r="4" fill={C.emerald} opacity="0.5" />
    </svg>
  );
}

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
      <path d="M110 54v16M102 62h16" stroke="var(--color-on-danger-solid)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M20 150c40-10 60-24 90-26s60 14 90 26"
        stroke={C.line}
        strokeWidth="2"
        strokeDasharray="3 8"
      />
    </svg>
  );
}
