import type { PublicFacility } from "@medilink/api-client";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

import { env } from "../../env";
import { isHospital } from "./data";

/**
 * Search and share tags for a public page (audit 2026-11-07, phase 5): one description, the
 * canonical address, Open Graph and, where there is one, the page's structured data (JSON-LD).
 * The build writes the same tags into pre-rendered pages (src/prerender); this keeps them right
 * after an in-app navigation.
 */
export const JSON_LD_ID = "ml-jsonld";

/** Search descriptions of the public pages (`site.meta.*`); not shown on the page. */
const PAGE_DESCRIPTIONS: Record<string, string> = {
  "/find-care": "findCare",
  "/facilities": "facilities",
  "/doctors": "doctors",
  "/services": "services",
  "/how-it-works": "how",
  "/emergency": "emergency",
  "/help": "help",
  "/about": "about",
  "/contact": "contact",
  "/accessibility": "accessibility",
  "/privacy": "privacy",
  "/terms": "terms",
  "/for-facilities": "forFacilities",
  "/check-symptoms": "checkSymptoms",
};

/** The i18n key of a path's search description, if it has its own. */
export function pageDescriptionKey(path: string): string | null {
  const key = PAGE_DESCRIPTIONS[path.replace(/\/$/, "") || "/"];
  return key ? `site.meta.${key}` : null;
}

/** The site's public address: VITE_SITE_URL, else where the page is served from. */
export function siteOrigin(): string {
  const configured = env.siteUrl.replace(/\/$/, "");
  if (configured) return configured;
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Canonical address of a path: no query, no trailing slash. */
export function canonicalUrl(origin: string, path: string): string {
  const clean = path.replace(/\/$/, "") || "/";
  return `${origin}${clean === "/" ? "/" : clean}`;
}

/**
 * schema.org data for a facility page: static facts only (ADR 0008), no waits or times.
 * Hospitals are `Hospital`; everything else is a `MedicalClinic`.
 */
export function facilityJsonLd(
  f: PublicFacility,
  url: string,
  description: string,
): Record<string, unknown> {
  const kind = isHospital(f.type) ? "Hospital" : "MedicalClinic";
  return {
    "@context": "https://schema.org",
    "@type": f.emergency_department ? [kind, "EmergencyService"] : kind,
    name: f.name,
    ...(description && { description }),
    ...(url && { url }),
    ...(f.phone && { telephone: f.phone }),
    ...(f.email && { email: f.email }),
    ...(f.website && { sameAs: [f.website] }),
    address: {
      "@type": "PostalAddress",
      ...(f.address && { streetAddress: f.address }),
      addressLocality: [f.sector, f.district].filter(Boolean).join(", "),
      addressCountry: "RW",
    },
    ...(f.lat != null &&
      f.lng != null && {
        geo: { "@type": "GeoCoordinates", latitude: f.lat, longitude: f.lng },
      }),
    ...(f.doctors.length > 0 && {
      employee: f.doctors.map((d) => ({
        "@type": "Physician",
        name: d.name,
        ...(d.specialty && { medicalSpecialty: d.specialty }),
      })),
    }),
  };
}

function upsert(selector: string, create: () => HTMLElement, set: (el: HTMLElement) => void) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.append(el);
  }
  set(el);
}

function meta(attr: "name" | "property", key: string, content: string) {
  upsert(
    `meta[${attr}="${key}"]`,
    () => {
      const el = document.createElement("meta");
      el.setAttribute(attr, key);
      return el;
    },
    (el) => el.setAttribute("content", content),
  );
}

export function usePageMeta({
  title,
  description,
  jsonLd,
}: {
  title: string;
  description?: string;
  jsonLd?: Record<string, unknown> | null;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const own = pageDescriptionKey(pathname);
  const text = description?.trim() || (own ? t(own) : t("home.description"));
  const ld = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const url = canonicalUrl(siteOrigin(), pathname);
    meta("name", "description", text);
    meta("property", "og:title", `${title} · ${t("app.titleSuffix")}`);
    meta("property", "og:description", text);
    meta("property", "og:type", "website");
    meta("property", "og:url", url);
    meta("property", "og:site_name", t("app.titleSuffix"));
    upsert(
      'link[rel="canonical"]',
      () => {
        const el = document.createElement("link");
        el.setAttribute("rel", "canonical");
        return el;
      },
      (el) => el.setAttribute("href", url),
    );
    const old = document.getElementById(JSON_LD_ID);
    if (!ld) {
      old?.remove();
      return;
    }
    upsert(
      `script#${JSON_LD_ID}`,
      () => {
        const el = document.createElement("script");
        el.id = JSON_LD_ID;
        el.setAttribute("type", "application/ld+json");
        return el;
      },
      (el) => (el.textContent = ld),
    );
  }, [pathname, text, title, ld, t]);
}
