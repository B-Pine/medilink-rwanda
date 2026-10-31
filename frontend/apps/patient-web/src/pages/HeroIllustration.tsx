/**
 * Hero illustration (design 06 §3, §5): hills, a health centre and someone on the way with their
 * ticket on the phone. Flat, two-tone emerald with one amber accent; drawn for the deep forest hero
 * in both themes. Decorative: the headline says the same thing in words.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 260"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
    >
      <defs>
        <clipPath id="hero-frame">
          <rect width="400" height="260" rx="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#hero-frame)">
        <rect width="400" height="260" fill="#022c22" />
        {/* sun (the one amber accent) */}
        <circle cx="318" cy="62" r="26" fill="var(--ml-accent)" />
        <circle cx="318" cy="62" r="40" fill="var(--ml-accent)" opacity="0.14" />

        {/* hills, back to front */}
        <path d="M0 170 C60 120 120 128 180 150 C240 172 300 118 400 132 V260 H0Z" fill="#065f46" />
        <path d="M0 196 C70 160 140 170 210 186 C280 202 330 170 400 176 V260 H0Z" fill="#047857" />
        <path d="M0 226 C90 204 190 210 260 222 C320 232 360 222 400 220 V260 H0Z" fill="#059669" />

        {/* terraces on the middle hill */}
        <g stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" opacity="0.45">
          <path d="M30 200 C80 184 130 186 180 196" />
          <path d="M60 210 C110 196 160 198 220 206" />
        </g>

        {/* health centre */}
        <g transform="translate(232 120)">
          <rect x="0" y="22" width="104" height="58" rx="4" fill="#ecfdf5" />
          <path d="M-6 24 L52 0 L110 24 Z" fill="#d1fae5" />
          <rect x="40" y="48" width="24" height="32" rx="2" fill="#047857" />
          <rect x="12" y="38" width="18" height="14" rx="2" fill="#a7f3d0" />
          <rect x="74" y="38" width="18" height="14" rx="2" fill="#a7f3d0" />
          {/* cross */}
          <rect x="47" y="6" width="10" height="26" rx="2" fill="#059669" />
          <rect x="39" y="14" width="26" height="10" rx="2" fill="#059669" />
        </g>

        {/* path to the door */}
        <path
          d="M120 260 C150 236 210 228 284 200"
          stroke="#ecfdf5"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.22"
        />

        {/* person walking, phone in hand */}
        <g transform="translate(132 150)">
          <circle cx="20" cy="10" r="9" fill="#ecfdf5" />
          <path d="M10 22 h20 l4 34 h-28 Z" fill="#a7f3d0" />
          <path d="M14 56 l-6 26" stroke="#ecfdf5" strokeWidth="6" strokeLinecap="round" />
          <path d="M27 56 l8 25" stroke="#ecfdf5" strokeWidth="6" strokeLinecap="round" />
          <path d="M30 28 l12 12" stroke="#a7f3d0" strokeWidth="5" strokeLinecap="round" />
          <rect x="38" y="34" width="10" height="16" rx="2" fill="#022c22" />
        </g>

        {/* the ticket, rising from the phone */}
        <g transform="translate(176 92)">
          <rect width="70" height="42" rx="8" fill="#ecfdf5" />
          <rect x="10" y="10" width="34" height="9" rx="3" fill="#047857" />
          <g fill="#059669">
            <circle cx="13" cy="30" r="3.5" />
            <circle cx="24" cy="30" r="3.5" />
            <circle cx="35" cy="30" r="3.5" />
            <circle cx="46" cy="30" r="3.5" opacity="0.35" />
          </g>
          <path d="M6 42 L0 52 L16 42 Z" fill="#ecfdf5" />
        </g>
      </g>
    </svg>
  );
}
