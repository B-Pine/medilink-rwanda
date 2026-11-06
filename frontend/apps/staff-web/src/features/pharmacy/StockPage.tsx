import type {
  DrugRow,
  StockAdjustReason,
  StockBatch,
  StockCard,
  StockDetail,
  StockLevel,
  StockMovement,
} from "@medilink/api-client";
import { STOCK_ADJUST_REASONS } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  LoadingState,
  SelectField,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
} from "@medilink/ui";
import { ArrowLeft, CalendarX, ClockCounterClockwise, Package, Plus } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, LEVEL_TONE, Pager, pharmacyKeys, useCan, useWhen } from "./shared";

type Tab = "all" | "short" | "expiring" | "movements";
const TABS: readonly Tab[] = ["all", "short", "expiring", "movements"];

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * /pharmacy/stock (W5, FR-PHA-06): what is on the shelf without counting by hand. Receiving adds a
 * batch, dispensing takes the earliest expiry first, adjustments need a reason. A medicine follows
 * its stock from its first receipt: at zero it shows "Not in stock here" to doctors.
 */
export function StockPage() {
  const { t } = useTranslation();
  const canView = useCan("pharmacy.dispense", "pharmacy.stock");
  const canChange = useCan("pharmacy.stock");
  const [tab, setTab] = useState<Tab>("all");
  const [receiving, setReceiving] = useState(false);
  if (!canView) return <NoAccessContent />;
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={t("pharmacy.stock.title")}
        actions={
          canChange ? (
            <Button onClick={() => setReceiving(true)}>
              <Plus aria-hidden="true" weight="bold" />
              {t("pharmacy.stock.receive.open")}
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList aria-label={t("pharmacy.stock.tabs")}>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`pharmacy.stock.tab.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="all">
          <CardList short={false} />
        </TabsContent>
        <TabsContent value="short">
          <CardList short />
        </TabsContent>
        <TabsContent value="expiring">
          <ExpiringList />
        </TabsContent>
        <TabsContent value="movements">
          <MovementList />
        </TabsContent>
      </Tabs>
      {canChange && <ReceiveDialog open={receiving} onOpenChange={setReceiving} />}
    </div>
  );
}

function LevelBadge({ level }: { level: StockLevel }) {
  const { t } = useTranslation();
  return <Badge tone={LEVEL_TONE[level]}>{t(`pharmacy.stock.level.${level}`)}</Badge>;
}

function CardList({ short }: { short: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...pharmacyKeys.all, "stock", "list", q, short, page],
    queryFn: () => api.pharmacy.stock.list({ q, page, ...(short ? { level: "short" } : {}) }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  return (
    <section className="flex flex-col gap-4">
      <TextField
        type="search"
        label={t("pharmacy.stock.search")}
        value={search}
        onChange={(event) => {
          setPage(1);
          setSearch(event.target.value);
        }}
        className="sm:w-80"
      />
      {list.isPending ? (
        <LoadingState label={t("pharmacy.loading")} />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t(short ? "pharmacy.stock.noneShort" : "pharmacy.stock.none")}
          description={short ? undefined : t("pharmacy.stock.noneBody")}
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col divide-y divide-border/60 rounded-2xl bg-surface p-0 shadow-card">
            {rows.map((row) => (
              <CardRow key={row.drug_code} row={row} expiry={when.date} />
            ))}
          </ul>
          <Pager
            page={page}
            hasPrevious={Boolean(list.data?.previous)}
            hasNext={Boolean(list.data?.next)}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}

function CardRow({ row, expiry }: { row: StockCard; expiry: (iso: string) => string }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link
        to={`/pharmacy/stock/${encodeURIComponent(row.drug_code)}`}
        className="flex min-h-target flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-fg no-underline hover:bg-subtle/60"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{row.display}</span>
          <span className="text-caption text-fg-secondary">
            {row.next_expiry
              ? t("pharmacy.stock.nextExpiry", { date: expiry(row.next_expiry) })
              : t("pharmacy.stock.noUsable")}
            {row.expired_on_hand > 0 &&
              ` · ${t("pharmacy.stock.expiredUnits", { count: row.expired_on_hand })}`}
          </span>
        </span>
        <span className="font-heading text-h3 font-semibold tabular-nums">
          {t("pharmacy.stock.units", { count: row.on_hand })}
        </span>
        <LevelBadge level={row.stock_level} />
      </Link>
    </li>
  );
}

function BatchExpiry({ batch }: { batch: StockBatch }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <span className="flex flex-wrap items-center gap-2 tabular-nums">
      {when.date(batch.expiry_date)}
      {batch.is_expired && <Badge tone="danger">{t("pharmacy.stock.expired")}</Badge>}
    </span>
  );
}

function ExpiringList() {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: [...pharmacyKeys.all, "stock", "expiring"],
    queryFn: () => api.pharmacy.stock.expiring(),
  });
  if (list.isPending) return <Skeleton height="10rem" className="rounded-2xl" />;
  if (list.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(list.error, t("errors.generic"))}
      </Alert>
    );
  const rows = list.data ?? [];
  if (!rows.length) return <EmptyState icon={CalendarX} title={t("pharmacy.stock.expiringNone")} />;
  return (
    <section className="flex flex-col gap-3">
      <p className="m-0 text-body-sm text-fg-muted">{t("pharmacy.stock.expiringIntro")}</p>
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t("pharmacy.stock.tab.expiring")}</caption>
          <thead className="border-b border-border text-caption font-semibold tracking-wide text-fg-secondary uppercase">
            <tr>
              {["medicine", "batch", "expiry", "units"].map((c) => (
                <th key={c} scope="col" className="px-4 py-3 font-semibold">
                  {t(`pharmacy.stock.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((b) => (
              <tr key={b.id} className="align-top">
                <td className="px-4 py-3">
                  <Link
                    to={`/pharmacy/stock/${encodeURIComponent(b.drug_code)}`}
                    className="font-semibold text-fg no-underline hover:text-link hover:underline"
                  >
                    {b.display}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-body-sm">{b.batch_number}</td>
                <td className="px-4 py-3 text-body-sm">
                  <BatchExpiry batch={b} />
                </td>
                <td className="px-4 py-3 tabular-nums">{b.quantity_on_hand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MovementRows({ rows, showDrug }: { rows: StockMovement[]; showDrug: boolean }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{t("pharmacy.stock.movements")}</caption>
        <thead className="border-b border-border text-caption font-semibold tracking-wide text-fg-secondary uppercase">
          <tr>
            {["when", ...(showDrug ? ["medicine"] : []), "batch", "change", "by"].map((c) => (
              <th key={c} scope="col" className="px-4 py-3 font-semibold">
                {t(`pharmacy.stock.columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((m) => (
            <tr key={m.id} className="align-top">
              <td className="px-4 py-3 text-body-sm whitespace-nowrap tabular-nums">
                <span className="block font-semibold">{when.time(m.occurred_at)}</span>
                <span className="text-fg-secondary">{when.date(m.occurred_at)}</span>
              </td>
              {showDrug && <td className="px-4 py-3 font-semibold">{m.display}</td>}
              <td className="px-4 py-3 font-mono text-body-sm">{m.batch_number}</td>
              <td className="px-4 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      m.quantity > 0
                        ? "font-semibold text-success tabular-nums"
                        : "font-semibold tabular-nums"
                    }
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>
                  <Badge
                    tone={
                      m.kind === "received"
                        ? "success"
                        : m.kind === "adjusted"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {m.reason
                      ? t(`pharmacy.stock.reason.${m.reason}`)
                      : t(`pharmacy.stock.kind.${m.kind}`)}
                  </Badge>
                  {m.prescription_id && (
                    <Link
                      to={`/pharmacy/prescriptions/${m.prescription_id}`}
                      className="text-body-sm text-link"
                    >
                      {t("pharmacy.stock.prescription")}
                    </Link>
                  )}
                </span>
                {m.note && <span className="block text-body-sm text-fg-secondary">{m.note}</span>}
                <span className="block text-caption text-fg-secondary tabular-nums">
                  {t("pharmacy.stock.balanceAfter", { count: m.balance_after })}
                </span>
              </td>
              <td className="px-4 py-3 text-body-sm">{m.by_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementList() {
  const { t } = useTranslation();
  const api = useApi();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...pharmacyKeys.all, "stock", "movements", page],
    queryFn: () => api.pharmacy.stock.movements({ page }),
    placeholderData: keepPreviousData,
  });
  if (list.isPending) return <Skeleton height="10rem" className="rounded-2xl" />;
  if (list.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(list.error, t("errors.generic"))}
      </Alert>
    );
  const rows = list.data?.results ?? [];
  if (!rows.length)
    return <EmptyState icon={ClockCounterClockwise} title={t("pharmacy.stock.movementsNone")} />;
  return (
    <section className="flex flex-col gap-3">
      <MovementRows rows={rows} showDrug />
      <Pager
        page={page}
        hasPrevious={Boolean(list.data?.previous)}
        hasNext={Boolean(list.data?.next)}
        onPage={setPage}
      />
    </section>
  );
}

// ---- receive ----------------------------------------------------------------------------------

function ReceiveDialog({
  open,
  onOpenChange,
  drug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receiving from a medicine's page: the medicine is fixed. */
  drug?: { code: string; display: string };
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [picked, setPicked] = useState<DrugRow | null>(null);
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [threshold, setThreshold] = useState("");
  const [tried, setTried] = useState(false);
  const drugs = useQuery({
    queryKey: pharmacyKeys.drugs(q),
    queryFn: () => api.pharmacy.drugs(q),
    enabled: open && !drug && q.length >= 2 && !picked,
  });
  const code = drug?.code ?? picked?.code ?? "";
  const units = Number(quantity);
  const errors = {
    drug: code ? undefined : t("pharmacy.stock.receive.drugRequired"),
    batch: batch.trim() ? undefined : t("pharmacy.stock.receive.batchRequired"),
    expiry: !expiry
      ? t("pharmacy.stock.receive.expiryRequired")
      : expiry < todayIso()
        ? t("pharmacy.stock.receive.expiryPast")
        : undefined,
    quantity:
      Number.isInteger(units) && units >= 1
        ? undefined
        : t("pharmacy.stock.receive.quantityRequired"),
  };
  const reset = () => {
    setSearch("");
    setPicked(null);
    setBatch("");
    setExpiry("");
    setQuantity("");
    setSupplier("");
    setThreshold("");
    setTried(false);
  };
  const save = useMutation({
    mutationFn: () =>
      api.pharmacy.stock.receive({
        drug_code: code,
        batch_number: batch.trim(),
        expiry_date: expiry,
        quantity: units,
        supplier: supplier.trim(),
        ...(threshold.trim() ? { low_stock_threshold: Number(threshold) } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      reset();
      onOpenChange(false);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate();
  };
  const formId = "stock-receive";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("pharmacy.stock.receive.title")}
      description={t("pharmacy.stock.receive.description")}
      closeLabel={t("pharmacy.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("pharmacy.keep")}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {t("pharmacy.stock.receive.save")}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {drug ? (
          <p className="m-0 font-semibold">{drug.display}</p>
        ) : picked ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-subtle p-3">
            <span className="font-semibold">{picked.display}</span>
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
              onChange={(event) => setSearch(event.target.value)}
              error={tried ? errors.drug : undefined}
            />
            {q.length >= 2 && (
              <ul aria-live="polite" className="m-0 flex list-none flex-col gap-1 p-0">
                {(drugs.data ?? []).map((d) => (
                  <li key={d.code}>
                    <button
                      type="button"
                      onClick={() => setPicked(d)}
                      className="flex min-h-target w-full cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2 text-start hover:bg-brand-subtle"
                    >
                      <span className="font-semibold">{d.display}</span>
                      {d.stock_level && <LevelBadge level={d.stock_level} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("pharmacy.stock.receive.batch")}
            value={batch}
            maxLength={40}
            onChange={(event) => setBatch(event.target.value)}
            error={tried ? errors.batch : undefined}
          />
          <TextField
            type="date"
            label={t("pharmacy.stock.receive.expiry")}
            value={expiry}
            min={todayIso()}
            onChange={(event) => setExpiry(event.target.value)}
            error={tried ? errors.expiry : undefined}
          />
          <TextField
            type="number"
            inputMode="numeric"
            min={1}
            label={t("pharmacy.stock.receive.quantity")}
            hint={t("pharmacy.stock.receive.quantityHint")}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            error={tried ? errors.quantity : undefined}
          />
          <TextField
            label={t("pharmacy.stock.receive.supplier")}
            optional
            value={supplier}
            maxLength={120}
            onChange={(event) => setSupplier(event.target.value)}
          />
          <TextField
            type="number"
            inputMode="numeric"
            min={0}
            optional
            label={t("pharmacy.stock.threshold")}
            hint={t("pharmacy.stock.thresholdHint")}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </div>
        {save.isError && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("errors.generic"))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

// ---- one medicine -----------------------------------------------------------------------------

/** /pharmacy/stock/:drugCode: batches on the shelf, adjustments, threshold, last movements. */
export function StockDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { drugCode = "" } = useParams();
  const canView = useCan("pharmacy.dispense", "pharmacy.stock");
  const canChange = useCan("pharmacy.stock");
  const [receiving, setReceiving] = useState(false);
  const [adjusting, setAdjusting] = useState<StockBatch | null>(null);
  const card = useQuery({
    queryKey: [...pharmacyKeys.all, "stock", "detail", drugCode],
    queryFn: () => api.pharmacy.stock.get(drugCode),
    enabled: canView && Boolean(drugCode),
  });
  if (!canView) return <NoAccessContent />;
  const back = (
    <Link to="/pharmacy/stock" className="inline-flex items-center gap-1 text-body-sm text-link">
      <ArrowLeft aria-hidden="true" />
      {t("pharmacy.stock.back")}
    </Link>
  );
  if (card.isPending) return <LoadingState label={t("pharmacy.loading")} />;
  if (card.isError)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Alert tone="danger" role="alert">
          {errorText(card.error, t("errors.generic"))}
        </Alert>
      </div>
    );
  const d = card.data;
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      {back}
      <PageHeader
        title={d.display}
        actions={
          canChange ? (
            <Button onClick={() => setReceiving(true)}>
              <Plus aria-hidden="true" weight="bold" />
              {t("pharmacy.stock.receive.open")}
            </Button>
          ) : undefined
        }
      />
      <Summary card={d} canChange={canChange} />
      <section aria-labelledby="stock-batches" className="flex flex-col gap-3">
        <h2 id="stock-batches" className="m-0 font-heading text-h3">
          {t("pharmacy.stock.batches")}
        </h2>
        {d.batches.length === 0 ? (
          <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
            {t("pharmacy.stock.noBatches")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border/60 rounded-2xl bg-surface p-0 shadow-card">
            {d.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono font-semibold">{b.batch_number}</span>
                  <span className="text-caption text-fg-secondary">
                    {b.supplier || t("pharmacy.stock.noSupplier")}
                  </span>
                </span>
                <span className="text-body-sm">
                  <BatchExpiry batch={b} />
                </span>
                <span className="font-semibold tabular-nums">
                  {t("pharmacy.stock.units", { count: b.quantity_on_hand })}
                </span>
                {canChange && (
                  <Button variant="secondary" size="sm" onClick={() => setAdjusting(b)}>
                    {t("pharmacy.stock.adjust.open")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="stock-movements" className="flex flex-col gap-3">
        <h2 id="stock-movements" className="m-0 font-heading text-h3">
          {t("pharmacy.stock.movements")}
        </h2>
        {d.movements.length === 0 ? (
          <p className="m-0 text-fg-muted">{t("pharmacy.stock.movementsNone")}</p>
        ) : (
          <MovementRows rows={d.movements} showDrug={false} />
        )}
      </section>
      {canChange && (
        <>
          <ReceiveDialog
            open={receiving}
            onOpenChange={setReceiving}
            drug={{ code: d.drug_code, display: d.display }}
          />
          <AdjustDialog batch={adjusting} onClose={() => setAdjusting(null)} />
        </>
      )}
    </div>
  );
}

function Summary({ card, canChange }: { card: StockDetail; canChange: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(String(card.low_stock_threshold));
  const value = Number(threshold);
  const valid = threshold.trim() !== "" && Number.isInteger(value) && value >= 0;
  const save = useMutation({
    mutationFn: () => api.pharmacy.stock.setThreshold(card.drug_code, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pharmacyKeys.all }),
  });
  return (
    <section
      aria-label={t("pharmacy.stock.summary")}
      className="flex flex-wrap items-end gap-6 rounded-2xl bg-surface p-5 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <span className="text-caption text-fg-secondary">{t("pharmacy.stock.onHand")}</span>
        <span className="flex items-center gap-3">
          <span className="font-heading text-h1 leading-none font-semibold tabular-nums">
            {card.on_hand}
          </span>
          <LevelBadge level={card.stock_level} />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-caption text-fg-secondary">{t("pharmacy.stock.columns.expiry")}</span>
        <span className="font-semibold">
          {card.next_expiry ? when.date(card.next_expiry) : t("pharmacy.stock.noUsable")}
        </span>
      </div>
      {card.expired_on_hand > 0 && (
        <Alert tone="warning" className="flex-1">
          {t("pharmacy.stock.expiredToRemove", { count: card.expired_on_hand })}
        </Alert>
      )}
      <form
        className="ms-auto flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <TextField
          type="number"
          inputMode="numeric"
          min={0}
          label={t("pharmacy.stock.threshold")}
          hint={t("pharmacy.stock.thresholdHint")}
          value={threshold}
          disabled={!canChange}
          onChange={(event) => setThreshold(event.target.value)}
          error={!valid ? t("pharmacy.stock.thresholdInvalid") : errorText(save.error, "")}
          className="w-44"
        />
        {canChange && (
          <Button
            type="submit"
            variant="secondary"
            disabled={!valid || save.isPending || value === card.low_stock_threshold}
          >
            {t("pharmacy.stock.saveThreshold")}
          </Button>
        )}
      </form>
    </section>
  );
}

function AdjustDialog({ batch, onClose }: { batch: StockBatch | null; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<StockAdjustReason>("count_correction");
  const [counted, setCounted] = useState("");
  const [removed, setRemoved] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const isCount = reason === "count_correction";
  const have = batch?.quantity_on_hand ?? 0;
  const counting = Number(counted);
  const removing = Number(removed);
  const change = isCount ? counting - have : -removing;
  const error = isCount
    ? counted.trim() === "" || !Number.isInteger(counting) || counting < 0
      ? t("pharmacy.stock.adjust.countedRequired")
      : change === 0
        ? t("pharmacy.stock.adjust.noChange")
        : undefined
    : !Number.isInteger(removing) || removing < 1 || removing > have
      ? t("pharmacy.stock.adjust.removeRange", { max: have })
      : undefined;
  const close = () => {
    setReason("count_correction");
    setCounted("");
    setRemoved("");
    setNote("");
    setTried(false);
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      api.pharmacy.stock.adjust(batch!.id, { quantity_change: change, reason, note: note.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      close();
    },
  });
  const formId = "stock-adjust";
  return (
    <Dialog
      open={batch !== null}
      onOpenChange={(open) => !open && close()}
      title={t("pharmacy.stock.adjust.title", { batch: batch?.batch_number ?? "" })}
      description={t("pharmacy.stock.adjust.description", { count: have })}
      closeLabel={t("pharmacy.close")}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t("pharmacy.keep")}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {t("pharmacy.stock.adjust.save")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (!error) save.mutate();
        }}
      >
        <SelectField
          label={t("pharmacy.stock.adjust.reason")}
          value={reason}
          onChange={(event) => setReason(event.target.value as StockAdjustReason)}
        >
          {STOCK_ADJUST_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`pharmacy.stock.reason.${r}`)}
            </option>
          ))}
        </SelectField>
        {isCount ? (
          <TextField
            type="number"
            inputMode="numeric"
            min={0}
            label={t("pharmacy.stock.adjust.counted")}
            hint={
              counted.trim() !== "" && Number.isInteger(counting)
                ? t("pharmacy.stock.adjust.difference", {
                    change: change > 0 ? `+${change}` : String(change),
                  })
                : t("pharmacy.stock.adjust.countedHint")
            }
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            error={tried ? error : undefined}
          />
        ) : (
          <TextField
            type="number"
            inputMode="numeric"
            min={1}
            max={have}
            label={t("pharmacy.stock.adjust.removed")}
            value={removed}
            onChange={(event) => setRemoved(event.target.value)}
            error={tried ? error : undefined}
          />
        )}
        <TextField
          label={t("pharmacy.stock.adjust.note")}
          optional
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {save.isError && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("errors.generic"))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
