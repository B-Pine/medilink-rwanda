import { http, HttpResponse, type HttpHandler } from "msw";
import type {
  StockAdjustInput,
  StockAdjustReason,
  StockBatch,
  StockCard,
  StockDetail,
  StockLevel,
  StockMovement,
  StockMovementKind,
  StockReceiveInput,
} from "../../features/pharmacy";
import { STOCK_ADJUST_REASONS } from "../../features/pharmacy";
import type { LanguageCode } from "../../types";
import { id, now, page } from "./s1-common";

/**
 * W5 stock mocks (upgrade 13 §3), Kigali Clinic. Seed:
 * - AMOX500: 3 batches: 12 units expired 5 days ago (to remove), 15 expiring in 20 days (FEFO takes
 *   them first), 200 later; threshold 50, in stock
 * - PARA500: 40 left, threshold 100: low
 * Other medicines don't follow a stock count (manual availability, as in S7a).
 */

interface MockBatch {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity_on_hand: number;
  supplier: string;
  received_at: string;
}

interface MockCard {
  threshold: number;
  updated_at: string;
  batches: MockBatch[];
}

export interface StockStore {
  cards: Map<string, MockCard>;
  movements: StockMovement[];
}

const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const today = () => day(0);

const batch = (n: string, expiresIn: number, qty: number, supplier = "CAMERWA"): MockBatch => ({
  id: id(),
  batch_number: n,
  expiry_date: day(expiresIn),
  quantity_on_hand: qty,
  supplier,
  received_at: now(),
});

export function seedStock(): StockStore {
  return {
    cards: new Map([
      [
        "AMOX500",
        {
          threshold: 50,
          updated_at: now(),
          batches: [
            batch("AMX-2309", -5, 12, ""),
            batch("AMX-2410", 20, 15),
            batch("AMX-2502", 400, 200),
          ],
        },
      ],
      ["PARA500", { threshold: 100, updated_at: now(), batches: [batch("PCM-118", 300, 40)] }],
    ]),
    movements: [],
  };
}

const usable = (card: MockCard) =>
  card.batches
    .filter((b) => b.expiry_date >= today())
    .reduce((sum, b) => sum + b.quantity_on_hand, 0);

const levelOf = (onHand: number, threshold: number): StockLevel =>
  onHand <= 0 ? "out" : onHand < threshold ? "low" : "in_stock";

/** Usable units, or `null` when the medicine does not follow a stock count. */
export function stockLeft(store: StockStore, code: string): number | null {
  const card = store.cards.get(code);
  return card ? usable(card) : null;
}

/** `null` when the medicine does not follow a stock count. */
export function stockLevel(store: StockStore, code: string): StockLevel | null {
  const card = store.cards.get(code);
  return card ? levelOf(usable(card), card.threshold) : null;
}

function move(
  store: StockStore,
  code: string,
  display: string,
  b: MockBatch,
  kind: StockMovementKind,
  quantity: number,
  by: string,
  extra: { reason?: StockAdjustReason; note?: string; prescription_id?: string } = {},
) {
  store.movements.unshift({
    id: id(),
    drug_code: code,
    display,
    batch_id: b.id,
    batch_number: b.batch_number,
    kind,
    quantity,
    balance_after: b.quantity_on_hand,
    reason: extra.reason ?? "",
    note: extra.note ?? "",
    prescription_id: extra.prescription_id ?? null,
    by_name: by,
    occurred_at: now(),
  });
}

/** FEFO deduction for the dispense mock: the units left when there are not enough, else null. */
export function deductStock(
  store: StockStore,
  code: string,
  display: string,
  quantity: number,
  by: string,
  prescriptionId: string,
): number | null {
  const card = store.cards.get(code);
  if (!card || quantity <= 0) return null;
  const left = usable(card);
  if (left < quantity) return left;
  let need = quantity;
  const fefo = card.batches
    .filter((b) => b.expiry_date >= today() && b.quantity_on_hand > 0)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  for (const b of fefo) {
    if (!need) break;
    const take = Math.min(need, b.quantity_on_hand);
    b.quantity_on_hand -= take;
    need -= take;
    move(store, code, display, b, "dispensed", -take, by, { prescription_id: prescriptionId });
  }
  card.updated_at = now();
  return null;
}

const STOCK_MESSAGES = {
  notEnough: {
    en: (n: number, name: string) =>
      `Only ${n} of ${name} left in stock. Give that many as part, or correct the count first.`,
    fr: (n: number, name: string) =>
      `Il ne reste que ${n} de ${name} en stock. Donnez-en autant en partie, ou corrigez d'abord le comptage.`,
    rw: (n: number, name: string) =>
      `Hasigaye ${n} gusa za ${name} mu bubiko. Tanga izo nk'igice, cyangwa ubanze ukosore ibarura.`,
  },
  expired: {
    en: "This batch has already expired. Don't put it on the shelf.",
    fr: "Ce lot est déjà périmé. Ne le mettez pas en rayon.",
    rw: "Iki cyiciro cyarangije igihe. Ntugishyire ku gipangu.",
  },
  belowZero: {
    en: "That would take the batch below zero.",
    fr: "Le lot passerait en dessous de zéro.",
    rw: "Byatuma icyiciro kijya munsi ya zeru.",
  },
  removeOnly: {
    en: "Damaged or expired stock can only be taken off, not added.",
    fr: "Le stock abîmé ou périmé ne peut qu'être retiré, pas ajouté.",
    rw: "Imiti yangiritse cyangwa yarangije igihe ivanwamo gusa, ntiyongerwamo.",
  },
  followsStock: {
    en: "This medicine follows its stock count. Receive or adjust stock to change its availability.",
    fr: "Ce médicament suit son stock. Recevez ou ajustez le stock pour changer sa disponibilité.",
    rw: "Uyu muti ukurikira ibarura ry'ububiko. Akira cyangwa uhindure ububiko kugira ngo uhindure kuboneka kwawo.",
  },
} as const;

export const notEnoughMessage = (lang: LanguageCode, n: number, name: string) =>
  STOCK_MESSAGES.notEnough[lang](n, name);
export const followsStockMessage = (lang: LanguageCode) => STOCK_MESSAGES.followsStock[lang];

type Staff =
  | { error: Response }
  | { lang: LanguageCode; me: { full_name: string }; granted: readonly string[] };

interface StockContext {
  S: string;
  store: () => StockStore;
  staff: (request: Request, codes: string[]) => Staff;
  display: (code: string) => { display: string; is_controlled: boolean } | undefined;
  settle: () => Promise<void>;
  readJson: (request: Request) => Promise<unknown>;
  errorResponse: (status: number, code: string, message: string) => Response;
  validationError: (lang: LanguageCode, errors: Record<string, string[]>) => Response;
  notFound: (lang: LanguageCode) => Response;
}

export function stockHandlers(c: StockContext): HttpHandler[] {
  const read = ["pharmacy.dispense", "pharmacy.stock"];
  const write = ["pharmacy.stock"];
  const rule = (message: string) => c.errorResponse(422, "business_rule_violation", message);

  const cardOf = (code: string, card: MockCard): StockCard => {
    const d = c.display(code);
    const onHand = usable(card);
    const soon = card.batches
      .filter((b) => b.quantity_on_hand > 0 && b.expiry_date >= today())
      .map((b) => b.expiry_date)
      .sort()[0];
    return {
      drug_code: code,
      display: d?.display ?? code,
      is_controlled: d?.is_controlled ?? false,
      on_hand: onHand,
      expired_on_hand: card.batches
        .filter((b) => b.expiry_date < today())
        .reduce((sum, b) => sum + b.quantity_on_hand, 0),
      low_stock_threshold: card.threshold,
      stock_level: levelOf(onHand, card.threshold),
      next_expiry: soon ?? null,
      updated_at: card.updated_at,
    };
  };
  const batchOf = (code: string, b: MockBatch): StockBatch => ({
    ...b,
    drug_code: code,
    display: c.display(code)?.display ?? code,
    is_expired: b.expiry_date < today(),
  });
  const detail = (code: string, status = 200) => {
    const card = c.store().cards.get(code)!;
    const body: StockDetail = {
      ...cardOf(code, card),
      batches: card.batches
        .filter((b) => b.quantity_on_hand > 0)
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
        .map((b) => batchOf(code, b)),
      movements: c
        .store()
        .movements.filter((m) => m.drug_code === code)
        .slice(0, 50),
    };
    return HttpResponse.json(body, { status });
  };

  return [
    http.get(`${c.S}/pharmacy/stock/`, async ({ request }) => {
      await c.settle();
      const ok = c.staff(request, read);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const level = url.searchParams.get("level");
      const rows = [...c.store().cards.entries()]
        .map(([code, card]) => cardOf(code, card))
        .filter(
          (row) =>
            !q || row.display.toLowerCase().includes(q) || row.drug_code.toLowerCase().includes(q),
        )
        .filter(
          (row) =>
            !level ||
            (level === "short" ? row.stock_level !== "in_stock" : row.stock_level === level),
        )
        .sort((a, b) => a.display.localeCompare(b.display));
      return HttpResponse.json(page(rows, url));
    }),

    http.post(`${c.S}/pharmacy/stock/receive/`, async ({ request }) => {
      await c.settle();
      const ok = c.staff(request, write);
      if ("error" in ok) return ok.error;
      const body = ((await c.readJson(request)) ?? {}) as Partial<StockReceiveInput>;
      const code = body.drug_code ?? "";
      const d = c.display(code);
      if (!d) return c.notFound(ok.lang);
      const errors: Record<string, string[]> = {};
      if (!body.batch_number?.trim()) errors.batch_number = ["Give the batch number."];
      if (!body.expiry_date) errors.expiry_date = ["Give the expiry date."];
      if (!body.quantity || body.quantity < 1) errors.quantity = ["Give the number of units."];
      if (Object.keys(errors).length) return c.validationError(ok.lang, errors);
      if (body.expiry_date! < today()) return rule(STOCK_MESSAGES.expired[ok.lang]);
      const store = c.store();
      const card = store.cards.get(code) ?? { threshold: 0, updated_at: now(), batches: [] };
      store.cards.set(code, card);
      let b = card.batches.find(
        (x) => x.batch_number === body.batch_number!.trim() && x.expiry_date === body.expiry_date,
      );
      if (!b) {
        b = {
          id: id(),
          batch_number: body.batch_number!.trim(),
          expiry_date: body.expiry_date!,
          quantity_on_hand: 0,
          supplier: "",
          received_at: now(),
        };
        card.batches.push(b);
      }
      b.quantity_on_hand += body.quantity!;
      if (body.supplier?.trim()) b.supplier = body.supplier.trim();
      if (body.low_stock_threshold !== undefined && body.low_stock_threshold !== null)
        card.threshold = body.low_stock_threshold;
      card.updated_at = now();
      move(store, code, d.display, b, "received", body.quantity!, ok.me.full_name);
      return detail(code, 201);
    }),

    http.get(`${c.S}/pharmacy/stock/expiring/`, async ({ request }) => {
      await c.settle();
      const ok = c.staff(request, read);
      if ("error" in ok) return ok.error;
      const days = Number(new URL(request.url).searchParams.get("days") ?? 60) || 60;
      const until = day(days);
      const rows = [...c.store().cards.entries()]
        .flatMap(([code, card]) =>
          card.batches
            .filter((b) => b.quantity_on_hand > 0 && b.expiry_date <= until)
            .map((b) => batchOf(code, b)),
        )
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      return HttpResponse.json(rows);
    }),

    http.get(`${c.S}/pharmacy/stock/movements/`, async ({ request }) => {
      await c.settle();
      const ok = c.staff(request, read);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const kind = url.searchParams.get("kind");
      const rows = c.store().movements.filter((m) => !kind || m.kind === kind);
      return HttpResponse.json(page(rows, url));
    }),

    http.post(`${c.S}/pharmacy/stock/batches/:batchId/adjust/`, async ({ request, params }) => {
      await c.settle();
      const ok = c.staff(request, write);
      if ("error" in ok) return ok.error;
      const store = c.store();
      const found = [...store.cards.entries()].find(([, card]) =>
        card.batches.some((b) => b.id === params.batchId),
      );
      if (!found) return c.notFound(ok.lang);
      const [code, card] = found;
      const b = card.batches.find((x) => x.id === params.batchId)!;
      const body = ((await c.readJson(request)) ?? {}) as Partial<StockAdjustInput>;
      const change = Number(body.quantity_change ?? 0);
      if (!body.reason || !STOCK_ADJUST_REASONS.includes(body.reason))
        return c.validationError(ok.lang, { reason: ["Choose a reason."] });
      if (!change) return c.validationError(ok.lang, { quantity_change: ["Give a number."] });
      if (body.reason !== "count_correction" && change > 0)
        return rule(STOCK_MESSAGES.removeOnly[ok.lang]);
      if (b.quantity_on_hand + change < 0) return rule(STOCK_MESSAGES.belowZero[ok.lang]);
      b.quantity_on_hand += change;
      card.updated_at = now();
      move(store, code, c.display(code)?.display ?? code, b, "adjusted", change, ok.me.full_name, {
        reason: body.reason,
        note: body.note ?? "",
      });
      return detail(code);
    }),

    http.get(`${c.S}/pharmacy/stock/:code/`, async ({ request, params }) => {
      await c.settle();
      const ok = c.staff(request, read);
      if ("error" in ok) return ok.error;
      const code = String(params.code);
      if (!c.store().cards.has(code)) return c.notFound(ok.lang);
      return detail(code);
    }),

    http.put(`${c.S}/pharmacy/stock/:code/`, async ({ request, params }) => {
      await c.settle();
      const ok = c.staff(request, write);
      if ("error" in ok) return ok.error;
      const code = String(params.code);
      const card = c.store().cards.get(code);
      if (!card) return c.notFound(ok.lang);
      const body = ((await c.readJson(request)) ?? {}) as { low_stock_threshold?: number };
      const value = Number(body.low_stock_threshold);
      if (!Number.isInteger(value) || value < 0)
        return c.validationError(ok.lang, { low_stock_threshold: ["Give 0 or more."] });
      card.threshold = value;
      card.updated_at = now();
      return detail(code);
    }),
  ];
}
