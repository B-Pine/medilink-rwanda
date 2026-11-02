import {
  isApiError,
  OPEN_ITEM_STATUSES,
  type DispenseLineInput,
  type DispenseOutcome,
  type IdentityCheckMethod,
  type Prescription,
  type PrescriptionItem,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  CheckboxField,
  cx,
  LoadingState,
  SelectField,
  TextareaField,
  TextField,
} from "@medilink/ui";
import {
  ChatCircleDots,
  CheckCircle,
  IdentificationCard,
  Printer,
  ShieldWarning,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import {
  errorText,
  ITEM_TONE,
  pharmacyKeys,
  remaining,
  STATUS_TONE,
  useCan,
  useWhen,
} from "./shared";

type Choice = DispenseOutcome | "skip";
interface Plan {
  outcome: Choice;
  quantity: string;
  substitute: string;
  reason: string;
}
const EMPTY: Plan = { outcome: "skip", quantity: "", substitute: "", reason: "" };
const OUTCOMES: Choice[] = ["full", "partial", "substituted", "not_available", "skip"];

/**
 * /pharmacy/prescriptions/:id (S7-F3, FR-PHA-02, 03): who is at the counter first, then an outcome
 * per item, then one signature. Substitutes are limited to the same ingredient and strength; a
 * controlled medicine needs an extra confirmation. A `409` reloads the prescription.
 */
export function DispensePage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const when = useWhen();
  const { prescriptionId = "" } = useParams();
  const allowed = useCan("pharmacy.dispense");
  const rx = useQuery({
    queryKey: pharmacyKeys.prescription(prescriptionId),
    queryFn: () => api.pharmacy.get(prescriptionId),
    enabled: allowed,
  });
  const [identity, setIdentity] = useState<IdentityCheckMethod | null>(null);
  const [code, setCode] = useState("");
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [controlled, setControlled] = useState(false);
  const [tried, setTried] = useState(false);
  const [reloaded, setReloaded] = useState(false);
  const [signed, setSigned] = useState(false);

  const dispense = useMutation({
    mutationFn: (body: Parameters<typeof api.pharmacy.dispense>[1]) =>
      api.pharmacy.dispense(prescriptionId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(pharmacyKeys.prescription(prescriptionId), data);
      void queryClient.invalidateQueries({ queryKey: ["pharmacy", "queue"] });
      setPlans({});
      setControlled(false);
      // identity is confirmed again for every dispensing (contract §2.2)
      setIdentity(null);
      setCode("");
      setTried(false);
      setSigned(true);
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setReloaded(true);
        void rx.refetch();
      }
    },
  });

  if (!allowed) return <NoAccessContent />;
  if (rx.isPending) return <LoadingState label={t("pharmacy.loading")} />;
  if (rx.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(rx.error, t("errors.generic"))}
      </Alert>
    );
  const p = rx.data;
  const open = p.items.filter((i) => OPEN_ITEM_STATUSES.includes(i.status));
  const plan = (i: PrescriptionItem) => plans[i.id] ?? EMPTY;
  const setPlan = (i: PrescriptionItem, change: Partial<Plan>) =>
    setPlans((all) => ({ ...all, [i.id]: { ...plan(i), ...change } }));
  const chosen = open.filter((i) => plan(i).outcome !== "skip");
  const needsControlled = chosen.some(
    (i) => i.is_controlled && plan(i).outcome !== "not_available",
  );
  const openQuery = p.queries.find((q) => q.status === "open");

  const lineProblem = (i: PrescriptionItem): string | null => {
    const it = plan(i);
    const left = remaining(i);
    if (it.outcome === "partial") {
      const n = Number(it.quantity);
      if (!Number.isInteger(n) || n < 1 || n >= left)
        return t("pharmacy.dispense.partialRange", { max: left - 1 });
    }
    if (it.outcome === "substituted") {
      if (!it.substitute) return t("pharmacy.dispense.chooseSubstitute");
      if (it.reason.trim().length < 5) return t("pharmacy.reasonMin");
    }
    return null;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    setSigned(false);
    setReloaded(false);
    if (!identity || (identity === "verification_code" && !code.trim())) return;
    if (!chosen.length || chosen.some(lineProblem) || (needsControlled && !controlled)) return;
    const lines: DispenseLineInput[] = chosen.map((i) => {
      const it = plan(i);
      const outcome = it.outcome as DispenseOutcome;
      return {
        item_id: i.id,
        outcome,
        ...(outcome === "partial" ? { quantity: Number(it.quantity) } : {}),
        ...(outcome === "substituted"
          ? { substitute_drug_code: it.substitute, substitution_reason: it.reason.trim() }
          : {}),
      };
    });
    dispense.mutate({
      version: p.version,
      identity_check_method: identity,
      ...(identity === "verification_code" ? { verification_code: code.trim() } : {}),
      ...(needsControlled ? { controlled_confirmed: true } : {}),
      lines,
    });
  };

  const meta = [
    p.number,
    t("pharmacy.byDoctor", { name: p.prescriber_name }),
    p.expires_at ? t("pharmacy.validUntil", { date: when.date(p.expires_at) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const given = p.dispense_records.length > 0;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={p.patient_display_name}
        description={meta}
        back={{ to: "/pharmacy", label: t("pharmacy.queue.title") }}
        badges={<Badge tone={STATUS_TONE[p.status]}>{t(`pharmacy.status.${p.status}`)}</Badge>}
        actions={
          given ? (
            <Link
              to={`/pharmacy/prescriptions/${p.id}/labels`}
              className={buttonClassName({ variant: "secondary" })}
            >
              <Printer aria-hidden="true" className="size-icon" />
              {t("pharmacy.labels.print")}
            </Link>
          ) : undefined
        }
      />

      {signed && (
        <Alert tone="success" role="status" title={t("pharmacy.dispense.signed")}>
          {t("pharmacy.dispense.signedBody")}
        </Alert>
      )}
      {reloaded && (
        <Alert tone="warning" role="alert">
          {t("pharmacy.dispense.reloaded")}
        </Alert>
      )}
      {openQuery && (
        <Alert tone="info" title={t("pharmacy.query.openTitle")}>
          {t("pharmacy.query.openBody", { name: openQuery.raised_by_name })} “{openQuery.message}”
        </Alert>
      )}

      {open.length > 0 ? (
        <form
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-4"
          aria-label={t("pharmacy.dispense.title")}
        >
          <fieldset className="m-0 flex flex-col gap-3 rounded-lg border-0 bg-surface p-4 shadow-card">
            <legend className="float-left mb-1 flex items-center gap-2 p-0 font-heading text-h3 font-bold">
              <IdentificationCard
                aria-hidden="true"
                weight="duotone"
                className="size-6 text-brand"
              />
              {t("pharmacy.identity.title")}
            </legend>
            <p className="clear-both m-0 text-body-sm text-fg-muted">
              {t("pharmacy.identity.hint")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["ticket_name_dob", "verification_code"] as const).map((method) => (
                <label
                  key={method}
                  className={cx(
                    "grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-md border p-3",
                    identity === method ? "border-primary bg-brand-subtle" : "border-border-input",
                  )}
                >
                  <input
                    type="radio"
                    name="identity"
                    value={method}
                    checked={identity === method}
                    onChange={() => setIdentity(method)}
                    className="row-span-2 mt-1 size-4 accent-[var(--ml-brand)]"
                  />
                  <span className="font-semibold">{t(`pharmacy.identity.${method}`)}</span>
                  <span className="text-body-sm text-fg-muted">
                    {t(`pharmacy.identity.${method}Hint`)}
                  </span>
                </label>
              ))}
            </div>
            {identity === "verification_code" && (
              <TextField
                label={t("pharmacy.identity.code")}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="sm:w-64"
                autoComplete="off"
                error={tried && !code.trim() ? t("pharmacy.identity.codeRequired") : undefined}
              />
            )}
            {tried && !identity && (
              <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
                {t("pharmacy.identity.required")}
              </p>
            )}
          </fieldset>

          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {open.map((i) => (
              <ItemPlan
                key={i.id}
                item={i}
                plan={plan(i)}
                disabled={!identity}
                problem={tried ? lineProblem(i) : null}
                onChange={(change) => setPlan(i, change)}
              />
            ))}
          </ol>

          {needsControlled && (
            <div className="rounded-lg bg-attention-bg p-4">
              <CheckboxField
                label={t("pharmacy.dispense.controlled")}
                hint={t("pharmacy.dispense.controlledHint")}
                checked={controlled}
                onChange={(event) => setControlled(event.target.checked)}
                error={tried && !controlled ? t("pharmacy.dispense.controlledRequired") : undefined}
              />
            </div>
          )}
          {tried && identity && !chosen.length && (
            <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
              {t("pharmacy.dispense.chooseOne")}
            </p>
          )}
          {dispense.isError && !reloaded && (
            <Alert tone="danger" role="alert">
              {errorText(dispense.error, t("errors.generic"))}
            </Alert>
          )}
          <Button type="submit" size="lg" className="self-start" loading={dispense.isPending}>
            <CheckCircle aria-hidden="true" weight="bold" className="size-icon" />
            {t("pharmacy.dispense.sign")}
          </Button>
        </form>
      ) : (
        <Alert tone="info">{t("pharmacy.dispense.nothingOpen")}</Alert>
      )}

      <Done p={p} />
      <QuerySection p={p} />
    </div>
  );
}

function ItemPlan({
  item,
  plan,
  disabled,
  problem,
  onChange,
}: {
  item: PrescriptionItem;
  plan: Plan;
  disabled: boolean;
  problem: string | null;
  onChange: (change: Partial<Plan>) => void;
}) {
  const { t } = useTranslation();
  const left = remaining(item);
  const outcomes = OUTCOMES.filter(
    (o) =>
      (o !== "partial" || left > 1) &&
      (o !== "substituted" || (item.substitution_allowed && !item.is_off_catalogue)),
  );
  const legend = `pharmacy-item-${item.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={legend} className="font-heading text-h3 font-bold">
            {item.drug_display}
          </span>
          <ItemLine item={item} />
          {item.instructions && (
            <span className="text-body-sm text-fg-secondary">{item.instructions}</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="font-heading text-h2 leading-none font-extrabold tabular-nums">
            {left}
          </span>
          <span className="text-caption text-fg-muted">
            {item.dispensed_quantity
              ? t("pharmacy.item.leftOf", { given: item.dispensed_quantity, total: item.quantity })
              : t("pharmacy.item.toGive")}
          </span>
        </div>
      </div>
      <ItemFlags item={item} />
      <fieldset
        disabled={disabled}
        className="m-0 flex flex-col gap-3 border-0 p-0 disabled:opacity-60"
      >
        <legend className="sr-only">
          {t("pharmacy.dispense.outcomeFor", { name: item.drug_display })}
        </legend>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((o) => (
            <label
              key={o}
              className={cx(
                "inline-flex min-h-target cursor-pointer items-center gap-2 rounded-full border px-4 text-body-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                plan.outcome === o
                  ? o === "not_available"
                    ? "border-danger bg-danger-bg text-danger"
                    : "border-primary bg-brand-subtle text-on-brand-subtle"
                  : "border-border-input bg-surface text-fg",
              )}
            >
              <input
                type="radio"
                name={`outcome-${item.id}`}
                value={o}
                checked={plan.outcome === o}
                onChange={() => onChange({ outcome: o })}
                className="sr-only"
              />
              {t(`pharmacy.outcome.${o}`, { count: left })}
            </label>
          ))}
        </div>
        {plan.outcome === "partial" && (
          <TextField
            type="number"
            inputMode="numeric"
            min={1}
            max={left - 1}
            label={t("pharmacy.dispense.quantity")}
            value={plan.quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            className="sm:w-40"
          />
        )}
        {plan.outcome === "substituted" && (
          <Substitute item={item} plan={plan} onChange={onChange} />
        )}
        {problem && (
          <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
            {problem}
          </p>
        )}
      </fieldset>
    </li>
  );
}

export function ItemLine({
  item,
}: {
  item: Pick<PrescriptionItem, "dose" | "frequency_code" | "route" | "duration_days">;
}) {
  const { t } = useTranslation();
  return (
    <span className="text-body-sm text-fg-secondary">
      {[
        item.dose,
        t(`pharmacy.frequency.${item.frequency_code}`),
        t(`pharmacy.route.${item.route}`),
        item.duration_days ? t("pharmacy.days", { count: item.duration_days }) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}

export function ItemFlags({ item }: { item: PrescriptionItem }) {
  const { t } = useTranslation();
  const flags = [
    item.is_controlled && (
      <Badge key="c" tone="warning" icon={ShieldWarning}>
        {t("pharmacy.flag.controlled")}
      </Badge>
    ),
    !item.available_here && !item.is_off_catalogue && (
      <Badge key="s" tone="danger" icon={Storefront}>
        {t("pharmacy.flag.notInStock")}
      </Badge>
    ),
    item.is_off_catalogue && (
      <Badge key="o" tone="neutral">
        {t("pharmacy.flag.offCatalogue")}
      </Badge>
    ),
    !item.substitution_allowed && (
      <Badge key="n" tone="neutral">
        {t("pharmacy.flag.noSubstitution")}
      </Badge>
    ),
  ].filter(Boolean);
  return flags.length ? <div className="flex flex-wrap gap-1.5">{flags}</div> : null;
}

/** Same ingredient and strength, another product (contract §2.2 Dispense). */
function Substitute({
  item,
  plan,
  onChange,
}: {
  item: PrescriptionItem;
  plan: Plan;
  onChange: (change: Partial<Plan>) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const original = useQuery({
    // the display starts with the ingredient ("Amoxicillin 500 mg capsule"); the search is by it
    queryKey: pharmacyKeys.drugs(item.drug_display.split(" ")[0] ?? ""),
    queryFn: () => api.pharmacy.drugs(item.drug_display.split(" ")[0] ?? ""),
  });
  const self = original.data?.find((d) => d.code === item.drug_code);
  const options =
    original.data?.filter(
      (d) =>
        self &&
        d.code !== self.code &&
        d.generic_name === self.generic_name &&
        d.strength === self.strength,
    ) ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-md bg-subtle p-3">
      {original.isPending ? (
        <LoadingState label={t("pharmacy.loading")} />
      ) : options.length ? (
        <SelectField
          label={t("pharmacy.dispense.substitute")}
          hint={t("pharmacy.dispense.substituteHint")}
          value={plan.substitute}
          onChange={(event) => onChange({ substitute: event.target.value })}
        >
          <option value="">{t("pharmacy.dispense.chooseSubstitute")}</option>
          {options.map((d) => (
            <option key={d.code} value={d.code} disabled={!d.available_here}>
              {d.display}
              {d.available_here ? "" : ` · ${t("pharmacy.flag.notInStock")}`}
            </option>
          ))}
        </SelectField>
      ) : (
        <p className="m-0 text-body-sm text-fg-secondary">{t("pharmacy.dispense.noSubstitute")}</p>
      )}
      <TextareaField
        label={t("pharmacy.dispense.substituteReason")}
        rows={2}
        maxLength={300}
        value={plan.reason}
        onChange={(event) => onChange({ reason: event.target.value })}
      />
    </div>
  );
}

function Done({ p }: { p: Prescription }) {
  const { t } = useTranslation();
  const when = useWhen();
  const closed = p.items.filter((i) => !OPEN_ITEM_STATUSES.includes(i.status));
  if (!p.dispense_records.length && !closed.length) return null;
  const name = (itemId: string) => p.items.find((i) => i.id === itemId)?.drug_display ?? "";
  return (
    <section aria-labelledby="rx-done" className="flex flex-col gap-3">
      <h2 id="rx-done" className="m-0 text-h3">
        {t("pharmacy.dispense.history")}
      </h2>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {p.dispense_records.map((record) => (
          <li key={record.id} className="rounded-lg bg-surface p-4 shadow-card">
            <p className="m-0 text-body-sm text-fg-muted">
              {t("pharmacy.dispense.signedBy", {
                name: record.pharmacist_name,
                time: when.dateTime(record.signed_at),
              })}
              {record.controlled_confirmed && ` · ${t("pharmacy.dispense.controlledChecked")}`}
            </p>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {record.lines.map((line) => (
                <li key={line.id}>
                  <span className="font-semibold">
                    {line.substitute_display || name(line.item_id)}
                  </span>
                  {" · "}
                  {t(`pharmacy.given.${line.outcome}`, { count: line.quantity })}
                  {line.substitute_display &&
                    ` · ${t("pharmacy.given.insteadOf", { name: name(line.item_id), reason: line.substitution_reason })}`}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {closed.some((i) => i.status === "cancelled") && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm text-fg-muted">
          {closed
            .filter((i) => i.status === "cancelled")
            .map((i) => (
              <li key={i.id}>
                <Badge tone={ITEM_TONE[i.status]}>{t(`pharmacy.itemStatus.${i.status}`)}</Badge>{" "}
                {i.drug_display}
                {i.cancelled_reason && ` · ${i.cancelled_reason}`}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/** PQ2 and PQ4: a question back to the prescriber, closed by the pharmacist once answered. */
function QuerySection({ p }: { p: Prescription }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: pharmacyKeys.prescription(p.id) });
  const raise = useMutation({
    mutationFn: () => api.pharmacy.raiseQuery(p.id, message.trim()),
    onSuccess: async () => {
      setMessage("");
      setTried(false);
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["pharmacy", "queue"] });
    },
  });
  const close = useMutation({
    mutationFn: (queryId: string) => api.pharmacy.closeQuery(queryId),
    onSuccess: refresh,
  });
  const open = p.queries.find((q) => q.status !== "closed");
  return (
    <section
      aria-labelledby="rx-query"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card"
    >
      <h2 id="rx-query" className="m-0 flex items-center gap-2 text-h3">
        <ChatCircleDots aria-hidden="true" weight="duotone" className="size-6 text-brand" />
        {t("pharmacy.query.title")}
      </h2>
      {open ? (
        <div className="flex flex-col gap-2">
          <p className="m-0">“{open.message}”</p>
          <p className="m-0 text-body-sm text-fg-muted">
            {open.status === "answered"
              ? t("pharmacy.query.answered")
              : t("pharmacy.query.waiting")}
          </p>
          {open.status === "answered" && (
            <Button
              variant="secondary"
              className="self-start"
              loading={close.isPending}
              onClick={() => close.mutate(open.id)}
            >
              {t("pharmacy.query.close")}
            </Button>
          )}
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (message.trim()) raise.mutate();
          }}
        >
          <TextareaField
            label={t("pharmacy.query.message")}
            hint={t("pharmacy.query.hint")}
            rows={3}
            maxLength={1000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            error={tried && !message.trim() ? t("pharmacy.query.required") : undefined}
          />
          {raise.isError && (
            <Alert tone="danger" role="alert">
              {errorText(raise.error, t("errors.generic"))}
            </Alert>
          )}
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            loading={raise.isPending}
          >
            {t("pharmacy.query.send")}
          </Button>
        </form>
      )}
    </section>
  );
}
