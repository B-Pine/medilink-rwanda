import {
  DRUG_ROUTES,
  FREQUENCY_CODES,
  isApiError,
  type DrugRoute,
  type FrequencyCode,
  type NoteTemplate,
  type NoteTemplateInput,
  type NoteTemplateItem,
  type TemplateSections,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  SelectField,
  SidePanel,
  Skeleton,
  TextareaField,
  TextField,
} from "@medilink/ui";
import { Flask, Notebook, PencilSimple, Pill, Plus, Trash, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, useCan } from "./shared";

export const templatesKey = ["clinical", "templates"] as const;

export const SECTION_KEYS: (keyof TemplateSections)[] = [
  "history_text",
  "examination_text",
  "plan_text",
  "patient_instructions_text",
];

export function useTemplates(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: templatesKey, queryFn: () => api.clinical.templates(), enabled });
}

export const itemName = (item: NoteTemplateItem) =>
  item.drug_display || item.free_text_drug || item.drug_code || "";

/** One medicine for a template: catalogue search or a typed name, then dose and frequency. */
function ItemForm({ onAdd }: { onAdd: (item: NoteTemplateItem) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ code: string; display: string } | null>(null);
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState<FrequencyCode>("tds");
  const [route, setRoute] = useState<DrugRoute>("oral");
  const [days, setDays] = useState("");
  const [tried, setTried] = useState(false);
  const q = useDeferredValue(search.trim());
  const drugs = useQuery({
    queryKey: ["pharmacy", "drugs", q],
    queryFn: () => api.pharmacy.drugs(q),
    enabled: q.length >= 2 && !picked,
  });
  const add = () => {
    setTried(true);
    if (!(picked || search.trim()) || !dose.trim()) return;
    onAdd({
      ...(picked
        ? { drug_code: picked.code, drug_display: picked.display }
        : { free_text_drug: search.trim(), drug_display: search.trim() }),
      dose: dose.trim(),
      frequency_code: frequency,
      route,
      duration_days: days ? Number(days) : null,
    });
    setSearch("");
    setPicked(null);
    setDose("");
    setDays("");
    setTried(false);
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-subtle/70 p-3">
      {picked ? (
        <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
          <Pill aria-hidden="true" className="size-4 text-fg-secondary" />
          <span className="flex-1 font-semibold">{picked.display}</span>
          <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
            {t("clinical.templates.change")}
          </Button>
        </div>
      ) : (
        <>
          <TextField
            type="search"
            label={t("clinical.templates.drug")}
            hint={t("clinical.templates.drugHint")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            error={tried && !search.trim() ? t("clinical.templates.drugRequired") : undefined}
          />
          {q.length >= 2 && (drugs.data ?? []).length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {(drugs.data ?? []).slice(0, 5).map((d) => (
                <li key={d.code}>
                  <button
                    type="button"
                    onClick={() => setPicked({ code: d.code, display: d.display })}
                    className="w-full cursor-pointer rounded-lg bg-surface px-3 py-2 text-start text-body-sm font-semibold transition-colors hover:bg-brand-subtle"
                  >
                    {d.display}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <TextField
          label={t("pharmacy.prescription.dose")}
          value={dose}
          maxLength={60}
          onChange={(e) => setDose(e.target.value)}
          error={tried && !dose.trim() ? t("pharmacy.prescription.doseRequired") : undefined}
        />
        <SelectField
          label={t("pharmacy.prescription.frequency")}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as FrequencyCode)}
        >
          {FREQUENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {t(`pharmacy.frequency.${code}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("pharmacy.prescription.route")}
          value={route}
          onChange={(e) => setRoute(e.target.value as DrugRoute)}
        >
          {DRUG_ROUTES.map((code) => (
            <option key={code} value={code}>
              {t(`pharmacy.route.${code}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          type="number"
          inputMode="numeric"
          min={1}
          label={t("pharmacy.prescription.days")}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </div>
      <Button variant="secondary" pill className="self-start" onClick={add}>
        <Plus aria-hidden="true" weight="bold" />
        {t("clinical.templates.addMedicine")}
      </Button>
    </div>
  );
}

/** Create or edit a template; also used by "Save as template" in the consultation. */
export function TemplateEditor({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: (Partial<NoteTemplateInput> & { id?: string }) | null;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [sections, setSections] = useState<Partial<TemplateSections>>(initial?.sections ?? {});
  const [codes, setCodes] = useState((initial?.diagnosis_codes ?? []).join(", "));
  const [items, setItems] = useState<NoteTemplateItem[]>(initial?.items ?? []);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const body: NoteTemplateInput = {
        name: name.trim(),
        sections,
        diagnosis_codes: codes
          .split(/[\s,;]+/)
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 5),
        items,
        // lab tests (W3 extension point) have no editor yet: keep what the template holds
        tests: initial?.tests ?? [],
      };
      return initial?.id
        ? api.clinical.updateTemplate(initial.id, body)
        : api.clinical.createTemplate(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templatesKey });
      onOpenChange(false);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (name.trim()) save.mutate();
  };
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? t("clinical.templates.edit") : t("clinical.templates.new")}
      closeLabel={t("clinical.close")}
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={t("clinical.templates.name")}
          hint={t("clinical.templates.nameHint")}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          error={tried && !name.trim() ? t("clinical.templates.nameRequired") : undefined}
        />
        {SECTION_KEYS.map((key) => (
          <TextareaField
            key={key}
            label={t(`clinical.templates.sections.${key}`)}
            rows={key === "patient_instructions_text" ? 2 : 3}
            maxLength={4000}
            value={sections[key] ?? ""}
            onChange={(e) => setSections({ ...sections, [key]: e.target.value })}
          />
        ))}
        <TextField
          label={t("clinical.templates.codes")}
          hint={t("clinical.templates.codesHint")}
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
        />
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-2 font-semibold">{t("clinical.templates.medicines")}</legend>
          {items.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {items.map((item, index) => (
                <li
                  key={`${itemName(item)}-${index}`}
                  className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-border"
                >
                  <Pill aria-hidden="true" className="size-4 text-fg-secondary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-sm font-semibold">{itemName(item)}</span>
                    <span className="text-caption text-fg-secondary">
                      {item.dose} · {t(`pharmacy.frequency.${item.frequency_code}`)}
                      {item.duration_days
                        ? ` · ${t("clinical.reasonForVisit.days", { count: item.duration_days })}`
                        : ""}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t("clinical.templates.remove")}: ${itemName(item)}`}
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {items.length < 10 && <ItemForm onAdd={(item) => setItems([...items, item])} />}
        </fieldset>
        {save.isError && (
          <Alert tone="danger" role="alert">
            {isApiError(save.error) && save.error.status === 409
              ? t("clinical.templates.duplicate")
              : errorText(save.error, t("errors.generic"))}
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="submit" pill loading={save.isPending}>
            {t("clinical.templates.save")}
          </Button>
          <Button variant="ghost" pill onClick={() => onOpenChange(false)}>
            {t("clinical.cancel")}
          </Button>
        </div>
      </form>
    </SidePanel>
  );
}

function TemplateCard({
  template: tpl,
  onEdit,
  onDelete,
}: {
  template: NoteTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const preview = SECTION_KEYS.map((k) => tpl.sections[k]).find(Boolean) ?? "";
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card transition-shadow duration-200 ease-out-quint hover:shadow-raised">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
          <Notebook aria-hidden="true" weight="bold" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-heading text-h3 font-semibold">{tpl.name}</span>
          <span className="text-caption text-fg-muted tabular-nums">
            {t("clinical.templates.used", { count: tpl.use_count })}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t("clinical.templates.edit")}: ${tpl.name}`}
          onClick={onEdit}
        >
          <PencilSimple aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t("clinical.templates.delete")}: ${tpl.name}`}
          onClick={onDelete}
        >
          <Trash aria-hidden="true" />
        </Button>
      </div>
      {preview && <p className="m-0 line-clamp-2 text-body-sm text-fg-secondary">{preview}</p>}
      {(tpl.diagnoses.length > 0 || tpl.items.length > 0 || tpl.tests.length > 0) && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {tpl.diagnoses.map((d) => (
            <li
              key={d.code}
              title={d.display}
              className="rounded-md bg-subtle px-2 py-0.5 font-mono text-caption font-semibold"
            >
              {d.code}
            </li>
          ))}
          {tpl.items.map((item, i) => (
            <li
              key={`${itemName(item)}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2.5 py-0.5 text-caption font-semibold text-on-brand-subtle"
            >
              <Pill aria-hidden="true" className="size-3" />
              {itemName(item)}
            </li>
          ))}
          {tpl.tests.map((test) => (
            <li
              key={test.code}
              className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-0.5 text-caption font-semibold text-fg-secondary"
            >
              <Flask aria-hidden="true" className="size-3" />
              {test.name || test.code}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** /clinical/templates (upgrade 05 §3): my note templates and favourite prescriptions. */
export function TemplatesPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const allowed = useCan("clinical.write");
  const list = useTemplates(allowed);
  const [editing, setEditing] = useState<NoteTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<NoteTemplate | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.clinical.deleteTemplate(id),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: templatesKey });
    },
  });
  if (!allowed) return <NoAccessContent />;
  const rows = list.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("clinical.templates.title")}
        description={t("clinical.templates.intro")}
        actions={
          <Button pill onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" weight="bold" />
            {t("clinical.templates.new")}
          </Button>
        }
      />
      {list.isPending ? (
        <Skeleton height="10rem" className="rounded-2xl" />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Notebook}
          title={t("clinical.templates.emptyTitle")}
          description={t("clinical.templates.empty")}
        />
      ) : (
        <ul className="ml-stagger m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onEdit={() => setEditing(tpl)}
              onDelete={() => setDeleting(tpl)}
            />
          ))}
        </ul>
      )}
      {editing && (
        <TemplateEditor
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initial={editing === "new" ? null : editing}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("clinical.templates.deleteTitle", { name: deleting?.name ?? "" })}
        consequences={t("clinical.templates.deleteBody")}
        confirmLabel={t("clinical.templates.delete")}
        cancelLabel={t("clinical.cancel")}
        closeLabel={t("clinical.close")}
        tone="danger"
        busy={remove.isPending}
        error={errorText(remove.error, t("errors.generic"))}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
