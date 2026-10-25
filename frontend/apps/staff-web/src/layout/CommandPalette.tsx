import type { StaffMe } from "@medilink/api-client";
import {
  Alert,
  CommandPalette as CommandPaletteView,
  type CommandGroup,
  type CommandRow,
} from "@medilink/ui";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { FEATURE_COMMANDS } from "../app/features";
import { useApi } from "../app/services";
import type { PaletteItem } from "./commands";
import { navLabelKey, visibleNavItems } from "./navigation";

type SearchState =
  | { providerId: string; query: string; status: "loading" }
  | { providerId: string; query: string; status: "done"; items: PaletteItem[] }
  | { providerId: string; query: string; status: "error" };

const matches = (label: string, query: string) =>
  label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

/** Opens the palette with Ctrl+K (Cmd+K on macOS), from anywhere in the shell. */
export function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

/**
 * Staff command palette (design 04 §2): jump to any page the user can open, run feature actions
 * (e.g. new walk-in), and run feature searches (e.g. find a patient) on demand.
 */
export function CommandPalette({
  me,
  open,
  onOpenChange,
}: {
  me: StaffMe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState | null>(null);
  const providers = useMemo(() => FEATURE_COMMANDS(), []);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // nothing typed here outlives the dialog
      setQuery("");
      setSearch(null);
    }
  };

  const pages: PaletteItem[] = visibleNavItems(me).map((item) => ({
    id: `page:${item.key}`,
    label: t(navLabelKey(item)),
    icon: item.icon,
    to: item.path,
  }));
  const actions = providers.flatMap((provider) => provider.actions?.(me, t) ?? []);
  const searches = providers.flatMap((provider) =>
    provider.search && provider.search.visible(me) ? [provider.search] : [],
  );
  const trimmed = query.trim();

  const targets = new Map<string, PaletteItem>();
  const toRow = (item: PaletteItem): CommandRow => {
    targets.set(item.id, item);
    return { id: item.id, label: item.label, description: item.description, icon: item.icon };
  };

  const groups: CommandGroup[] = [];
  const searchRows = searches
    .filter((provider) => trimmed.length >= provider.minLength)
    .map((provider) => ({
      id: `search:${provider.id}`,
      label: provider.label(trimmed, t),
      icon: MagnifyingGlass,
      busy:
        search?.providerId === provider.id &&
        search.query === trimmed &&
        search.status === "loading",
    }));
  for (const provider of searches) {
    if (search?.providerId !== provider.id || search.status !== "done") continue;
    groups.push({
      id: `results:${provider.id}`,
      heading: provider.heading(t),
      rows:
        search.items.length > 0
          ? search.items.map(toRow)
          : [{ id: `none:${provider.id}`, label: t("shell.palette.noResults") }],
    });
  }
  groups.push(
    { id: "search", heading: t("shell.palette.search"), rows: searchRows },
    {
      id: "actions",
      heading: t("shell.palette.actions"),
      rows: actions.filter((item) => matches(item.label, query)).map(toRow),
    },
    {
      id: "pages",
      heading: t("shell.palette.pages"),
      rows: pages.filter((item) => matches(item.label, query)).map(toRow),
    },
  );

  const runSearch = (providerId: string) => {
    const provider = searches.find((candidate) => candidate.id === providerId);
    if (!provider) return;
    const asked = trimmed;
    setSearch({ providerId, query: asked, status: "loading" });
    provider.run(api, asked, t).then(
      (items) =>
        setSearch((current) =>
          current?.providerId === providerId && current.query === asked
            ? { providerId, query: asked, status: "done", items }
            : current,
        ),
      () =>
        setSearch((current) =>
          current?.providerId === providerId && current.query === asked
            ? { providerId, query: asked, status: "error" }
            : current,
        ),
    );
  };

  const onSelect = (row: CommandRow) => {
    if (row.id.startsWith("search:")) return runSearch(row.id.slice("search:".length));
    const target = targets.get(row.id);
    if (!target) return;
    close(false);
    void navigate(target.to);
  };

  return (
    <CommandPaletteView
      open={open}
      onOpenChange={close}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      onSelect={onSelect}
      labels={{
        title: t("shell.palette.title"),
        placeholder: t("shell.palette.placeholder"),
        empty: t("shell.palette.empty"),
        hints: t("shell.palette.hints"),
      }}
      footer={
        search?.status === "error" ? (
          <Alert tone="danger" role="alert">
            {t("shell.palette.searchFailed")}
          </Alert>
        ) : undefined
      }
    />
  );
}
