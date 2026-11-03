import type {
  Consultation,
  DrugRoute,
  FrequencyCode,
  NoteTemplate,
  SectionField,
} from "@medilink/api-client";
import { Alert, Button, EmptyState, SidePanel, Skeleton } from "@medilink/ui";
import { FloppyDisk, Notebook, Pill } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import type { PickedDiagnosis } from "./DiagnosisPicker";
import {
  itemName,
  SECTION_KEYS,
  TemplateEditor,
  templatesKey,
  useTemplates,
} from "./TemplatesPage";

interface Local {
  sections: Record<SectionField, string>;
  diagnoses: PickedDiagnosis[];
}

/** Template text goes into empty sections, or after what is already written (never replaces). */
export function mergeTemplate(local: Local, tpl: NoteTemplate): Local {
  const sections = { ...local.sections };
  for (const key of SECTION_KEYS) {
    const add = tpl.sections[key]?.trim();
    if (!add) continue;
    const now = sections[key].trim();
    if (!now) sections[key] = add;
    else if (!now.includes(add)) sections[key] = `${now}\n${add}`;
  }
  const diagnoses = [...local.diagnoses];
  for (const code of tpl.diagnosis_codes) {
    if (diagnoses.some((d) => d.code === code)) continue;
    diagnoses.push({
      code,
      rank: diagnoses.some((d) => d.rank === "primary") ? "secondary" : "primary",
      certainty: "provisional",
      label: code,
      isSensitive: false,
    });
  }
  return { sections, diagnoses };
}

/** "Use a template" and "Save as template" in the consultation's action bar (upgrade 05 §3). */
export function TemplateTools({
  c,
  local,
  onApply,
}: {
  c: Consultation;
  local: Local;
  onApply: (next: Local) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const templates = useTemplates(picking);
  const apply = useMutation({
    mutationFn: async (tpl: NoteTemplate) => {
      onApply(mergeTemplate(local, tpl));
      const failed: string[] = [];
      for (const item of tpl.items) {
        try {
          await api.pharmacy.addItem(c.id, {
            ...(item.drug_code
              ? { drug_code: item.drug_code }
              : { free_text_drug: item.free_text_drug ?? itemName(item) }),
            dose: item.dose,
            frequency_code: item.frequency_code as FrequencyCode,
            route: item.route as DrugRoute,
            duration_days: item.duration_days ?? null,
            quantity: item.quantity ?? null,
            instructions: item.instructions ?? "",
          });
        } catch {
          failed.push(itemName(item));
        }
      }
      void api.clinical.templateUsed(tpl.id).catch(() => undefined);
      return failed;
    },
    onSuccess: (failed) => {
      void queryClient.invalidateQueries({ queryKey: ["pharmacy"] });
      void queryClient.invalidateQueries({ queryKey: templatesKey });
      if (failed.length === 0) setPicking(false);
    },
  });
  const rows = templates.data ?? [];
  return (
    <>
      <Button variant="secondary" pill onClick={() => setPicking(true)}>
        <Notebook aria-hidden="true" />
        {t("clinical.templates.use")}
      </Button>
      <Button variant="ghost" pill onClick={() => setSaving(true)}>
        <FloppyDisk aria-hidden="true" />
        {t("clinical.templates.saveAs")}
      </Button>
      <SidePanel
        open={picking}
        onOpenChange={setPicking}
        title={t("clinical.templates.use")}
        closeLabel={t("clinical.close")}
      >
        <div className="flex flex-col gap-3">
          <p className="m-0 text-body-sm text-fg-secondary">{t("clinical.templates.useHint")}</p>
          {apply.data && apply.data.length > 0 && (
            <Alert tone="warning" role="alert">
              {t("clinical.templates.itemsFailed", { names: apply.data.join(", ") })}
            </Alert>
          )}
          {templates.isPending ? (
            <Skeleton height="8rem" className="rounded-2xl" />
          ) : rows.length === 0 ? (
            <EmptyState
              size="inline"
              icon={Notebook}
              title={t("clinical.templates.emptyTitle")}
              description={t("clinical.templates.empty")}
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((tpl) => (
                <li key={tpl.id}>
                  <button
                    type="button"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(tpl)}
                    className="group flex w-full cursor-pointer flex-col gap-1.5 rounded-xl bg-surface p-3.5 text-start ring-1 ring-border transition-[box-shadow,background-color] duration-150 hover:bg-brand-subtle/50 hover:shadow-card disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="font-semibold">{tpl.name}</span>
                    <span className="line-clamp-2 text-body-sm text-fg-secondary">
                      {SECTION_KEYS.map((k) => tpl.sections[k]).find(Boolean)}
                    </span>
                    {(tpl.diagnosis_codes.length > 0 || tpl.items.length > 0) && (
                      <span className="flex flex-wrap gap-1">
                        {tpl.diagnosis_codes.map((code) => (
                          <span
                            key={code}
                            className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-caption font-semibold"
                          >
                            {code}
                          </span>
                        ))}
                        {tpl.items.map((item, i) => (
                          <span
                            key={`${itemName(item)}-${i}`}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-on-brand-subtle"
                          >
                            <Pill aria-hidden="true" className="size-3" />
                            {itemName(item)}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SidePanel>
      {saving && (
        <TemplateEditor
          open
          onOpenChange={setSaving}
          initial={{
            name: "",
            sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, local.sections[k]])),
            diagnosis_codes: local.diagnoses.map((d) => d.code),
            items: [],
          }}
        />
      )}
    </>
  );
}
