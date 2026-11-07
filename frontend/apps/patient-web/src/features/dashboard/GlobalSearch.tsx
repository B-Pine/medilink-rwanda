import {
  Bell,
  Buildings,
  CalendarCheck,
  FileText,
  Files,
  Gear,
  House,
  Lifebuoy,
  MagnifyingGlass,
  Pill,
  Stethoscope,
  Ticket,
  UsersThree,
  type Icon,
  Receipt,
} from "@phosphor-icons/react";
import { CommandPalette, type CommandGroup, type CommandRow } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { useUpcoming } from "../booking/Upcoming";
import { pick, time } from "../booking/discovery";
import { doctorsOf, useAllFacilities, useProfiles } from "../site/data";

const PAGES: { key: string; to: string; icon: Icon }[] = [
  { key: "overview", to: paths.overview, icon: House },
  { key: "findCare", to: paths.findCare, icon: MagnifyingGlass },
  { key: "appointments", to: paths.appointments, icon: CalendarCheck },
  { key: "queue", to: paths.queue, icon: Ticket },
  { key: "family", to: paths.family, icon: UsersThree },
  { key: "records", to: paths.records, icon: FileText },
  { key: "medications", to: paths.medications, icon: Pill },
  { key: "documents", to: paths.documents, icon: Files },
  { key: "bills", to: paths.bills, icon: Receipt },
  { key: "notifications", to: paths.notifications, icon: Bell },
  { key: "help", to: paths.help, icon: Lifebuoy },
  { key: "settings", to: paths.settings, icon: Gear },
];

const LIMIT = 5;
const has = (text: string | null | undefined, query: string) =>
  Boolean(text) && text!.toLocaleLowerCase().includes(query);

/**
 * Global search (upgrade 12 §2B, Ctrl+K): pages, the patient's own appointments and documents
 * (already authorised lists), then public facilities and doctors. Results are grouped; choosing
 * one opens its page. Facility and doctor lists load only once something is typed.
 */
export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const searching = q.length >= 2;

  const upcoming = useUpcoming();
  const documents = useQuery({
    queryKey: ["documents", "list", ""],
    queryFn: () => api.documents.patient.list({}),
  });
  const facilities = useAllFacilities();
  const matchedFacilities = searching
    ? (facilities.data ?? []).filter((f) => has(f.name, q) || has(f.district, q))
    : [];
  // Doctors live on facility profiles: read only the profiles the first facilities point to
  const profiles = useProfiles(
    searching ? (facilities.data ?? []).slice(0, 30).map((f) => f.slug) : [],
  );
  const doctors = searching ? profiles.data.flatMap(doctorsOf).filter((d) => has(d.name, q)) : [];

  const targets = new Map<string, string>();
  const row = (id: string, to: string, fields: Omit<CommandRow, "id">): CommandRow => {
    targets.set(id, to);
    return { id, ...fields };
  };

  const pageRows = PAGES.filter((page) => !q || has(t(`dashboard.nav.${page.key}`), q)).map(
    (page) =>
      row(`page-${page.key}`, page.to, { label: t(`dashboard.nav.${page.key}`), icon: page.icon }),
  );
  const appointmentRows = (upcoming.data?.results ?? [])
    .filter(
      (b) =>
        !q ||
        has(pick(b.service_name_i18n, lang), q) ||
        has(b.facility_name, q) ||
        has(b.doctor, q) ||
        has(b.booking_code, q),
    )
    .slice(0, searching ? LIMIT : 3)
    .map((b) =>
      row(`appt-${b.id}`, paths.appointment(b.id), {
        label: pick(b.service_name_i18n, lang),
        description: `${b.facility_name} · ${time(b.starts_at, lang)}`,
        icon: CalendarCheck,
      }),
    );
  const documentRows = searching
    ? (documents.data?.results ?? [])
        .filter((d) => has(t(`documents.kind.${d.kind}`), q) || has(d.facility_name, q))
        .slice(0, LIMIT)
        .map((d) =>
          row(`doc-${d.id}`, paths.document(d.id), {
            label: t(`documents.kind.${d.kind}`),
            description: d.facility_name,
            icon: Files,
          }),
        )
    : [];
  const facilityRows = matchedFacilities.slice(0, LIMIT).map((f) =>
    row(`fac-${f.slug}`, paths.facility(f.slug), {
      label: f.name,
      description: f.district,
      icon: Buildings,
    }),
  );
  const doctorRows = doctors.slice(0, LIMIT).map((d) =>
    row(`dr-${d.slug}`, paths.facility(d.facility.slug), {
      label: d.name,
      description: d.facility.name,
      icon: Stethoscope,
    }),
  );
  const findRow = searching
    ? [
        row("find", `${paths.findCare}?q=${encodeURIComponent(query.trim())}`, {
          label: t("dashboard.search.findCare", { query: query.trim() }),
          icon: MagnifyingGlass,
          busy: facilities.isFetching,
        }),
      ]
    : [];

  const groups: CommandGroup[] = [
    { id: "find", heading: t("dashboard.search.groups.find"), rows: findRow },
    { id: "pages", heading: t("dashboard.search.groups.pages"), rows: pageRows },
    {
      id: "appointments",
      heading: t("dashboard.search.groups.appointments"),
      rows: appointmentRows,
    },
    { id: "documents", heading: t("dashboard.search.groups.documents"), rows: documentRows },
    { id: "facilities", heading: t("dashboard.search.groups.facilities"), rows: facilityRows },
    { id: "doctors", heading: t("dashboard.search.groups.doctors"), rows: doctorRows },
  ];

  return (
    <CommandPalette
      open
      onOpenChange={(open) => !open && onClose()}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      onSelect={(selected) => {
        const to = targets.get(selected.id);
        onClose();
        if (to) void navigate(to);
      }}
      labels={{
        title: t("dashboard.search.title"),
        placeholder: t("dashboard.search.placeholder"),
        empty: t("dashboard.search.empty"),
        hints: t("dashboard.search.hints"),
      }}
    />
  );
}
