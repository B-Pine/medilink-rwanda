import { hasPermission } from "@medilink/api-client";
import { Receipt, SealCheck } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./BillingPages");
import { CashierTodayCard } from "./CashierToday";

/**
 * S8 `billing` (contract sprint-08 §6.1): today's bills with the cash shift, the bill of a visit
 * with payment, exemption and void request, the receipt, and the approvals inbox. Mounted on the
 * core Payments (`/payments`) and Approvals (`/approvals`) menu items (S8 D: paths of the S0 shell).
 */
export const billingFeature: FeatureRoutes = {
  shell: [
    { path: "/payments", lazy: lazy(pages, "BillsPage") },
    { path: "/payments/bills/:billId", lazy: lazy(pages, "BillPage") },
    { path: "/payments/receipts/:receiptId", lazy: lazy(pages, "ReceiptPage") },
    { path: "/approvals", lazy: lazy(pages, "ApprovalsPage") },
  ],
  // upgrade 06 §4: the cashier's day
  todayCards: [CashierTodayCard],
  commands: [
    {
      actions: (me, t) => [
        ...(hasPermission(me, "billing.record_payment")
          ? [
              {
                id: "billing:bills",
                label: t("shell.nav.payments"),
                icon: Receipt,
                to: "/payments",
              },
            ]
          : []),
        ...(hasPermission(me, "billing.approve")
          ? [
              {
                id: "billing:approvals",
                label: t("shell.nav.approvals"),
                icon: SealCheck,
                to: "/approvals",
              },
            ]
          : []),
      ],
    },
  ],
};
