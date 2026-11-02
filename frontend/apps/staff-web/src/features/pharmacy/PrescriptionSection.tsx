import {
  defaultQuantity,
  DRUG_ROUTES,
  FREQUENCY_CODES,
  isApiError,
  OPEN_ITEM_STATUSES,
  type Consultation,
  type DrugRoute,
  type DrugRow,
  type FrequencyCode,
  type Prescription,
  type PrescriptionAlert,
  type PrescriptionItem,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  cx,
  LoadingState,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@medilink/ui";
import { Plus, Storefront, Trash, Warning, WarningOctagon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStepUp } from "../lock";
import { ItemFlags, ItemLine } from "./DispensePage";
import { errorText, ITEM_TONE, pharmacyKeys, STATUS_TONE, useCan } from "./shared";

/**
 * The consultation's Prescription section (S7-F1, FR-PHA-01, FR-CLN-07), mounted by the S6 page in
 * its `[S7]` slot. While the consultation is a draft the author adds and removes items; each save
 * returns the alerts, and an allergy alert needs a reason before Sign. Signing issues it. After
 * that the items are read-only: cancel with a reason, or change (cancel + a new item).
 */
export function PrescriptionSection({ consultation: c }: { consultation: Consultation }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const canIssue = useCan("prescription.issue");
  const key = pharmacyKeys.forConsultation(c.id);
  const rx = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        return await api.pharmacy.forConsultation(c.id);
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
  });
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<PrescriptionItem | null>(null);
  const [cancelling, setCancelling] = useState<{ item: PrescriptionItem; change: boolean } | null>(
    null,
  );
  const set = (data: Prescription | null) => queryClient.setQueryData(key, data);
  const draft = c.status === "draft";
  const canEdit = draft && c.can_edit && canIssue;
  const p = rx.data ?? null;

  const remove = useMutation({
    mutationFn: (item: PrescriptionItem) => api.pharmacy.removeItem(item.id, p!.version),
    onSuccess: set,
  });
  const cancel = useMutation({
    mutationFn: ({ item, reason }: { item: PrescriptionItem; reason: string }) =>
      api.pharmacy.cancelItem(item.id, { version: p!.version, reason }),
    onSuccess: (data, { item }) => {
      set(data);
      if (cancelling?.change) setReplacing(item);
      setCancelling(null);
    },
  });

  if (c.status === "entered_in_error") return null;
  const items = p?.items.filter((i) => i.status !== "cancelled") ?? [];
  const cancelled = p?.items.filter((i) => i.status === "cancelled") ?? [];
  const showForm = (canEdit && adding) || (!draft && canIssue && replacing !== null);

  return (
    <section
      id="prescription"
      tabIndex={-1}
      aria-labelledby="prescription-title"
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="prescription-title" className="m-0 text-h3">
          {t("pharmacy.prescription.title")}
        </h2>
        {p && p.status !== "draft" && (
          <Badge tone={STATUS_TONE[p.status]}>{t(`pharmacy.status.${p.status}`)}</Badge>
        )}
        {p?.number && <span className="font-mono text-body-sm text-fg-muted">{p.number}</span>}
      </div>

      {rx.isPending ? (
        <LoadingState label={t("pharmacy.loading")} />
      ) : rx.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(rx.error, t("errors.generic"))}
        </Alert>
      ) : (
        <>
          {items.length ? (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  alerts={p!.alerts.filter((a) => a.item_id === item.id)}
                  prescription={p!}
                  canEdit={canEdit}
                  onSaved={set}
                  onRemove={() => remove.mutate(item)}
                  onCancel={
                    !draft &&
                    canIssue &&
                    OPEN_ITEM_STATUSES.includes(item.status) &&
                    item.dispensed_quantity === 0
                      ? (change) => setCancelling({ item, change })
                      : undefined
                  }
                />
              ))}
            </ol>
          ) : (
            <p className="m-0 text-fg-muted">
              {draft ? t("pharmacy.prescription.empty") : t("pharmacy.prescription.none")}
            </p>
          )}
          {cancelled.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm text-fg-muted">
              {cancelled.map((i) => (
                <li key={i.id}>
                  <s>{i.drug_display}</s> · {t("pharmacy.itemStatus.cancelled")}
                  {i.cancelled_reason && `: ${i.cancelled_reason}`}
                </li>
              ))}
            </ul>
          )}
          {remove.isError && (
            <Alert tone="danger" role="alert">
              {errorText(remove.error, t("errors.generic"))}
            </Alert>
          )}
          {showForm ? (
            <AddItem
              consultation={c}
              replaces={replacing}
              afterIssue={!draft}
              onDone={(data) => {
                if (data) set(data);
                setAdding(false);
                setReplacing(null);
              }}
            />
          ) : (
            canEdit && (
              <Button variant="secondary" className="self-start" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" weight="bold" className="size-icon" />
                {t("pharmacy.prescription.add")}
              </Button>
            )
          )}
        </>
      )}
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={
          cancelling?.change
            ? t("pharmacy.prescription.changeTitle", { name: cancelling.item.drug_display })
            : t("pharmacy.prescription.cancelTitle", { name: cancelling?.item.drug_display ?? "" })
        }
        consequences={
          cancelling?.change
            ? t("pharmacy.prescription.changeConsequences")
            : t("pharmacy.prescription.cancelConsequences")
        }
        confirmLabel={
          cancelling?.change ? t("pharmacy.prescription.change") : t("pharmacy.prescription.cancel")
        }
        cancelLabel={t("pharmacy.keep")}
        closeLabel={t("pharmacy.close")}
        tone="danger"
        reasonLabel={t("pharmacy.reason")}
        reasonRequired
        reasonRequiredMessage={t("pharmacy.reasonMin")}
        busy={cancel.isPending}
        error={errorText(cancel.error, t("errors.generic"))}
        onConfirm={(reason) => cancelling && cancel.mutate({ item: cancelling.item, reason })}
      />
    </section>
  );
}

function ItemRow({
  item,
  alerts,
  prescription,
  canEdit,
  onSaved,
  onRemove,
  onCancel,
}: {
  item: PrescriptionItem;
  alerts: PrescriptionAlert[];
  prescription: Prescription;
  canEdit: boolean;
  onSaved: (data: Prescription) => void;
  onRemove: () => void;
  onCancel?: (change: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{item.drug_display}</span>
          <ItemLine item={item} />
          <span className="text-body-sm text-fg-muted">
            {t("pharmacy.item.quantity", { count: item.quantity })}
            {item.instructions && ` · ${item.instructions}`}
          </span>
        </div>
        {item.status !== "draft" && (
          <Badge tone={ITEM_TONE[item.status]}>
            {item.status === "partly_dispensed"
              ? t("pharmacy.item.partly", { given: item.dispensed_quantity, total: item.quantity })
              : t(`pharmacy.itemStatus.${item.status}`)}
          </Badge>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={t("pharmacy.prescription.remove", { name: item.drug_display })}
          >
            <Trash aria-hidden="true" className="size-icon" />
          </Button>
        )}
        {onCancel && (
          <span className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={() => onCancel(true)}>
              {t("pharmacy.prescription.change")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onCancel(false)}>
              {t("pharmacy.prescription.cancel")}
            </Button>
          </span>
        )}
      </div>
      <ItemFlags item={item} />
      {alerts.map((alert) => (
        <AlertLine
          key={`${alert.kind}-${alert.drug_code}`}
          alert={alert}
          item={item}
          prescription={prescription}
          canEdit={canEdit}
          onSaved={onSaved}
        />
      ))}
    </li>
  );
}

/** S6 alerts inline with the item; an allergy needs a recorded reason before signing. */
function AlertLine({
  alert,
  item,
  prescription,
  canEdit,
  onSaved,
}: {
  alert: PrescriptionAlert;
  item: PrescriptionItem;
  prescription: Prescription;
  canEdit: boolean;
  onSaved: (data: Prescription) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const existing = item.alert_overrides.find((o) => o.kind === alert.kind)?.reason ?? "";
  const [reason, setReason] = useState(existing);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.pharmacy.updateItem(item.id, {
        version: prescription.version,
        drug_code: item.is_off_catalogue ? "" : item.drug_code,
        ...(item.is_off_catalogue ? { free_text_drug: item.drug_display } : {}),
        dose: item.dose,
        frequency_code: item.frequency_code,
        route: item.route,
        duration_days: item.duration_days,
        quantity: item.quantity,
        instructions: item.instructions,
        substitution_allowed: item.substitution_allowed,
        alert_overrides: [
          ...item.alert_overrides.filter((o) => o.kind !== alert.kind),
          { kind: alert.kind, reason: reason.trim() },
        ],
      }),
    onSuccess: onSaved,
  });
  const allergy = alert.kind === "allergy";
  const text =
    alert.kind === "allergy"
      ? t("pharmacy.alert.allergy", { substance: alert.substance ?? "" })
      : alert.kind === "dose"
        ? t("pharmacy.alert.dose", { max: alert.max_usual_quantity ?? 0 })
        : t("pharmacy.alert.duplicate");
  return (
    <div
      role={allergy && !alert.overridden ? "alert" : undefined}
      className={cx(
        "flex flex-col gap-2 rounded-md p-3",
        allergy ? "bg-danger-bg" : "bg-attention-bg",
      )}
    >
      <p
        className={cx(
          "m-0 flex items-start gap-2 font-semibold",
          allergy ? "text-danger" : "text-attention",
        )}
      >
        {allergy ? (
          <WarningOctagon aria-hidden="true" weight="fill" className="mt-0.5 size-5 shrink-0" />
        ) : (
          <Warning aria-hidden="true" weight="fill" className="mt-0.5 size-5 shrink-0" />
        )}
        <span>
          {text}
          {alert.overridden && (
            <span className="font-normal text-fg-secondary">
              {" "}
              · {t("pharmacy.alert.overridden", { reason: existing })}
            </span>
          )}
        </span>
      </p>
      {allergy && canEdit && !alert.overridden && (
        <form
          noValidate
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (reason.trim().length >= 5) save.mutate();
          }}
        >
          <TextField
            label={t("pharmacy.alert.reason")}
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            className="min-w-0 flex-1"
            error={
              tried && reason.trim().length < 5
                ? t("pharmacy.reasonMin")
                : save.isError
                  ? errorText(save.error, t("errors.generic"))
                  : undefined
            }
          />
          <Button type="submit" variant="secondary" loading={save.isPending}>
            {t("pharmacy.alert.saveReason")}
          </Button>
        </form>
      )}
    </div>
  );
}

function AddItem({
  consultation: c,
  replaces,
  afterIssue,
  onDone,
}: {
  consultation: Consultation;
  replaces: PrescriptionItem | null;
  afterIssue: boolean;
  onDone: (data: Prescription | null) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const { withStepUp } = useStepUp();
  const ids = useId();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DrugRow | null>(null);
  const [freeText, setFreeText] = useState(false);
  const [dose, setDose] = useState(replaces?.dose ?? "");
  const [frequency, setFrequency] = useState<FrequencyCode>(replaces?.frequency_code ?? "tds");
  const [route, setRoute] = useState<DrugRoute>(replaces?.route ?? "oral");
  const [days, setDays] = useState(replaces?.duration_days ? String(replaces.duration_days) : "");
  const [quantity, setQuantity] = useState("");
  const [instructions, setInstructions] = useState(replaces?.instructions ?? "");
  const [substitution, setSubstitution] = useState(true);
  const [tried, setTried] = useState(false);
  const q = useDeferredValue(search.trim());
  const drugs = useQuery({
    queryKey: pharmacyKeys.drugs(q),
    queryFn: () => api.pharmacy.drugs(q),
    enabled: q.length >= 2 && !picked && !freeText,
  });
  const durationDays = days ? Number(days) : null;
  const computed = defaultQuantity(dose, frequency, durationDays);
  const add = useMutation({
    mutationFn: () => {
      const call = () =>
        api.pharmacy.addItem(c.id, {
          ...(picked ? { drug_code: picked.code } : { free_text_drug: search.trim() }),
          dose: dose.trim(),
          frequency_code: frequency,
          route,
          duration_days: durationDays,
          quantity: quantity ? Number(quantity) : computed,
          instructions: instructions.trim(),
          substitution_allowed: substitution,
          ...(replaces ? { replaces_item_id: replaces.id } : {}),
        });
      return afterIssue ? withStepUp(call) : call();
    },
    onSuccess: (data) => onDone(data),
  });
  const drugMissing = !picked && !(freeText && search.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (drugMissing || !dose.trim() || (!quantity && !computed)) return;
    add.mutate();
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={
        replaces
          ? t("pharmacy.prescription.replace", { name: replaces.drug_display })
          : t("pharmacy.prescription.add")
      }
      className="flex flex-col gap-3 rounded-md bg-subtle p-4"
    >
      {replaces && (
        <p className="m-0 font-semibold">
          {t("pharmacy.prescription.replace", { name: replaces.drug_display })}
        </p>
      )}
      {picked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface p-3">
          <span className="font-semibold">{picked.display}</span>
          {!picked.available_here && (
            <Badge tone="danger" icon={Storefront}>
              {t("pharmacy.flag.notInStock")}
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setPicked(null)}>
            {t("pharmacy.prescription.changeDrug")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <TextField
            type="search"
            label={t("pharmacy.prescription.drug")}
            hint={t("pharmacy.prescription.drugHint")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setFreeText(false);
            }}
            error={tried && drugMissing ? t("pharmacy.prescription.drugRequired") : undefined}
            aria-controls={`${ids}-results`}
          />
          {q.length >= 2 && !freeText && (
            <div id={`${ids}-results`} aria-live="polite" className="flex flex-col gap-1">
              {drugs.isPending ? (
                <LoadingState label={t("pharmacy.loading")} />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {(drugs.data ?? []).map((d) => (
                    <li key={d.code}>
                      <button
                        type="button"
                        onClick={() => setPicked(d)}
                        className="flex min-h-target w-full cursor-pointer flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-start hover:bg-brand-subtle"
                      >
                        <span className="font-semibold">{d.display}</span>
                        {d.is_controlled && (
                          <Badge tone="warning">{t("pharmacy.flag.controlled")}</Badge>
                        )}
                        {!d.available_here && (
                          <Badge tone="danger" icon={Storefront}>
                            {t("pharmacy.flag.notInStock")}
                          </Badge>
                        )}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => setFreeText(true)}
                      className="min-h-target w-full cursor-pointer rounded-md px-3 py-2 text-start text-body-sm font-semibold text-link hover:underline"
                    >
                      {t("pharmacy.prescription.useTyped", { name: q })}
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
          {freeText && (
            <p className="m-0 text-body-sm text-fg-secondary">
              {t("pharmacy.prescription.offCatalogue", { name: search.trim() })}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t("pharmacy.prescription.dose")}
          hint={t("pharmacy.prescription.doseHint")}
          value={dose}
          maxLength={60}
          onChange={(event) => setDose(event.target.value)}
          error={tried && !dose.trim() ? t("pharmacy.prescription.doseRequired") : undefined}
        />
        <SelectField
          label={t("pharmacy.prescription.frequency")}
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as FrequencyCode)}
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
          onChange={(event) => setRoute(event.target.value as DrugRoute)}
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
          onChange={(event) => setDays(event.target.value)}
        />
        <TextField
          type="number"
          inputMode="numeric"
          min={1}
          label={t("pharmacy.prescription.quantity")}
          hint={computed ? t("pharmacy.prescription.quantityHint", { count: computed }) : undefined}
          placeholder={computed ? String(computed) : undefined}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          error={
            tried && !quantity && !computed
              ? t("pharmacy.prescription.quantityRequired")
              : undefined
          }
        />
      </div>
      <TextareaField
        label={t("pharmacy.prescription.instructions")}
        rows={2}
        maxLength={500}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <SwitchField
        label={t("pharmacy.prescription.substitution")}
        hint={t("pharmacy.prescription.substitutionHint")}
        checked={substitution}
        stateLabel={substitution ? t("pharmacy.yes") : t("pharmacy.no")}
        onCheckedChange={setSubstitution}
      />
      {add.isError && (
        <Alert tone="danger" role="alert">
          {errorText(add.error, t("errors.generic"))}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={add.isPending}>
          {t("pharmacy.prescription.save")}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          {t("pharmacy.close")}
        </Button>
      </div>
    </form>
  );
}
