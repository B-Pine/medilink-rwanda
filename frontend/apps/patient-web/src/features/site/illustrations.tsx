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

/** A small walking figure for the hillside scene (head, hair, clothes, legs). */
function Walker({
  x,
  y,
  scale = 1,
  clothes,
}: {
  x: number;
  y: number;
  scale?: number;
  clothes: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-6 0l3-24M6 0l-3-24" stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M-12-22l3-24c1-5 5-8 9-8s8 3 9 8l3 24z" fill={clothes} />
      <circle cx="0" cy="-62" r="10" fill={C.skin} />
      <path d="M-10-63c0-8 5-12 10-12s10 4 10 11c-5-4-12-4-20 1z" fill={C.ink} />
    </g>
  );
}

/**
 * Home hero (2026-11-04, second pass): a health centre on Rwanda's terraced hills, a path
 * leading to its door, people on their way and a live map pin above it. Brand greens with one
 * touch of ochre; no text, no numbers.
 */
export function HillsideCareIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 600 480"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <rect width="600" height="480" fill={C.mint} />
      <circle cx="486" cy="92" r="54" fill={C.surface} opacity="0.6" />
      <rect x="78" y="78" width="96" height="22" rx="11" fill={C.surface} opacity="0.75" />
      <rect x="120" y="62" width="62" height="22" rx="11" fill={C.surface} opacity="0.75" />

      {/* far hills with terraces */}
      <path
        d="M0 250C90 190 180 200 260 230S430 180 600 220V480H0z"
        fill={C.emerald}
        opacity="0.16"
      />
      <g stroke={C.surface} strokeWidth="3" strokeLinecap="round" opacity="0.55">
        <path d="M18 262c90-48 170-38 242-12" />
        <path d="M30 280c86-40 160-32 224-10" />
        <path d="M300 236c80-30 170-38 290-4" />
        <path d="M312 254c76-26 160-30 278-2" />
      </g>

      {/* middle hill */}
      <path
        d="M0 330C120 270 240 280 330 300S500 270 600 300V480H0z"
        fill={C.emerald}
        opacity="0.32"
      />
      <g stroke={C.surface} strokeWidth="3" strokeLinecap="round" opacity="0.45">
        <path d="M14 346c118-54 226-46 312-28" />
        <path d="M24 366c112-48 214-40 296-24" />
        <path d="M512 314c34-8 60-8 84-4" />
      </g>

      {/* trees */}
      <g>
        <rect x="106" y="296" width="6" height="22" rx="3" fill={C.forest} opacity="0.7" />
        <circle cx="109" cy="286" r="22" fill={C.emerald} opacity="0.85" />
        <rect x="148" y="300" width="5" height="16" rx="2.5" fill={C.forest} opacity="0.7" />
        <circle cx="150" cy="292" r="15" fill={C.emerald} opacity="0.7" />
        <rect x="537" y="282" width="6" height="22" rx="3" fill={C.forest} opacity="0.7" />
        <circle cx="540" cy="272" r="20" fill={C.emerald} opacity="0.85" />
      </g>

      {/* the health centre */}
      <g>
        <rect x="318" y="214" width="176" height="92" rx="8" fill={C.surface} />
        <path d="M304 222l102-50 102 50z" fill={C.forest} />
        <rect x="336" y="236" width="40" height="26" rx="4" fill={C.mint} />
        <rect x="436" y="236" width="40" height="26" rx="4" fill={C.mint} />
        <rect x="392" y="252" width="28" height="54" rx="4" fill={C.forest} opacity="0.88" />
        <rect x="382" y="304" width="48" height="6" rx="3" fill={C.line} />
        <circle cx="406" cy="198" r="14" fill={C.surface} />
        <path d="M406 190v16M398 198h16" stroke={C.emerald} strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* live pin above it */}
      <g>
        <circle cx="406" cy="112" r="40" stroke={C.emerald} strokeWidth="2" opacity="0.18" />
        <circle cx="406" cy="112" r="26" stroke={C.emerald} strokeWidth="2" opacity="0.35" />
        <path
          d="M406 82c-17 0-30 13-30 30 0 22 30 50 30 50s30-28 30-50c0-17-13-30-30-30z"
          fill={C.emerald}
        />
        <circle cx="406" cy="112" r="11" fill={C.surface} />
      </g>

      {/* the near ground and the path to the door */}
      <path d="M0 400C150 360 330 372 600 382V480H0z" fill={C.forest} />
      <path
        d="M76 480c48-58 172-50 222-98s80-62 108-72"
        stroke={C.surface}
        strokeWidth="16"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M76 480c48-58 172-50 222-98s80-62 108-72"
        stroke={C.mint}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 12"
      />

      {/* people on their way */}
      <Walker x={214} y={430} scale={1.05} clothes={C.ochre} />
      <Walker x={238} y={436} scale={0.68} clothes={C.emerald} />
      <Walker x={278} y={404} scale={0.92} clothes={C.surface} />
    </svg>
  );
}

/**
 * The patient journey (How it works): search the map, join from the phone, follow the queue,
 * arrive at the door.
 */
export function StepIllustration({
  step,
  className,
}: {
  step: "search" | "join" | "follow" | "arrive";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 140"
      fill="none"
      className={className}
    >
      <ellipse cx="100" cy="74" rx="88" ry="58" fill={C.mint} />
      {step === "search" && (
        <>
          <path
            d="M40 46l38-12 46 12 38-12v66l-38 12-46-12-38 12z"
            fill={C.surface}
            stroke={C.line}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M78 34v66M124 46v66" stroke={C.line} strokeWidth="2" />
          <circle cx="62" cy="66" r="6" fill={C.emerald} />
          <circle cx="146" cy="58" r="6" fill={C.emerald} opacity="0.5" />
          <circle cx="108" cy="72" r="20" fill={C.surface} stroke={C.forest} strokeWidth="5" />
          <path d="M123 87l16 16" stroke={C.forest} strokeWidth="7" strokeLinecap="round" />
        </>
      )}
      {step === "join" && (
        <>
          <rect x="68" y="20" width="64" height="108" rx="12" fill={C.forest} />
          <rect x="74" y="30" width="52" height="88" rx="6" fill={C.surface} />
          <path
            d="M82 52h36a4 4 0 0 1 4 4v6a6 6 0 0 0 0 12v6a4 4 0 0 1-4 4H82a4 4 0 0 1-4-4v-6a6 6 0 0 0 0-12v-6a4 4 0 0 1 4-4z"
            fill={C.mint}
          />
          <rect x="88" y="62" width="24" height="6" rx="3" fill={C.forest} />
          <rect x="88" y="72" width="16" height="5" rx="2.5" fill={C.emerald} opacity="0.6" />
          <rect x="82" y="96" width="36" height="12" rx="6" fill={C.emerald} />
          <circle cx="146" cy="40" r="12" fill={C.ochre} />
          <path
            d="M140 40l4 4 8-8"
            stroke={C.surface}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {step === "follow" && (
        <>
          {/* a clock and the queue: three people waiting, the patient's place marked */}
          <circle cx="64" cy="64" r="30" fill={C.surface} stroke={C.forest} strokeWidth="5" />
          <path
            d="M64 46v18l12 8"
            stroke={C.forest}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="34" y="108" width="140" height="4" rx="2" fill={C.line} />
          <circle cx="116" cy="88" r="9" fill={C.line} />
          <circle cx="140" cy="88" r="9" fill={C.line} />
          <circle cx="164" cy="88" r="11" fill={C.ochre} />
          <path d="M108 104h16M132 104h16" stroke={C.line} strokeWidth="6" strokeLinecap="round" />
          <path d="M155 104h18" stroke={C.ochre} strokeWidth="7" strokeLinecap="round" />
        </>
      )}
      {step === "arrive" && (
        <>
          <rect x="72" y="40" width="88" height="70" rx="6" fill={C.surface} />
          <path d="M64 46l52-26 52 26z" fill={C.forest} />
          <rect x="104" y="70" width="24" height="40" rx="3" fill={C.forest} opacity="0.88" />
          <circle cx="116" cy="34" r="8" fill={C.surface} />
          <path d="M116 29v10M111 34h10" stroke={C.emerald} strokeWidth="3" strokeLinecap="round" />
          <rect x="34" y="108" width="140" height="4" rx="2" fill={C.line} />
          <Walker x={62} y={110} scale={0.72} clothes={C.ochre} />
        </>
      )}
    </svg>
  );
}

/** For facilities: an abstract live board (rows and bars, no numbers) on the forest band. */
export function FacilityBoardIllustration({ className }: { className?: string }) {
  const onForest = "var(--color-on-forest)";
  const accent = "var(--color-on-forest-accent)";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 420 300"
      fill="none"
      className={className}
    >
      <rect x="20" y="20" width="380" height="250" rx="20" fill={onForest} opacity="0.08" />
      <rect
        x="20"
        y="20"
        width="380"
        height="250"
        rx="20"
        stroke={onForest}
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <circle cx="48" cy="48" r="6" fill={accent} />
      <rect x="62" y="43" width="90" height="10" rx="5" fill={onForest} opacity="0.5" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(44 ${80 + i * 42})`}>
          <rect width="64" height="28" rx="8" fill={onForest} opacity={i === 0 ? 0.9 : 0.16} />
          <rect x="80" y="6" width="120" height="8" rx="4" fill={onForest} opacity="0.45" />
          <rect x="80" y="18" width="70" height="6" rx="3" fill={onForest} opacity="0.22" />
          <rect
            x="230"
            y="9"
            width={[96, 60, 32][i]}
            height="10"
            rx="5"
            fill={accent}
            opacity={1 - i * 0.25}
          />
        </g>
      ))}
      <g transform="translate(44 214)">
        {[30, 44, 38, 56, 48, 40, 26, 34].map((h, i) => (
          <rect
            key={i}
            x={i * 40}
            y={40 - h * 0.6}
            width="26"
            height={h * 0.6}
            rx="5"
            fill={accent}
            opacity="0.55"
          />
        ))}
      </g>
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
