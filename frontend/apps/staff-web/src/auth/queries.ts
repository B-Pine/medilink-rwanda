import type { StaffMe } from "@medilink/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "../app/services";

export const staffMeKey = ["staff", "me"] as const;

/** The signed-in staff user (GET /api/v1/staff/auth/me/). 401 = no full session. */
export function useStaffMe() {
  const api = useApi();
  return useQuery({
    queryKey: staffMeKey,
    queryFn: ({ signal }) => api.staffAuth.me(signal),
  });
}

/** Switch the active facility; the response is the updated StaffMe (permissions change). */
export function useSetActiveFacility() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (facilityId: string) => api.staffAuth.setActiveFacility(facilityId),
    onSuccess: (me) => {
      queryClient.setQueryData<StaffMe>(staffMeKey, me);
    },
  });
}

/** Log out: server deletes the staff session; the client drops every cached query. */
export function useLogout() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.staffAuth.logout();
      } finally {
        queryClient.clear();
      }
    },
  });
}
