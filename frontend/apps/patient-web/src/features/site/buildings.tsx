/**
 * Facility buildings (upgrade 14 §4): one flat drawing per facility type on a quiet hillside, so a
 * card reads as a place, not a product. Theme colours only (both themes follow), decorative
 * (aria-hidden), no text. A 24-hour emergency department adds the red cross sign.
 */

import type { CSSProperties, JSX } from "react";

const C = {
  forest: "var(--color-forest)",
  forestRaised: "var(--color-forest-raised)",
  emerald: "var(--color-primary)",
  mint: "var(--color-brand-subtle)",
  surface: "var(--color-surface)",
  page: "var(--color-page)",
  line: "var(--color-border)",
  glass: "var(--color-on-forest-muted)",
  danger: "var(--color-danger-solid)",
  onDanger: "var(--color-on-danger-solid)",
};

type Kind = "referral" | "district" | "centre" | "poly" | "clinic";

export function buildingKind(type: string): Kind {
  if (type === "referral_hospital") return "referral";
  if (type.includes("hospital")) return "district";
  if (type.startsWith("health_")) return "centre";
  if (type === "polyclinic") return "poly";
  return "clinic";
}

/** A row of windows: `n` panes of w×h, `gap` apart, starting at x, y. */
function Windows({
  x,
  y,
  n,
  w = 12,
  h = 10,
  gap = 8,
  fill = C.mint,
}: {
  x: number;
  y: number;
  n: number;
  w?: number;
  h?: number;
  gap?: number;
  fill?: string;
}) {
  return (
    <g fill={fill}>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + i * (w + gap)} y={y} width={w} height={h} rx="1.5" />
      ))}
    </g>
  );
}

function Tree({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <rect x={x - 1.5} y={y} width="3" height={r} fill={C.forest} />
      <circle cx={x} cy={y - r * 0.2} r={r} fill={C.emerald} />
      <circle cx={x - r * 0.35} cy={y - r * 0.45} r={r * 0.45} fill={C.surface} opacity="0.18" />
    </g>
  );
}

/** The red cross sign of a 24-hour emergency department. */
function EmergencySign({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="18" height="18" rx="3" fill={C.danger} />
      <path
        d={`M${x + 9} ${y + 4.5}v9M${x + 4.5} ${y + 9}h9`}
        stroke={C.onDanger}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}

/** The cross plaque over a door. */
function Plaque({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="14" height="14" rx="7" fill={C.emerald} />
      <path
        d={`M${x + 7} ${y + 3.5}v7M${x + 3.5} ${y + 7}h7`}
        stroke={C.surface}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </g>
  );
}

function Referral() {
  return (
    <g>
      {/* wings */}
      <rect x="58" y="66" width="74" height="52" fill={C.surface} />
      <rect x="188" y="66" width="74" height="52" fill={C.surface} />
      <rect x="54" y="60" width="82" height="7" rx="2" fill={C.forest} />
      <rect x="184" y="60" width="82" height="7" rx="2" fill={C.forest} />
      <Windows x={66} y={76} n={3} w={14} gap={9} />
      <Windows x={66} y={96} n={3} w={14} gap={9} />
      <Windows x={196} y={76} n={3} w={14} gap={9} />
      <Windows x={196} y={96} n={3} w={14} gap={9} />
      {/* central tower */}
      <rect x="126" y="30" width="68" height="88" fill={C.surface} />
      <rect x="121" y="24" width="78" height="8" rx="2" fill={C.forest} />
      <Windows x={134} y={40} n={3} w={12} gap={6} />
      <Windows x={134} y={58} n={3} w={12} gap={6} />
      <Windows x={134} y={76} n={3} w={12} gap={6} />
      {/* entrance canopy */}
      <rect x="138" y="92" width="44" height="5" rx="2" fill={C.forest} />
      <rect x="148" y="97" width="24" height="21" fill={C.emerald} />
      <rect x="159" y="97" width="2" height="21" fill={C.surface} opacity="0.6" />
    </g>
  );
}

function District() {
  return (
    <g>
      {/* flag */}
      <rect x="52" y="34" width="2.5" height="84" fill={C.forest} />
      <path d="M54.5 36h18l-5 6 5 6h-18z" fill={C.emerald} />
      <rect x="68" y="58" width="184" height="60" fill={C.surface} />
      <rect x="63" y="51" width="194" height="8" rx="2" fill={C.forest} />
      <Windows x={78} y={68} n={4} w={14} gap={8} />
      <Windows x={196} y={68} n={2} w={14} gap={8} />
      <Windows x={78} y={92} n={3} w={14} gap={8} />
      <Windows x={196} y={92} n={2} w={14} gap={8} />
      {/* entrance */}
      <rect x="148" y="86" width="44" height="5" rx="2" fill={C.forest} />
      <rect x="156" y="91" width="28" height="27" fill={C.emerald} />
      <rect x="169" y="91" width="2" height="27" fill={C.surface} opacity="0.6" />
      <Plaque x={163} y={66} />
    </g>
  );
}

function Centre() {
  return (
    <g>
      <rect x="88" y="80" width="144" height="38" fill={C.surface} />
      {/* pitched roof over a veranda */}
      <path d="M78 82 160 56l82 26z" fill={C.forest} />
      <rect x="78" y="80" width="164" height="5" fill={C.forestRaised} />
      {[92, 120, 200, 228].map((x) => (
        <rect key={x} x={x} y="85" width="3" height="33" fill={C.forestRaised} />
      ))}
      <Windows x={100} y={92} n={2} w={14} h={12} gap={10} />
      <Windows x={182} y={92} n={2} w={14} h={12} gap={10} />
      <rect x="150" y="90" width="20" height="28" fill={C.emerald} />
      <Plaque x={153} y={64} />
    </g>
  );
}

function Poly() {
  return (
    <g>
      <rect x="92" y="46" width="136" height="72" fill={C.surface} />
      <rect x="88" y="40" width="144" height="7" rx="2" fill={C.forest} />
      {/* ribbon windows */}
      <rect x="100" y="56" width="120" height="14" rx="2" fill={C.glass} opacity="0.85" />
      <rect x="100" y="78" width="120" height="14" rx="2" fill={C.glass} opacity="0.85" />
      {[130, 160, 190].map((x) => (
        <rect key={x} x={x} y="56" width="2" height="36" fill={C.surface} opacity="0.8" />
      ))}
      <rect x="92" y="46" width="10" height="72" fill={C.forestRaised} />
      <rect x="150" y="98" width="30" height="20" fill={C.emerald} />
      <rect x="146" y="94" width="38" height="4" rx="2" fill={C.forest} />
    </g>
  );
}

function Clinic() {
  return (
    <g>
      <rect x="116" y="80" width="88" height="38" fill={C.surface} />
      <path d="M108 82 160 58l52 24z" fill={C.forest} />
      <Windows x={126} y={90} n={1} w={18} h={14} />
      <Windows x={176} y={90} n={1} w={18} h={14} />
      <rect x="151" y="92" width="18" height="26" fill={C.emerald} />
      <path d="M146 92h28l-4-6h-20z" fill={C.forestRaised} />
      <Plaque x={153} y={68} />
      <circle cx="112" cy="114" r="6" fill={C.emerald} />
      <circle cx="208" cy="114" r="6" fill={C.emerald} />
    </g>
  );
}

const DRAWINGS: Record<Kind, () => JSX.Element> = {
  referral: Referral,
  district: District,
  centre: Centre,
  poly: Poly,
  clinic: Clinic,
};

/** Where the emergency sign hangs on each building. */
const SIGN: Record<Kind, [number, number]> = {
  referral: [168, 36],
  district: [226, 32],
  centre: [204, 62],
  poly: [204, 22],
  clinic: [186, 62],
};

export function FacilityBuilding({
  type,
  emergency = false,
  className,
  style,
}: {
  type: string;
  emergency?: boolean;
  className?: string;
  /** e.g. a view-transition name, so the drawing flows into the facility page */
  style?: CSSProperties;
}) {
  const kind = buildingKind(type);
  const Drawing = DRAWINGS[kind];
  const [sx, sy] = SIGN[kind];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 140"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      className={className}
      style={style}
    >
      <rect width="320" height="140" fill={C.mint} />
      <circle cx="268" cy="30" r="16" fill={C.surface} opacity="0.55" />
      {/* far hill, then the ground the building stands on */}
      <path d="M0 100c56-14 112-8 168-14s112-6 152 4v50H0z" fill={C.emerald} opacity="0.16" />
      <Tree x={30} y={104} r={10} />
      <Tree x={290} y={106} r={8} />
      <Drawing />
      {emergency && <EmergencySign x={sx} y={sy} />}
      <path d="M0 118c80-6 240-6 320 0v22H0z" fill={C.emerald} opacity="0.3" />
      {/* the path to the door */}
      <path d="M155 118h10l14 22h-38z" fill={C.surface} opacity="0.7" />
    </svg>
  );
}
