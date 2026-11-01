import type { Certainty, DiagnosisInput, LocalisedItem } from "@medilink/api-client";
import { Badge, Button, cx, SelectField } from "@medilink/ui";
import { LockKey, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

/** A chosen diagnosis with what the screen shows (labels come from the server snapshot). */
export interface PickedDiagnosis extends DiagnosisInput {
  label: string;
  isSensitive: boolean;
}

interface CodeItem extends LocalisedItem {
  code: string;
  title?: string;
  plain_language?: string;
  is_sensitive?: boolean;
}

const label = (item: CodeItem) =>
  item.plain_language && item.plain_language !== item.title
    ? `${item.plain_language} (${item.title ?? ""})`
    : (item.title ?? item.code);

function useDebounced(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(handle);
  }, [value, ms]);
  return debounced;
}

/**
 * ICD-10 type-ahead in plain language (design 04 §3.2: "malaria" → B54), then rank and certainty
 * per diagnosis (FR-CLN-06). A WAI-ARIA combobox: arrows move, Enter picks, Escape closes.
 */
export function DiagnosisPicker({
  value,
  onChange,
  disabled,
}: {
  value: PickedDiagnosis[];
  onChange: (next: PickedDiagnosis[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim());
  const search = useQuery({
    queryKey: ["clinical", "icd10", q],
    queryFn: () => api.masterData.staffList<CodeItem>("diagnosis-codes", { q, page_size: 8 }),
    enabled: q.length >= 2,
  });
  const chosen = new Set(value.map((d) => d.code));
  const options = (search.data?.results ?? []).filter((item) => !chosen.has(item.code));
  const showList = open && q.length >= 2;

  const pick = (item: CodeItem) => {
    const hasPrimary = value.some((d) => d.rank === "primary");
    onChange([
      ...value,
      {
        code: item.code,
        rank: hasPrimary ? "secondary" : "primary",
        certainty: "provisional",
        label: label(item),
        isSensitive: Boolean(item.is_sensitive),
      },
    ]);
    setText("");
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && showList && options[active]) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };
  const update = (code: string, patch: Partial<PickedDiagnosis>) =>
    onChange(
      value.map((d) =>
        d.code === code
          ? { ...d, ...patch }
          : patch.rank === "primary" && d.rank === "primary"
            ? { ...d, rank: "secondary" }
            : d,
      ),
    );

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul
          aria-label={t("clinical.diagnosis.chosen")}
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {value.map((d) => (
            <li
              key={d.code}
              className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-3"
            >
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="font-semibold">
                  <span className="font-mono">{d.code}</span> · {d.label}
                </span>
                <span className="flex flex-wrap gap-2">
                  {d.rank === "primary" && (
                    <Badge tone="brand">{t("clinical.diagnosis.primary")}</Badge>
                  )}
                  {d.isSensitive && (
                    <Badge tone="warning" icon={LockKey}>
                      {t("clinical.diagnosis.sensitive")}
                    </Badge>
                  )}
                </span>
              </div>
              <SelectField
                label={t("clinical.diagnosis.rank")}
                value={d.rank}
                disabled={disabled}
                onChange={(e) =>
                  update(d.code, { rank: e.target.value as PickedDiagnosis["rank"] })
                }
              >
                <option value="primary">{t("clinical.diagnosis.primary")}</option>
                <option value="secondary">{t("clinical.diagnosis.secondary")}</option>
              </SelectField>
              <SelectField
                label={t("clinical.diagnosis.certainty")}
                value={d.certainty}
                disabled={disabled}
                onChange={(e) => update(d.code, { certainty: e.target.value as Certainty })}
              >
                <option value="provisional">{t("clinical.diagnosis.provisional")}</option>
                <option value="confirmed">{t("clinical.diagnosis.confirmed")}</option>
              </SelectField>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.code !== d.code))}
              >
                <Trash aria-hidden="true" className="size-icon" />
                {t("clinical.diagnosis.remove", { code: d.code })}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="relative flex flex-col gap-1">
          <label htmlFor={inputId} className="font-semibold">
            {t("clinical.diagnosis.search")}
          </label>
          <div className="relative">
            <MagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-icon -translate-y-1/2 text-fg-muted"
            />
            <input
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                showList && options[active] ? `${listId}-${active}` : undefined
              }
              autoComplete="off"
              value={text}
              placeholder={t("clinical.diagnosis.placeholder")}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              className="min-h-10 w-full rounded-md border border-border-input bg-surface ps-10 pe-3 text-body"
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={t("clinical.diagnosis.results")}
            hidden={!showList}
            className="absolute top-full z-10 m-0 mt-1 flex max-h-72 w-full flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg"
          >
            {showList && search.isFetching && !options.length && (
              <div className="p-2 text-fg-muted">{t("clinical.diagnosis.searching")}</div>
            )}
            {showList && !search.isFetching && !options.length && (
              <div className="p-2 text-fg-muted">{t("clinical.diagnosis.noResults")}</div>
            )}
            {options.map((item, index) => (
              // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- combobox: focus stays on the input (aria-activedescendant)
              <div
                key={item.code}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                className={cx(
                  "flex cursor-pointer gap-2 rounded px-2 py-2",
                  index === active && "bg-info-bg",
                )}
              >
                <span className="font-mono font-semibold">{item.code}</span>
                <span>{label(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
