import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "../app/services";
import { clearUserCaches } from "../pwa/caches";

export const patientMeKey = ["patient", "me"] as const;

/** The signed-in patient (GET /api/v1/patient/auth/me/). 401 = not logged in. */
export function usePatientMe() {
  const api = useApi();
  return useQuery({
    queryKey: patientMeKey,
    queryFn: ({ signal }) => api.patientAuth.me(signal),
  });
}

/**
 * Log out: the server deletes the patient session; the client drops cached queries and any
 * user-data caches of the service worker (security 06 §6).
 */
export function useLogout() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.patientAuth.logout();
      } finally {
        queryClient.clear();
        await clearUserCaches();
      }
    },
  });
}
