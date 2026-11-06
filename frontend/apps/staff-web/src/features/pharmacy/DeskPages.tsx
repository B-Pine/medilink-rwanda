import type { DocumentVerificationDetails } from "@medilink/api-client";
import { isApiError } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  cx,
  EmptyState,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TextField,
} from "@medilink/ui";
import {
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  Package,
  Pill,
  QrCode,
  Storefront,
  UserCircle,
  Warehouse,
  WarningOctagon,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { useCan, useWhen } from "./shared";

const OUTCOME_TONE: Record<string, "success" | "warning" | "info" | "danger"> = {
  full: "success",
  partial: "warning",
  substituted: "info",
  not_available: "danger",
};

function Stat({
  icon: StatIcon,
  label,
  value,
  to,
  tone = "brand",
}: {
  icon: Icon;
  label: string;
  value: number;
  to?: string;
  tone?: "brand" | "attention" | "danger";
}) {
  const body = (
    <>
      <span
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          tone === "attention"
            ? "bg-attention-bg text-attention"
            : tone === "danger"
              ? "bg-danger-bg text-danger"
              : "bg-brand-subtle text-on-brand-subtle",
        )}
      >
        <StatIcon aria-hidden="true" weight="bold" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-heading text-h2 leading-none font-semibold tabular-nums">
          {value}
        </span>
        <span className="truncate text-caption text-fg-secondary">{label}</span>
      </span>
    </>
  );
  const box = "flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3 shadow-card";
  return (
    <li>
      {to ? (
        <Link
          to={to}
          className={cx(
            box,
            "text-fg no-underline transition-shadow duration-150 hover:shadow-raised",
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

/** Pharmacist Today (upgrade 05 §4): the counter at a glance, then the next prescriptions. */
export function PharmacistTodayCard() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const allowed = useCan("pharmacy.dispense");
  const clinician = useCan("clinical.write");
  const show = allowed && !clinician;
  const day = useQuery({
    queryKey: ["pharmacy", "my-day"],
    queryFn: () => api.pharmacy.myDay(),
    enabled: show,
    refetchInterval: 30_000,
  });
  const ready = useQuery({
    queryKey: ["pharmacy", "queue", "ready", "", "today"],
    queryFn: () => api.pharmacy.queue({ status: "ready" }),
    enabled: show,
    refetchInterval: 30_000,
  });
  if (!show) return null;
  const d = day.data;
  const rows = (ready.data?.results ?? []).slice(0, 5);
  return (
    <section aria-labelledby="pharmacy-today" className="flex flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="pharmacy-today" className="m-0 font-heading text-h2 tracking-tight">
          {t("pharmacy.today.title")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/pharmacy/verify" className={buttonClassName({ variant: "ghost", pill: true })}>
            <QrCode aria-hidden="true" />
            {t("pharmacy.nav.verify")}
          </Link>
          <Link to="/pharmacy" className={buttonClassName({ variant: "secondary", pill: true })}>
            {t("pharmacy.today.openQueue")}
            <CaretRight aria-hidden="true" weight="bold" />
          </Link>
        </div>
      </div>
      {!d ? (
        <Skeleton height="6rem" className="rounded-2xl" />
      ) : (
        <ul
          aria-label={t("pharmacy.today.numbers")}
          className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3"
        >
          <Stat icon={Pill} label={t("pharmacy.today.ready")} value={d.ready} to="/pharmacy" />
          <Stat
            icon={Package}
            label={t("pharmacy.today.partly")}
            value={d.partly}
            to="/pharmacy"
            tone={d.partly > 0 ? "attention" : "brand"}
          />
          <Stat
            icon={ChatCircleDots}
            label={t("pharmacy.today.questions", { count: d.questions_answered })}
            value={d.questions_open}
            to="/pharmacy"
            tone={d.questions_answered > 0 ? "attention" : "brand"}
          />
          <Stat
            icon={CheckCircle}
            label={t("pharmacy.today.dispensed", { count: d.dispensed_by_me })}
            value={d.dispensed_today}
            to="/pharmacy/history"
          />
          <Stat
            icon={Storefront}
            label={t("pharmacy.today.outOfStock")}
            value={d.out_of_stock}
            to="/pharmacy/availability"
            tone={d.out_of_stock > 0 ? "danger" : "brand"}
          />
          {/* W5: medicines low on stock, and batches expiring within 60 days */}
          <Stat
            icon={Warehouse}
            label={t("pharmacy.today.lowStock", { count: d.expiring_soon })}
            value={d.low_stock}
            to="/pharmacy/stock"
            tone={d.low_stock + d.expiring_soon > 0 ? "attention" : "brand"}
          />
        </ul>
      )}
      <section
        aria-labelledby="pharmacy-next"
        className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card"
      >
        <h3 id="pharmacy-next" className="m-0 font-heading text-h3 tracking-tight">
          {t("pharmacy.today.next")}
        </h3>
        {ready.isPending ? (
          <Skeleton height="8rem" className="rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
            {t("pharmacy.today.nothing")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  to={`/pharmacy/prescriptions/${row.id}`}
                  className="group flex min-h-target items-center gap-3 py-2.5 text-fg no-underline"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
                    <UserCircle aria-hidden="true" weight="bold" className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{row.patient_display_name}</span>
                    <span className="text-caption text-fg-secondary tabular-nums">
                      {row.number}
                      {row.ticket_number ? ` · ${row.ticket_number}` : ""} ·{" "}
                      {t("pharmacy.today.items", { count: row.item_count })} ·{" "}
                      {when.time(row.issued_at)}
                    </span>
                  </span>
                  {row.has_controlled && (
                    <Badge tone="warning">{t("pharmacy.flag.controlled")}</Badge>
                  )}
                  {row.has_unavailable && (
                    <Badge tone="danger" icon={Storefront}>
                      {t("pharmacy.flag.notInStock")}
                    </Badge>
                  )}
                  <CaretRight
                    aria-hidden="true"
                    className="size-4 text-fg-muted transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/** /pharmacy/history (upgrade 05 §4): what was given, by whom, newest first. */
export function DispenseHistoryPage() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const allowed = useCan("pharmacy.dispense");
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [mine, setMine] = useState(false);
  const [text, setText] = useState("");
  const q = useDeferredValue(text.trim());
  const list = useQuery({
    queryKey: ["pharmacy", "history", days, mine, q],
    queryFn: () => api.pharmacy.history({ days, mine, q }),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  const rows = list.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("pharmacy.history.title")} />
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 1 | 7 | 30)}>
          <TabsList aria-label={t("pharmacy.history.period")}>
            {([1, 7, 30] as const).map((d) => (
              <TabsTrigger key={d} value={String(d)}>
                {t(`pharmacy.history.days.${d}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => setMine(!mine)}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-border bg-surface px-4 text-body-sm font-semibold text-fg-secondary hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
        >
          {t("pharmacy.history.mine")}
        </button>
        <TextField
          type="search"
          label={t("pharmacy.history.search")}
          hideLabel
          placeholder={t("pharmacy.history.search")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="ms-auto w-full max-w-xs"
        />
      </div>
      {list.isPending ? (
        <Skeleton height="14rem" className="rounded-2xl" />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {t("pharmacy.failed")}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwise}
          title={t("pharmacy.history.empty")}
          description={t("pharmacy.history.emptyBody")}
        />
      ) : (
        <div className="animate-enter overflow-x-auto rounded-2xl bg-surface shadow-card">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t("pharmacy.history.title")}</caption>
            <thead className="border-b border-border text-caption font-semibold tracking-wide text-fg-secondary uppercase">
              <tr>
                {["when", "patient", "medicines", "by"].map((c) => (
                  <th key={c} scope="col" className="px-4 py-3 font-semibold">
                    {t(`pharmacy.history.columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="align-top transition-colors hover:bg-subtle/60">
                  <td className="px-4 py-3 text-body-sm whitespace-nowrap tabular-nums">
                    <span className="block font-semibold">{when.time(row.signed_at)}</span>
                    <span className="text-fg-secondary">{when.date(row.signed_at)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/pharmacy/prescriptions/${row.prescription_id}`}
                      className="font-semibold text-fg no-underline hover:text-link hover:underline"
                    >
                      {row.patient_display_name}
                    </Link>
                    <span className="block font-mono text-caption text-fg-secondary">
                      {row.prescription_number}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {row.lines.map((line, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2 text-body-sm">
                          <span className="font-semibold">{line.drug}</span>
                          <Badge tone={OUTCOME_TONE[line.outcome] ?? "neutral"}>
                            {t(`pharmacy.history.outcome.${line.outcome}`, {
                              defaultValue: line.outcome,
                            })}
                            {line.quantity > 0 ? ` · ${line.quantity}` : ""}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    {row.controlled_confirmed && (
                      <span className="mt-1 inline-flex items-center gap-1 text-caption text-attention">
                        <WarningOctagon aria-hidden="true" className="size-3.5" />
                        {t("pharmacy.history.controlled")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-fg-secondary">
                    {row.pharmacist_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * /pharmacy/verify (upgrade 05 §4): a prescription written elsewhere. The code shows who issued it
 * and whether it is valid; the patient's date of birth opens the medicines.
 */
export function VerifyPrescriptionPage() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const allowed = useCan("pharmacy.dispense");
  const [code, setCode] = useState("");
  const [born, setBorn] = useState("");
  const check = useMutation({ mutationFn: (value: string) => api.documents.public.verify(value) });
  const details = useMutation({
    mutationFn: (): Promise<DocumentVerificationDetails> =>
      api.documents.public.details(check.data!.code, born),
  });
  if (!allowed) return <NoAccessContent />;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    details.reset();
    if (code.trim()) check.mutate(code.trim().toUpperCase());
  };
  const doc = check.data;
  const valid = doc && ["active", "dispensed", "valid"].includes(doc.status);
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("pharmacy.verify.title")} />
      <form
        noValidate
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface p-5 shadow-card"
      >
        <TextField
          label={t("pharmacy.verify.code")}
          hint={t("pharmacy.verify.codeHint")}
          value={code}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
          className="min-w-0 flex-1 basis-56"
          inputClassName="font-heading font-bold tracking-[0.15em] uppercase"
        />
        <Button type="submit" pill loading={check.isPending} disabled={!code.trim()}>
          <QrCode aria-hidden="true" weight="bold" />
          {t("pharmacy.verify.check")}
        </Button>
      </form>
      {check.isError && (
        <Alert tone="danger" role="alert">
          {isApiError(check.error) && check.error.status === 404
            ? t("pharmacy.verify.notFound")
            : t("pharmacy.failed")}
        </Alert>
      )}
      {doc && (
        <section
          aria-labelledby="verify-result"
          className={cx(
            "flex flex-col gap-4 rounded-2xl p-5 shadow-card",
            valid ? "bg-surface" : "bg-danger-bg",
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="verify-result" className="m-0 font-heading text-h3">
              {doc.number}
            </h2>
            <Badge tone={valid ? "success" : "danger"}>
              {t(`pharmacy.verify.status.${doc.status}`, { defaultValue: doc.status })}
            </Badge>
            {doc.kind !== "prescription" && (
              <Badge tone="warning">{t("pharmacy.verify.notPrescription")}</Badge>
            )}
          </div>
          <dl className="m-0 grid gap-3 text-body-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-secondary">{t("pharmacy.verify.facility")}</dt>
              <dd className="m-0 font-semibold">{doc.facility_name}</dd>
            </div>
            <div>
              <dt className="text-fg-secondary">{t("pharmacy.verify.author")}</dt>
              <dd className="m-0 font-semibold">
                {doc.author_name}
                {doc.author_licence ? ` · ${doc.author_licence}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-fg-secondary">{t("pharmacy.verify.issued")}</dt>
              <dd className="m-0 font-semibold tabular-nums">{when.date(doc.issued_at)}</dd>
            </div>
            {doc.valid_until && (
              <div>
                <dt className="text-fg-secondary">{t("pharmacy.verify.validUntil")}</dt>
                <dd className="m-0 font-semibold tabular-nums">{when.date(doc.valid_until)}</dd>
              </div>
            )}
          </dl>
          {valid && !details.data && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (born) details.mutate();
              }}
              className="flex flex-wrap items-end gap-3 border-t border-border pt-4"
            >
              <TextField
                type="date"
                label={t("pharmacy.verify.born")}
                hint={t("pharmacy.verify.bornHint")}
                value={born}
                onChange={(e) => setBorn(e.target.value)}
              />
              <Button
                type="submit"
                variant="secondary"
                pill
                loading={details.isPending}
                disabled={!born}
              >
                {t("pharmacy.verify.open")}
              </Button>
            </form>
          )}
          {details.isError && (
            <Alert tone="danger" role="alert">
              {t("pharmacy.verify.bornWrong")}
            </Alert>
          )}
          {details.data && (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="m-0 font-semibold">{details.data.patient_name}</p>
              {details.data.sections.map((section) => (
                <div key={section.heading} className="flex flex-col gap-1">
                  <p className="m-0 text-caption font-semibold tracking-wide text-fg-secondary uppercase">
                    {section.heading}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {section.lines.map((line, i) => (
                      <li key={i} className="rounded-lg bg-subtle px-3 py-2 text-body-sm">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
