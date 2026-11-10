import { formatMoney } from "@medilink/ui/i18n";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

export const billsKeys = {
  all: ["bills"] as const,
  list: (patientId: string) => ["bills", "list", patientId] as const,
  unpaid: ["bills", "unpaid"] as const,
  detail: (id: string) => ["bills", "detail", id] as const,
};

/** "8,000 RWF": amounts in whole RWF, in the UI language. */
export function useRwf() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (amount: number) => formatMoney(amount, lang);
}

/** Bills with something left to pay, for the overview's "needs your attention". */
export function useUnpaidBills() {
  const api = useApi();
  return useQuery({
    queryKey: billsKeys.unpaid,
    queryFn: () => api.billing.patient.list({ has_balance: true }),
  });
}
