import type { FacilityResult, LocalisedItem, PublicFacility } from "@medilink/api-client";
import {
  Baby,
  Eye,
  FirstAidKit,
  Heartbeat,
  Scan,
  Stethoscope,
  TestTube,
  Tooth,
  type Icon,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";

import { useApi } from "../../app/services";

/**
 * Public site data (upgrade 11 §10). Everything comes from public endpoints: the facility search
 * (P1), facility profiles (P2), slots (P3), the service catalogue and help articles. Doctors have
 * no directory endpoint yet (upgrade 11 §13), so they are read from the facility profiles.
 */

/** Same root as the facility page, so profiles fetched here are reused there (and pre-rendered). */
const PUBLIC_QUERY_ROOT = "discovery";

export const EMERGENCY = {
  /** Rwanda's national ambulance (SAMU) number, configured here, not entered by a facility. */
  number: "912",
} as const;

/**
 * Referral hospitals shown on /emergency when the live list cannot load (redesign: "works with the
 * API down"). Names and districts only: a phone number is added here only once it is confirmed with
 * the hospital, because a wrong number on this page is worse than none. 912 stays the call action.
 */
export const REFERRAL_HOSPITALS: { name: string; district: string; phone?: string }[] = [
  { name: "University Teaching Hospital of Kigali (CHUK)", district: "Nyarugenge" },
  { name: "King Faisal Hospital", district: "Gasabo" },
  { name: "Rwanda Military Hospital", district: "Kicukiro" },
  { name: "Kibagabaga Hospital", district: "Gasabo" },
  { name: "Masaka Hospital", district: "Kicukiro" },
  { name: "Muhima Hospital", district: "Nyarugenge" },
  { name: "University Teaching Hospital of Butare (CHUB)", district: "Huye" },
  { name: "Ruhengeri Referral Hospital", district: "Musanze" },
  { name: "Rwamagana Provincial Hospital", district: "Rwamagana" },
  { name: "Kibuye Referral Hospital", district: "Karongi" },
];

/** A map search for a place by name (no coordinates needed). */
export const mapSearchUrl = (name: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, Rwanda`)}`;

// ---- facilities ----

/** Every live facility, page by page (the listing returns 20 at a time). */
export function useAllFacilities() {
  const api = useApi();
  return useQuery({
    queryKey: [PUBLIC_QUERY_ROOT, "site", "all-facilities"],
    queryFn: async () => {
      const first = await api.booking.search({ page: 1 });
      const results = [...first.results];
      const pages = Math.ceil(first.count / Math.max(first.results.length, 1));
      for (let page = 2; page <= Math.min(pages, 10); page++) {
        results.push(...(await api.booking.search({ page })).results);
      }
      return results;
    },
    staleTime: 60_000,
  });
}

/** One page after another for the directory ("Load more"). */
export function useFacilityPages(filters: {
  service_code?: string;
  district_code?: string;
  open_now?: boolean;
  /** The visitor's position: results carry the distance and come nearest first. */
  near?: { lat: number; lng: number } | null;
}) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [PUBLIC_QUERY_ROOT, "site", "directory", filters],
    queryFn: ({ pageParam }) => api.booking.search({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * 20 < last.count ? last.page + 1 : undefined),
  });
}

/** Facility profiles for the given slugs (doctors and services live there). */
export function useProfiles(slugs: string[]) {
  const api = useApi();
  return useQueries({
    queries: slugs.map((slug) => ({
      queryKey: [PUBLIC_QUERY_ROOT, "facility", slug],
      queryFn: () => api.booking.facility(slug),
      staleTime: 60_000,
    })),
    combine: (results) => ({
      data: results.flatMap((r) => (r.data ? [r.data] : [])),
      isPending: results.some((r) => r.isPending),
      isError: results.length > 0 && results.every((r) => r.isError),
      refetch: () => results.forEach((r) => void r.refetch()),
    }),
  });
}

// ---- doctors ----

export interface PublicDoctor {
  slug: string;
  membershipId: string;
  name: string;
  days: number[];
  /** Written by the doctor (upgrade 05 §3); empty when they keep it private. */
  specialty: string;
  bio: Partial<Record<"rw" | "en" | "fr", string>>;
  languages: string[];
  facility: Pick<PublicFacility, "slug" | "name" | "district" | "type">;
  /** Every facility this doctor works at (one card per doctor, redesign 2026-11). */
  facilities: Pick<PublicFacility, "slug" | "name" | "district" | "type">[];
  services: { id: string; code: string; name: PublicFacility["services"][number]["name_i18n"] }[];
}

/** A doctor's public address: facility and membership, so one doctor at two places has two pages. */
export const doctorSlug = (facility: string, membership: string) => `${facility}--${membership}`;

export function parseDoctorSlug(slug: string): { facility: string; membership: string } | null {
  const at = slug.lastIndexOf("--");
  if (at <= 0) return null;
  return { facility: slug.slice(0, at), membership: slug.slice(at + 2) };
}

export function doctorsOf(profile: PublicFacility): PublicDoctor[] {
  return profile.doctors.map((doctor) => ({
    slug: doctorSlug(profile.slug, doctor.membership_id),
    membershipId: doctor.membership_id,
    name: doctor.name,
    days: doctor.days,
    specialty: doctor.specialty ?? "",
    bio: doctor.bio_i18n ?? {},
    languages: doctor.languages ?? [],
    facility: {
      slug: profile.slug,
      name: profile.name,
      district: profile.district,
      type: profile.type,
    },
    facilities: [
      { slug: profile.slug, name: profile.name, district: profile.district, type: profile.type },
    ],
    services: profile.services
      .filter((service) => doctor.service_ids.includes(service.id))
      .map((service) => ({ id: service.id, code: service.code, name: service.name_i18n })),
  }));
}

/**
 * One card per doctor: the same person listed at two facilities is merged (by name), with their
 * days and services joined and every facility kept; the first facility keeps the profile page.
 */
function mergeDoctors(rows: PublicDoctor[]): PublicDoctor[] {
  const byName = new Map<string, PublicDoctor>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase().replace(/\s+/g, " ");
    const seen = byName.get(key);
    if (!seen) {
      byName.set(key, { ...row, facilities: [...row.facilities] });
      continue;
    }
    seen.days = [...new Set([...seen.days, ...row.days])].sort((a, b) => a - b);
    for (const service of row.services)
      if (!seen.services.some((s) => s.code === service.code)) seen.services.push(service);
    for (const place of row.facilities)
      if (!seen.facilities.some((f) => f.slug === place.slug)) seen.facilities.push(place);
    seen.specialty ||= row.specialty;
    if (!Object.keys(seen.bio).length) seen.bio = row.bio;
    seen.languages = [...new Set([...seen.languages, ...row.languages])];
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function useDoctors() {
  const facilities = useAllFacilities();
  const profiles = useProfiles((facilities.data ?? []).map((f) => f.slug));
  const doctors = mergeDoctors(profiles.data.flatMap(doctorsOf));
  return {
    doctors,
    facilities: facilities.data ?? [],
    isPending:
      facilities.isPending || (facilities.isSuccess && profiles.isPending && !doctors.length),
    isError: facilities.isError || profiles.isError,
    refetch: () => {
      void facilities.refetch();
      profiles.refetch();
    },
  };
}

// ---- services ----

export type ServiceCategory =
  | "general"
  | "maternalChild"
  | "laboratory"
  | "dental"
  | "eye"
  | "imaging"
  | "specialist"
  | "emergency";

export const SERVICE_CATEGORIES: { key: ServiceCategory; icon: Icon }[] = [
  { key: "general", icon: Stethoscope },
  { key: "maternalChild", icon: Baby },
  { key: "laboratory", icon: TestTube },
  { key: "dental", icon: Tooth },
  { key: "eye", icon: Eye },
  { key: "imaging", icon: Scan },
  { key: "specialist", icon: Heartbeat },
  { key: "emergency", icon: FirstAidKit },
];

/** Catalogue code to its category; unknown codes fall under general healthcare. */
export function categoryOf(code: string): ServiceCategory {
  if (
    /antenatal|paediatric|pediatric|vaccin|family_planning|gynae|gyne|matern|delivery|child/.test(
      code,
    )
  )
    return "maternalChild";
  if (/lab|test|blood/.test(code)) return "laboratory";
  if (/dental|tooth|teeth/.test(code)) return "dental";
  if (/eye|ophthalm|optic/.test(code)) return "eye";
  if (/imaging|x_ray|xray|ultrasound|scan|radiolog/.test(code)) return "imaging";
  if (/emergency|trauma/.test(code)) return "emergency";
  if (/internal|cardio|surgery|specialist|derma|ent|psych|ortho|neuro/.test(code))
    return "specialist";
  return "general";
}

export const categoryIcon = (category: ServiceCategory): Icon =>
  SERVICE_CATEGORIES.find((c) => c.key === category)?.icon ?? Stethoscope;

export const serviceSlug = (code: string) => code.replace(/_/g, "-");
export const serviceCode = (slug: string) => slug.replace(/-/g, "_");

export interface CatalogueService {
  code: string;
  name: string;
  category: ServiceCategory;
}

/** The public service catalogue (master data), names in the request language. */
export function useCatalogue(language: string) {
  const api = useApi();
  return useQuery({
    queryKey: [PUBLIC_QUERY_ROOT, "site", "catalogue", language],
    queryFn: async () => {
      const page = await api.masterData.publicList<LocalisedItem>("service-catalogue-items", {
        page_size: 200,
      });
      return page.results
        .filter((item) => item.is_active !== false && item.code)
        .map((item): CatalogueService => ({
          code: item.code!,
          name: item.name ?? item.code!,
          category: categoryOf(item.code!),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 5 * 60_000,
  });
}

/** Facilities whose listing row offers this service (one row per facility and service). */
export function useFacilitiesOffering(code: string) {
  const api = useApi();
  return useQuery({
    queryKey: [PUBLIC_QUERY_ROOT, "site", "offering", code],
    queryFn: async (): Promise<FacilityResult[]> =>
      (await api.booking.search({ service_code: code })).results,
    enabled: code !== "",
  });
}

/** A facility row looks like a hospital (interim emergency rule until `has_emergency_24h`). */
export const isHospital = (type: string) => type.endsWith("hospital");
