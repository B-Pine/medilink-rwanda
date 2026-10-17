import { useTranslation } from "react-i18next";

import { cx } from "../utils/cx";

/**
 * Brand logo from the generated web assets in each app's public/brand/ (scripts/generate-icons.mjs).
 * Uses the brand PNG/WebP until vector masters exist (Sprint 0 contract §4).
 *
 * tone="auto": colour logo on light surfaces, white logo in the dark theme.
 * tone="onDark": always white (deep forest panels).
 */
export interface LogoProps {
  variant?: "horizontal" | "symbol";
  tone?: "auto" | "onDark";
  /** Height utility class, e.g. `h-10`. */
  className?: string;
  /** Override the accessible name (default "MediLink Rwanda"); pass "" when a text label is next to it. */
  alt?: string;
}

const ASSETS = {
  horizontal: {
    color: "medilink-logo-horizontal-color-120",
    white: "medilink-logo-horizontal-white-120",
    width: 363,
    height: 120,
  },
  symbol: {
    color: "medilink-symbol-color-192",
    white: "medilink-symbol-white-192",
    width: 166,
    height: 192,
  },
} as const;

function LogoImage({
  name,
  width,
  height,
  alt,
  className,
}: {
  name: string;
  width: number;
  height: number;
  alt: string;
  className?: string | undefined;
}) {
  const base = `${import.meta.env.BASE_URL}brand/${name}`;
  return (
    <picture className={className}>
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img
        src={`${base}.png`}
        width={width}
        height={height}
        alt={alt}
        className="block h-full w-auto"
      />
    </picture>
  );
}

export function Logo({ variant = "horizontal", tone = "auto", className, alt }: LogoProps) {
  const { t } = useTranslation("ui");
  const asset = ASSETS[variant];
  const label = alt ?? t("logo.alt");
  const sizeClass = cx("inline-block", className ?? "h-10");

  if (tone === "onDark") {
    return (
      <LogoImage
        name={asset.white}
        width={asset.width}
        height={asset.height}
        alt={label}
        className={sizeClass}
      />
    );
  }
  // Both variants are in the DOM and CSS shows one (theme). The wrapper carries the single
  // accessible name so it never depends on which image is visible.
  return (
    <span
      className="inline-flex"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <LogoImage
        name={asset.color}
        width={asset.width}
        height={asset.height}
        alt=""
        className={cx("ml-logo-for-light", sizeClass)}
      />
      <LogoImage
        name={asset.white}
        width={asset.width}
        height={asset.height}
        alt=""
        className={cx("ml-logo-for-dark", sizeClass)}
      />
    </span>
  );
}
