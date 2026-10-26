import type { InsurerRule, Tariff, TariffKind } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  Dialog,
  EmptyState,
  formatRwf,
  MoneyField,
  SelectField,
  SidePanel,
  SwitchField,
  TextField,
} from "@medilink/ui";
import {
  ClockCounterClockwise,
  PencilSimple,
  Plus,
  Receipt,
  ShieldCheck,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import {
  errorText,
  fieldErrors,
  formatDate,
  QueryState,
  SetupGate,
  setupKeys,
  todayIso,
  useLocale,
  useLocalName,
} from "./shared";

const KINDS: TariffKind[] = ["service", "procedure", "medicine", "other"];
export const INSURERS = ["mutuelle", "rssb", "mmi", "radiant"];
const back = (t: (k: string) => string) => ({ to: "/settings", label: t("setup.settings.title") });

/** /settings/tariffs (S2-F6, FR-BIL-05): the price list; prices change from a date, with history. */
export function TariffsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const locale = useLocale();
  const tariffs = useQuery({ queryKey: setupKeys.tariffs, queryFn: () => api.setup.tariffs() });
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<Tariff | null>(null);
  const [history, setHistory] = useState<Tariff | null>(null);
  const [filter, setFilter] = useState<TariffKind | "">("");
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.tariffs.title")}
          description={t("setup.tariffs.intro")}
          back={back(t)}
          actions={
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" weight="bold" />
              {t("setup.tariffs.add")}
            </Button>
          }
        />
        <QueryState query={tariffs}>
          {(data) => {
            const rows = data.results.filter((row) => !filter || row.kind === filter);
            const total = data.results.length;
            return total === 0 ? (
              <EmptyState
                icon={Receipt}
                title={t("setup.tariffs.emptyTitle")}
                description={t("setup.tariffs.empty")}
              />
            ) : (
              <>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label={t("setup.tariffs.kind")}
                >
                  {(["", ...KINDS] as const).map((k) => (
                    <button
                      key={k || "all"}
                      type="button"
                      aria-pressed={filter === k}
                      onClick={() => setFilter(k)}
                      className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg-secondary hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
                    >
                      {k ? t(`setup.tariffs.kinds.${k}`) : t("setup.tariffs.all")}
                      <span className="ml-1.5 tabular-nums opacity-70">
                        {k ? data.results.filter((row) => row.kind === k).length : total}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                  <table className="w-full border-collapse text-left">
                    <caption className="sr-only">
                      {t("setup.settings.sections.tariffs.title")}
                    </caption>
                    <thead className="bg-subtle text-body-sm text-fg-secondary">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          {t("setup.tariffs.item")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          {t("setup.tariffs.kind")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                          {t("setup.tariffs.price")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          {t("setup.tariffs.since")}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          <span className="sr-only">{t("setup.schedules.actions")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <span className="block font-semibold">{name(row.name_i18n)}</span>
                            <span className="font-mono text-caption text-fg-muted">{row.code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone="neutral">{t(`setup.tariffs.kinds.${row.kind}`)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {formatRwf(row.amount_rwf, locale)}
                          </td>
                          <td className="px-4 py-3 text-body-sm text-fg-secondary tabular-nums">
                            {formatDate(row.valid_from, locale)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                onClick={() => setChanging(row)}
                                aria-label={`${t("setup.tariffs.change")}: ${name(row.name_i18n)}`}
                              >
                                <PencilSimple aria-hidden="true" />
                                <span className="hidden md:inline">
                                  {t("setup.tariffs.change")}
                                </span>
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setHistory(row)}
                                aria-label={`${t("setup.tariffs.history")}: ${name(row.name_i18n)}`}
                              >
                                <ClockCounterClockwise aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </QueryState>
        {adding && <AddTariff onClose={() => setAdding(false)} />}
        {changing && <ChangePrice tariff={changing} onClose={() => setChanging(null)} />}
        {history && <TariffHistory tariff={history} onClose={() => setHistory(null)} />}
      </div>
    </SetupGate>
  );
}

function AddTariff({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const name = useLocalName();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const services = useQuery({ queryKey: setupKeys.services, queryFn: () => api.setup.services() });
  const [form, setForm] = useState({
    code: "",
    kind: "service" as TariffKind,
    service_id: "",
    amount: null as number | null,
    valid_from: todayIso(),
    names: { rw: "", en: "", fr: "" },
  });
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.setup.addTariff({
          code: form.code.trim(),
          kind: form.kind,
          service_id: form.service_id || null,
          amount_rwf: form.amount ?? 0,
          valid_from: form.valid_from,
          name_i18n: form.names,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.tariffs });
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.tariffs.add")}
      closeLabel={t("setup.close")}
      footer={
        <Button type="submit" form="tariff-form" disabled={save.isPending || form.amount === null}>
          {t("setup.save")}
        </Button>
      }
    >
      <form
        id="tariff-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-wrap gap-4">
          <TextField
            label={t("setup.tariffs.code")}
            hint={t("setup.tariffs.codeHint")}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            error={errors.code}
            className="w-48"
            inputClassName="font-mono"
          />
          <SelectField
            label={t("setup.tariffs.kind")}
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TariffKind }))}
            className="w-48"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`setup.tariffs.kinds.${k}`)}
              </option>
            ))}
          </SelectField>
        </div>
        {(["rw", "en", "fr"] as const).map((lang) => (
          <TextField
            key={lang}
            label={`${t("setup.tariffs.name")} (${t(`setup.languages.${lang}`)})`}
            value={form.names[lang]}
            onChange={(e) =>
              setForm((f) => ({ ...f, names: { ...f.names, [lang]: e.target.value } }))
            }
            error={errors[`name_i18n.${lang}`]}
          />
        ))}
        {form.kind === "service" && (
          <SelectField
            label={t("setup.tariffs.service")}
            optional
            value={form.service_id}
            onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}
          >
            <option value="">—</option>
            {(services.data?.results ?? [])
              .filter((s) => s.is_active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {name(s.name_i18n)}
                </option>
              ))}
          </SelectField>
        )}
        <div className="flex flex-wrap gap-4">
          <MoneyField
            label={t("setup.tariffs.price")}
            value={form.amount}
            onChange={(amount) => setForm((f) => ({ ...f, amount }))}
            error={errors.amount_rwf}
            locale={locale}
          />
          <TextField
            type="date"
            label={t("setup.tariffs.validFrom")}
            value={form.valid_from}
            onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
            className="w-48"
          />
        </div>
        {save.isError &&
          Object.keys(errors).length === 0 &&
          errorText(save.error, t("setup.failed")) && (
            <Alert tone="danger" role="alert">
              {errorText(save.error, t("setup.failed"))}
            </Alert>
          )}
      </form>
    </SidePanel>
  );
}

function ChangePrice({ tariff, onClose }: { tariff: Tariff; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const name = useLocalName();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [amount, setAmount] = useState<number | null>(tariff.amount_rwf);
  const [from, setFrom] = useState(todayIso());
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.setup.changeTariff(tariff.id, {
          version: tariff.version,
          amount_rwf: amount ?? 0,
          valid_from: from,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.tariffs });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.tariffs.changeTitle", { name: name(tariff.name_i18n) })}
      description={t("setup.tariffs.changeHint", { amount: formatRwf(tariff.amount_rwf, locale) })}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button type="submit" form="price-form" disabled={save.isPending || amount === null}>
            {t("setup.tariffs.saveChange")}
          </Button>
        </>
      }
    >
      <form
        id="price-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-wrap gap-4"
      >
        <MoneyField
          label={t("setup.tariffs.newPrice")}
          value={amount}
          onChange={setAmount}
          error={errors.amount_rwf}
          locale={locale}
        />
        <TextField
          type="date"
          label={t("setup.tariffs.validFrom")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          error={errors.valid_from}
          className="w-48"
        />
        {save.isError &&
          Object.keys(errors).length === 0 &&
          errorText(save.error, t("setup.failed")) && (
            <Alert tone="danger" role="alert" className="w-full">
              {errorText(save.error, t("setup.failed"))}
            </Alert>
          )}
      </form>
    </Dialog>
  );
}

function TariffHistory({ tariff, onClose }: { tariff: Tariff; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const name = useLocalName();
  const history = useQuery({
    queryKey: ["setup", "tariff-history", tariff.code],
    queryFn: () => api.setup.tariffHistory(tariff.code),
  });
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.tariffs.historyTitle", { name: name(tariff.name_i18n) })}
      closeLabel={t("setup.close")}
    >
      <QueryState query={history}>
        {(data) => (
          <ol className="m-0 flex list-none flex-col gap-0 border-l-2 border-border p-0 pl-4">
            {data.results.map((row) => (
              <li key={row.id} className="relative pb-4 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-surface ${row.valid_to ? "bg-fg-muted" : "bg-primary"}`}
                />
                <p className="m-0 font-semibold tabular-nums">
                  {formatRwf(row.amount_rwf, locale)}
                </p>
                <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
                  {formatDate(row.valid_from, locale)} –{" "}
                  {row.valid_to ? formatDate(row.valid_to, locale) : t("setup.tariffs.current")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </SidePanel>
  );
}

// ---- insurers --------------------------------------------------------------------------------

/** /settings/insurers (S2-F6, FR-BIL-02): what each insurer covers here, from a date. */
export function InsurersPage() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const rules = useQuery({ queryKey: setupKeys.rules, queryFn: () => api.setup.insurerRules() });
  const [editing, setEditing] = useState<InsurerRule | "new" | null>(null);
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.insurers.title")}
          description={t("setup.insurers.intro")}
          back={back(t)}
          actions={
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" weight="bold" />
              {t("setup.insurers.add")}
            </Button>
          }
        />
        <QueryState query={rules}>
          {(data) =>
            data.results.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title={t("setup.insurers.emptyTitle")}
                description={t("setup.insurers.empty")}
              />
            ) : (
              <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
                {data.results.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="m-0 font-heading text-h3">
                          {t(`patients.insurers.${rule.insurer_code}`, {
                            defaultValue: rule.insurer_code,
                          })}
                        </h2>
                        <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
                          {t("setup.insurers.since", { date: formatDate(rule.valid_from, locale) })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing(rule)}
                        aria-label={`${t("setup.edit")}: ${rule.insurer_code}`}
                      >
                        <PencilSimple aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex items-end gap-6">
                      <div>
                        <p className="m-0 font-heading text-display leading-none tabular-nums">
                          {rule.patient_share_bp / 100}%
                        </p>
                        <p className="m-0 mt-1 text-body-sm text-fg-secondary">
                          {t("setup.insurers.patientPays")}
                        </p>
                      </div>
                      <div>
                        <p className="m-0 font-heading text-h1 leading-none text-fg-secondary tabular-nums">
                          {100 - rule.patient_share_bp / 100}%
                        </p>
                        <p className="m-0 mt-1 text-body-sm text-fg-secondary">
                          {t("setup.insurers.insurerPays")}
                        </p>
                      </div>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-brand-subtle"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full bg-warning"
                        style={{ width: `${rule.patient_share_bp / 100}%` }}
                      />
                    </div>
                    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                      <li>
                        <Badge tone="brand">
                          {rule.applies_to_all_services
                            ? t("setup.insurers.allServices")
                            : t("setup.insurers.someServices", { count: rule.service_ids.length })}
                        </Badge>
                      </li>
                      {rule.requires_referral && (
                        <li>
                          <Badge tone="warning">{t("setup.insurers.referral")}</Badge>
                        </li>
                      )}
                      {rule.ceiling_per_visit_rwf !== null && (
                        <li>
                          <Badge tone="info">
                            {t("setup.insurers.ceiling", {
                              amount: formatRwf(rule.ceiling_per_visit_rwf, locale),
                            })}
                          </Badge>
                        </li>
                      )}
                      {rule.excluded_tariff_codes.length > 0 && (
                        <li>
                          <Badge tone="neutral">
                            {t("setup.insurers.exclusions", {
                              count: rule.excluded_tariff_codes.length,
                            })}
                          </Badge>
                        </li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
        {editing && (
          <RuleEditor rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
        )}
      </div>
    </SetupGate>
  );
}

function RuleEditor({ rule, onClose }: { rule: InsurerRule | null; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const name = useLocalName();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const services = useQuery({ queryKey: setupKeys.services, queryFn: () => api.setup.services() });
  const tariffs = useQuery({ queryKey: setupKeys.tariffs, queryFn: () => api.setup.tariffs() });
  const [form, setForm] = useState({
    insurer_code: rule?.insurer_code ?? INSURERS[0]!,
    share: rule ? String(rule.patient_share_bp / 100) : "10",
    applies_to_all_services: rule?.applies_to_all_services ?? true,
    service_ids: rule?.service_ids ?? [],
    requires_referral: rule?.requires_referral ?? false,
    excluded_tariff_codes: rule?.excluded_tariff_codes ?? [],
    ceiling: rule?.ceiling_per_visit_rwf ?? null,
    valid_from: todayIso(),
  });
  const shareNumber = Number(form.share.replace(",", "."));
  const shareError = !(shareNumber >= 0 && shareNumber <= 100)
    ? t("setup.insurers.shareRange")
    : undefined;
  const save = useMutation({
    mutationFn: () => {
      const body = {
        insurer_code: form.insurer_code,
        patient_share_bp: Math.round(shareNumber * 100),
        applies_to_all_services: form.applies_to_all_services,
        service_ids: form.applies_to_all_services ? [] : form.service_ids,
        requires_referral: form.requires_referral,
        excluded_tariff_codes: form.excluded_tariff_codes,
        ceiling_per_visit_rwf: form.ceiling,
        valid_from: form.valid_from,
      };
      return withStepUp(async () => {
        if (rule) await api.setup.changeInsurerRule(rule.id, { ...body, version: rule.version });
        else await api.setup.addInsurerRule(body);
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.rules });
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list, value] : list.filter((x) => x !== value);
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        rule
          ? t(`patients.insurers.${rule.insurer_code}`, { defaultValue: rule.insurer_code })
          : t("setup.insurers.add")
      }
      closeLabel={t("setup.close")}
      footer={
        <Button type="submit" form="rule-form" disabled={save.isPending || Boolean(shareError)}>
          {t("setup.save")}
        </Button>
      }
    >
      <form
        id="rule-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!shareError) save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        {!rule && (
          <SelectField
            label={t("setup.insurers.insurer")}
            value={form.insurer_code}
            onChange={(e) => setForm((f) => ({ ...f, insurer_code: e.target.value }))}
          >
            {INSURERS.map((code) => (
              <option key={code} value={code}>
                {t(`patients.insurers.${code}`)}
              </option>
            ))}
          </SelectField>
        )}
        <div className="flex flex-wrap gap-4">
          <TextField
            label={t("setup.insurers.share")}
            hint={t("setup.insurers.shareHint")}
            inputMode="decimal"
            value={form.share}
            onChange={(e) => setForm((f) => ({ ...f, share: e.target.value }))}
            error={shareError ?? errors.patient_share_bp}
            className="w-40"
            inputClassName="tabular-nums"
          />
          <TextField
            type="date"
            label={t("setup.tariffs.validFrom")}
            value={form.valid_from}
            onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
            className="w-48"
          />
        </div>
        <SwitchField
          label={t("setup.insurers.allServices")}
          checked={form.applies_to_all_services}
          onCheckedChange={(v) => setForm((f) => ({ ...f, applies_to_all_services: v }))}
        />
        {!form.applies_to_all_services && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 font-semibold">
              {t("setup.insurers.coveredServices")}
            </legend>
            {(services.data?.results ?? [])
              .filter((s) => s.is_active)
              .map((s) => (
                <CheckboxField
                  key={s.id}
                  label={name(s.name_i18n)}
                  checked={form.service_ids.includes(s.id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      service_ids: toggle(f.service_ids, s.id, e.target.checked),
                    }))
                  }
                />
              ))}
          </fieldset>
        )}
        <SwitchField
          label={t("setup.insurers.referral")}
          checked={form.requires_referral}
          onCheckedChange={(v) => setForm((f) => ({ ...f, requires_referral: v }))}
        />
        <MoneyField
          label={t("setup.insurers.ceilingLabel")}
          optional
          value={form.ceiling}
          onChange={(ceiling) => setForm((f) => ({ ...f, ceiling }))}
          locale={locale}
        />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 font-semibold">{t("setup.insurers.excluded")}</legend>
          {(tariffs.data?.results ?? []).map((row) => (
            <CheckboxField
              key={row.id}
              label={`${name(row.name_i18n)} (${row.code})`}
              checked={form.excluded_tariff_codes.includes(row.code)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  excluded_tariff_codes: toggle(
                    f.excluded_tariff_codes,
                    row.code,
                    e.target.checked,
                  ),
                }))
              }
            />
          ))}
        </fieldset>
        {save.isError &&
          Object.keys(errors).length === 0 &&
          errorText(save.error, t("setup.failed")) && (
            <Alert tone="danger" role="alert">
              {errorText(save.error, t("setup.failed"))}
            </Alert>
          )}
      </form>
    </SidePanel>
  );
}
