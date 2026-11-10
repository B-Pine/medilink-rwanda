import { useQuery } from "@tanstack/react-query";

import { useApi } from "../../app/services";

export const disputesKeys = {
  all: ["disputes"] as const,
  list: ["disputes", "list"] as const,
  detail: (id: string) => ["disputes", "detail", id] as const,
};

/** My disputes; the overview reminds when one waits for my answer. */
export function useMyDisputes() {
  const api = useApi();
  return useQuery({ queryKey: disputesKeys.list, queryFn: () => api.disputes.patient.list() });
}
