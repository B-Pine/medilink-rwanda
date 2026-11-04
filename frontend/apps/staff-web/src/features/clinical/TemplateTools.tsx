import type {
  Consultation,
  DrugRoute,
  FrequencyCode,
  NoteTemplate,
  Prescription,
} from "@medilink/api-client";
import { Button, EmptyState, SidePanel, Skeleton } from "@medilink/ui";
import { Flask, FloppyDisk, Notebook, Pill } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { pharmacyKeys } from "../pharmacy/shared";
import { OrderSetSummary } from "./OrderSetSummary";
import {
  medicineName,
  mergeOrderSet,
  onPrescription,
  ORDER_SET_SECTIONS,
  templateItems,
  type DraftFields,
  type OrderSetReport,
} from "./orderSet";
import { TemplateEditor, templatesKey, useTemplates } from "./TemplatesPage";

/**
 * "Use a template" and "Save as template" in the consultation's action bar (upgrade 05 §3).
 * A template is an order set (W3, #202): one click adds its diagnoses (provisional), plan,
 * instructions and medicines to the draft. The doctor still edits everything and signs; the
 * panel then lists what was added and what was not, so nothing is skipped silently.
 */
export function TemplateTools({
  c,
  local,
  onApply,
}: {
  c: Consultation;
  local: DraftFields;
  onApply: (next: DraftFields) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<OrderSetReport | null>(null);
  const templates = useTemplates(picking);
  const rxKey = pharmacyKeys.forConsultation(c.id);
  const currentItems = () => queryClient.getQueryData<Prescription | null>(rxKey)?.items ?? [];

  const apply = useMutation({
    mutationFn: async (tpl: NoteTemplate) => {
      const { next, report: done } = mergeOrderSet(local, tpl);
      onApply(next);
      setReport(done);
      let items = currentItems();
      for (const item of tpl.items) {
        const name = medicineName(item);
        if (onPrescription(item, items)) {
          done.medicinesAlready.push(name);
          continue;
        }
        try {
          const rx = await api.pharmacy.addItem(c.id, {
            ...(item.drug_code
              ? { drug_code: item.drug_code }
              : { free_text_drug: item.free_text_drug || name }),
            dose: item.dose,
            frequency_code: item.frequency_code as FrequencyCode,
            route: item.route as DrugRoute,
            duration_days: item.duration_days ?? null,
            quantity: item.quantity ?? null,
            instructions: item.instructions ?? "",
          });
          queryClient.setQueryData(rxKey, rx);
          items = rx.items;
          done.medicinesAdded.push(name);
        } catch {
          done.medicinesFailed.push(name);
        }
        setReport({ ...done });
      }
      void api.clinical.templateUsed(tpl.id).catch(() => undefined);
      return done;
    },
    onSuccess: (done) => {
      setReport({ ...done });
      void queryClient.invalidateQueries({ queryKey: rxKey });
      void queryClient.invalidateQueries({ queryKey: templatesKey });
    },
  });
  const rows = templates.data ?? [];
  const close = (open: boolean) => {
    setPicking(open);
    if (!open) setReport(null);
  };
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
        onOpenChange={close}
        title={t("clinical.templates.use")}
        closeLabel={t("clinical.close")}
      >
        {report ? (
          <OrderSetSummary
            report={report}
            busy={apply.isPending}
            onDone={() => close(false)}
            onAnother={() => setReport(null)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-body-sm text-fg-secondary">{t("clinical.templates.useHint")}</p>
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
                        {ORDER_SET_SECTIONS.map((k) => tpl.sections[k]).find(Boolean)}
                      </span>
                      {(tpl.diagnoses.length > 0 ||
                        tpl.items.length > 0 ||
                        tpl.tests.length > 0) && (
                        <span className="flex flex-wrap gap-1">
                          {tpl.diagnoses.map((d) => (
                            <span
                              key={d.code}
                              title={d.display}
                              className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-caption font-semibold"
                            >
                              {d.code}
                            </span>
                          ))}
                          {tpl.items.map((item, i) => (
                            <span
                              key={`${medicineName(item)}-${i}`}
                              className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-on-brand-subtle"
                            >
                              <Pill aria-hidden="true" className="size-3" />
                              {medicineName(item)}
                            </span>
                          ))}
                          {tpl.tests.map((test) => (
                            <span
                              key={test.code}
                              className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-caption font-semibold text-fg-secondary"
                            >
                              <Flask aria-hidden="true" className="size-3" />
                              {test.name || test.code}
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
        )}
      </SidePanel>
      {saving && (
        <TemplateEditor
          open
          onOpenChange={setSaving}
          initial={{
            name: "",
            sections: Object.fromEntries(ORDER_SET_SECTIONS.map((k) => [k, local.sections[k]])),
            diagnosis_codes: local.diagnoses.map((d) => d.code),
            items: templateItems(currentItems()),
          }}
        />
      )}
    </>
  );
}
