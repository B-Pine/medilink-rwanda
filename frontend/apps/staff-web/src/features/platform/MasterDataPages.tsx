import {
  ALL_LANGUAGE_KINDS,
  IMPORTABLE_KINDS,
  MASTER_DATA_KINDS,
  isApiError,
  type ImportMode,
  type MasterDataKind,
  type PlatformItem,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  DataTable,
  FileUpload,
  LoadingState,
  SelectField,
  SidePanel,
  TextField,
  Timeline,
  buttonClassName,
  type ColumnDef,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import { actionError, PlatformOnly, useIdempotencyKey, useLocale, useTableLabels } from "./shared";

const LANGS = ["rw", "en", "fr"] as const;
type I18n = Partial<Record<(typeof LANGS)[number], string>>;

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Display text of a row in the platform view. */
function rowTitle(row: PlatformItem, locale: string): string {
  for (const key of ["name_i18n", "title_i18n", "label_i18n"]) {
    const value = row[key] as I18n | undefined;
    if (value)
      return value[locale as "en"] || value.en || LANGS.map((l) => value[l]).find(Boolean) || "";
  }
  return text(row.name) || text(row.generic_name) || text(row.holiday_date) || text(row.code);
}

/** The editable fields of a row: plain columns and *_i18n objects (identity fields locked). */
const SKIP = new Set([
  "id",
  "version",
  "missing_languages",
  "created_at",
  "updated_at",
  "is_active",
  "sort_order",
]);
const IDENTITY: Partial<Record<MasterDataKind, string[]>> = {
  "public-holidays": ["holiday_date"],
  "reason-codes": ["kind", "code"],
  "diagnosis-codes": ["code_system", "code"],
};

function KindCard({ kind }: { kind: MasterDataKind }) {
  const { t } = useTranslation();
  const api = useApi();
  const all = useQuery({
    queryKey: ["platform", "md", kind, "count"],
    queryFn: () => api.masterData.platform.list(kind, { page_size: 1 }),
  });
  const missing = useQuery({
    queryKey: ["platform", "md", kind, "missing"],
    queryFn: () => api.masterData.platform.list(kind, { page_size: 1, missing_language: "rw" }),
    enabled: ALL_LANGUAGE_KINDS.includes(kind) || kind === "diagnosis-codes",
  });
  return (
    <Card as="li" padding="md" className="flex flex-col gap-2">
      <Link
        to={`/platform/master-data/${kind}`}
        className="font-heading text-h3 text-link underline-offset-2 hover:underline"
      >
        {t(`platform.masterData.kinds.${kind}`)}
      </Link>
      <span className="text-fg-secondary">
        {t("platform.masterData.count", { count: all.data?.count ?? 0 })}
      </span>
      {(missing.data?.count ?? 0) > 0 && (
        <Badge tone="warning">
          {t("platform.masterData.missingRw", { count: missing.data?.count ?? 0 })}
        </Badge>
      )}
    </Card>
  );
}

/** /platform/master-data: one card per kind with counts and missing translations. */
export function MasterDataPage() {
  const { t } = useTranslation();
  return (
    <PlatformOnly>
      <div className="flex flex-col gap-5">
        <PageHeader title={t("platform.masterData.title")} />
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {MASTER_DATA_KINDS.map((kind) => (
            <KindCard key={kind} kind={kind} />
          ))}
        </ul>
      </div>
    </PlatformOnly>
  );
}

/** /platform/master-data/:kind — table, side-panel editor, history, imports. */
export function MasterDataKindPage() {
  return (
    <PlatformOnly>
      <KindTable />
    </PlatformOnly>
  );
}

function KindTable() {
  const { t } = useTranslation();
  const { kind = "insurers" } = useParams() as { kind: MasterDataKind };
  const api = useApi();
  const locale = useLocale();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const active = params.get("is_active") ?? "";
  const missing = params.get("missing_language") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [editing, setEditing] = useState<PlatformItem | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const labels = useTableLabels(t(`platform.masterData.kinds.${kind}`));
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };
  const list = useQuery({
    queryKey: ["platform", "md", kind, q, active, missing, page],
    queryFn: () =>
      api.masterData.platform.list(kind, {
        q,
        is_active: active,
        missing_language: missing,
        page,
        page_size: 50,
      }),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<PlatformItem, unknown>[]>(
    () => [
      {
        id: "code",
        header: t("platform.masterData.code"),
        enableSorting: false,
        cell: ({ row }) => text(row.original.code) || text(row.original.holiday_date),
      },
      {
        id: "title",
        header: t("platform.masterData.name"),
        enableSorting: false,
        cell: ({ row }) => rowTitle(row.original, locale),
      },
      {
        id: "state",
        header: t("platform.applications.status"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge tone="success">{t("platform.masterData.active")}</Badge>
          ) : (
            <Badge tone="neutral">{t("platform.masterData.retired")}</Badge>
          ),
      },
      {
        id: "languages",
        header: t("platform.masterData.translations"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.missing_languages.length ? (
            <Badge tone="warning">
              {t("platform.masterData.missing", {
                langs: row.original.missing_languages.join(", "),
              })}
            </Badge>
          ) : (
            "—"
          ),
      },
    ],
    [t, locale],
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t(`platform.masterData.kinds.${kind}`)}
        back={{ to: "/platform/master-data", label: t("platform.masterData.back") }}
        actions={
          <>
            {IMPORTABLE_KINDS.includes(kind) && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                {t("platform.masterData.import")}
              </Button>
            )}
            <Button onClick={() => setEditing("new")}>{t("platform.masterData.add")}</Button>
          </>
        }
      />
      <DataTable<PlatformItem>
        caption={t(`platform.masterData.kinds.${kind}`)}
        columns={columns}
        data={list.data?.results ?? []}
        getRowId={(r) => r.id}
        labels={labels}
        total={list.data?.count ?? 0}
        page={page}
        pageSize={50}
        onPageChange={(p) => update({ page: String(p) })}
        search={q}
        onSearchChange={(value) => update({ q: value })}
        toolbar={
          <>
            <SelectField
              label={t("platform.applications.status")}
              value={active}
              onChange={(e) => update({ is_active: e.target.value })}
            >
              <option value="">{t("platform.applications.all")}</option>
              <option value="true">{t("platform.masterData.active")}</option>
              <option value="false">{t("platform.masterData.retired")}</option>
            </SelectField>
            <SelectField
              label={t("platform.masterData.missingLanguage")}
              value={missing}
              onChange={(e) => update({ missing_language: e.target.value })}
            >
              <option value="">{t("platform.applications.all")}</option>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`language.names.${l}`, { ns: "ui" })}
                </option>
              ))}
            </SelectField>
          </>
        }
        onRowClick={setEditing}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        filtered={Boolean(q || active || missing)}
      />
      {editing && (
        <Editor
          kind={kind}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ImportPanel kind={kind} onClose={() => setImporting(false)} />}
    </div>
  );
}

function Editor({
  kind,
  row,
  onClose,
}: {
  kind: MasterDataKind;
  row: PlatformItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const identity = IDENTITY[kind] ?? ["code"];
  const template = row ?? list0(queryClient, kind);
  const fields = Object.keys(template ?? { code: "", name_i18n: {} }).filter((k) => !SKIP.has(k));
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f, row ? row[f] : emptyLike(template?.[f])])),
  );
  const [error, setError] = useState<string | undefined>();
  const history = useQuery({
    queryKey: ["platform", "md", kind, row?.id, "changes"],
    queryFn: () => api.masterData.platform.changes(kind, row!.id),
    enabled: Boolean(row),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["platform", "md", kind] });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      withStepUp(() =>
        row
          ? api.masterData.platform.update(kind, row.id, { ...body, version: row.version })
          : api.masterData.platform.create(kind, body),
      ),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = { ...values };
    if (row) for (const key of identity) delete body[key];
    save.mutate(body);
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        row ? rowTitle(row, locale) || t("platform.masterData.edit") : t("platform.masterData.add")
      }
      closeLabel={t("lock.close")}
      footer={
        <>
          {row && (
            <Button
              variant="secondary"
              loading={save.isPending}
              onClick={() => save.mutate({ is_active: !row.is_active })}
            >
              {row.is_active ? t("platform.masterData.retire") : t("platform.masterData.restore")}
            </Button>
          )}
          <Button type="submit" form="md-editor" loading={save.isPending}>
            {t("platform.licences.save")}
          </Button>
        </>
      }
    >
      <form id="md-editor" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {Object.entries(values).map(([field, value]) => {
          const locked = Boolean(row) && identity.includes(field);
          if (field.endsWith("_i18n") && field !== "synonyms_i18n") {
            const text = (value ?? {}) as I18n;
            return (
              <fieldset
                key={field}
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <legend className="px-1 font-semibold">
                  {t(`platform.masterData.fields.${field}`, { defaultValue: field })}
                </legend>
                {LANGS.map((lang) => (
                  <TextField
                    key={lang}
                    label={t(`language.names.${lang}`, { ns: "ui" })}
                    lang={lang}
                    optional={!ALL_LANGUAGE_KINDS.includes(kind)}
                    value={text[lang] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field]: { ...text, [lang]: e.target.value } }))
                    }
                  />
                ))}
              </fieldset>
            );
          }
          if (field === "synonyms_i18n") return null;
          if (typeof value === "boolean") {
            return (
              <CheckboxField
                key={field}
                label={t(`platform.masterData.fields.${field}`, { defaultValue: field })}
                checked={value}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.checked }))}
              />
            );
          }
          return (
            <TextField
              key={field}
              label={t(`platform.masterData.fields.${field}`, { defaultValue: field })}
              optional={!identity.includes(field)}
              disabled={locked}
              hint={locked ? t("platform.masterData.immutable") : undefined}
              value={value === null || value === undefined ? "" : text(value)}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [field]:
                    typeof template?.[field] === "number"
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : e.target.value,
                }))
              }
            />
          );
        })}
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
      </form>
      {row && (
        <section className="mt-6 flex flex-col gap-3">
          <h3 className="m-0 font-heading text-h3">{t("platform.masterData.history")}</h3>
          <Timeline
            locale={locale}
            events={(history.data?.results ?? []).map((c) => ({
              id: c.id,
              at: c.changed_at,
              title: t(`platform.masterData.action.${c.action}`),
              actor: c.actor?.full_name ?? t("platform.review.actor.system"),
            }))}
          />
        </section>
      )}
    </SidePanel>
  );
}

/** A row of the current page, used as the shape for a new row. */
function list0(
  queryClient: ReturnType<typeof useQueryClient>,
  kind: MasterDataKind,
): PlatformItem | null {
  const pages = queryClient.getQueriesData<{ results: PlatformItem[] }>({
    queryKey: ["platform", "md", kind],
  });
  for (const [, data] of pages) if (data?.results?.[0]) return data.results[0];
  return null;
}

function emptyLike(sample: unknown): unknown {
  if (typeof sample === "boolean") return false;
  if (typeof sample === "number") return null;
  if (sample && typeof sample === "object") return {};
  return "";
}

function ImportPanel({ kind, onClose }: { kind: MasterDataKind; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ImportMode>("upsert");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function start(files: File[]) {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const job = await api.masterData.platform.startImport(kind, file, mode);
      void navigate(`/platform/master-data/${kind}/imports/${job.id}`);
    } catch (failure) {
      setError(
        isApiError(failure) ? (failure.fieldError("file") ?? failure.message) : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("platform.masterData.import")}
      closeLabel={t("lock.close")}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-fg-secondary">{t("platform.masterData.importHint")}</p>
        <SelectField
          label={t("platform.masterData.mode")}
          value={mode}
          onChange={(e) => setMode(e.target.value as ImportMode)}
        >
          <option value="upsert">{t("platform.masterData.modes.upsert")}</option>
          <option value="upsert_and_retire_missing">
            {t("platform.masterData.modes.upsert_and_retire_missing")}
          </option>
        </SelectField>
        <FileUpload
          label={t("platform.masterData.csvFile")}
          labels={{
            drop: t("platform.upload.drop"),
            browse: t("platform.upload.browse"),
            camera: t("platform.upload.browse"),
            hint: t("platform.masterData.csvHint"),
            retry: t("platform.table.retry"),
            remove: t("platform.upload.remove"),
            // No per-file list here (the preview page shows progress), so one text fits all.
            status: Object.fromEntries(
              (
                [
                  "uploading",
                  "pending",
                  "clean",
                  "infected",
                  "rejected",
                  "failed",
                  "error",
                ] as const
              ).map((k) => [k, t("platform.upload.uploading")]),
            ) as Record<
              "uploading" | "pending" | "clean" | "infected" | "rejected" | "failed" | "error",
              string
            >,
            tooLarge: t("platform.masterData.csvTooLarge"),
            wrongType: t("platform.masterData.csvType"),
          }}
          items={[]}
          accept=".csv,text/csv"
          maxBytes={5 * 1024 * 1024}
          allowCamera={false}
          disabled={busy}
          error={error}
          onFiles={(files) => void start(files)}
        />
        {busy && <LoadingState label={t("platform.upload.uploading")} />}
      </div>
    </SidePanel>
  );
}

/** /platform/master-data/:kind/imports/:importId — preview (counts, errors, samples) and confirm. */
export function ImportPage() {
  return (
    <PlatformOnly>
      <ImportPreview />
    </PlatformOnly>
  );
}

function ImportPreview() {
  const { t } = useTranslation();
  const { kind = "drugs", importId = "" } = useParams() as {
    kind: MasterDataKind;
    importId: string;
  };
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const idem = useIdempotencyKey();
  const [error, setError] = useState<string | undefined>();
  const job = useQuery({
    queryKey: ["platform", "md", kind, "import", importId],
    queryFn: () => api.masterData.platform.getImport(kind, importId),
    refetchInterval: (query) =>
      ["validating", "applying"].includes(query.state.data?.status ?? "validating") ? 1500 : false,
  });
  const confirm = useMutation({
    mutationFn: () =>
      withStepUp(() => api.masterData.platform.confirmImport(kind, importId, idem.current())),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["platform", "md", kind] }),
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  const data = job.data;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("platform.masterData.importTitle")}
        back={{
          to: `/platform/master-data/${kind}`,
          label: t(`platform.masterData.kinds.${kind}`),
        }}
      />
      {!data && <LoadingState />}
      {data && (
        <>
          <p className="m-0" role="status">
            <Badge
              tone={
                data.status === "applied"
                  ? "success"
                  : data.status === "previewed"
                    ? "info"
                    : ["invalid", "failed", "expired"].includes(data.status)
                      ? "danger"
                      : "neutral"
              }
            >
              {t(`platform.masterData.importStatus.${data.status}`)}
            </Badge>
          </p>
          <dl className="m-0 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {(["rows", "create", "update", "retire", "unchanged", "errors"] as const).map((k) => (
              <Card key={k} padding="md">
                <dt className="text-body-sm text-fg-muted">
                  {t(`platform.masterData.summary.${k}`)}
                </dt>
                <dd className="m-0 font-heading text-h2">{data.summary[k]}</dd>
              </Card>
            ))}
          </dl>
          {data.errors.length > 0 && (
            <Alert tone="danger" title={t("platform.masterData.errorsTitle")}>
              <ul className="m-0 pl-5">
                {data.errors.map((e, i) => (
                  <li key={i}>
                    {t("platform.masterData.errorLine", {
                      line: e.line,
                      field: e.field || "—",
                      message: e.message,
                    })}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {data.sample_changes.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="m-0 font-heading text-h3">{t("platform.masterData.samples")}</h2>
              <ul className="m-0 pl-5">
                {data.sample_changes.map((c) => (
                  <li key={c.code}>
                    {c.code}:{" "}
                    {t(`platform.masterData.action.${c.action}`, { defaultValue: c.action })}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {error && (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          )}
          {data.status === "previewed" && (
            <div>
              <Button loading={confirm.isPending} onClick={() => confirm.mutate()}>
                {t("platform.masterData.confirm")}
              </Button>
            </div>
          )}
          {data.status === "applied" && (
            <Link
              to={`/platform/master-data/${kind}`}
              className={buttonClassName({ variant: "secondary" })}
            >
              {t("platform.masterData.back")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
