import { hasPermission, type StaffMe } from "@medilink/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "../app/services";
import { useMyDay } from "../features/clinical/DoctorToday";
import { queueKeys, usePollInterval } from "../features/queue/live";

/**
 * Live counts beside sidebar links (staff clean-up 2026-11-16): what is waiting behind each one.
 * Reuses the queries Today and the board already run (same keys), so the menu adds no traffic of
 * its own. A zero shows nothing.
 */
export function useNavCounts(me: StaffMe): Record<string, number> {
  const api = useApi();
  const clinician = hasPermission(me, "clinical.write");
  // the front desk's board; clinicians see their own queue, not the whole board
  const desk = hasPermission(me, "queue.operate") && !clinician;
  const refetchInterval = usePollInterval();

  const myDay = useMyDay(clinician);
  const board = useQuery({
    queryKey: queueKeys.board,
    queryFn: () => api.queue.board(),
    enabled: desk,
    refetchInterval,
  });

  const counts: Record<string, number> = {};
  if (board.data) {
    counts.queue = board.data.queues.reduce((sum, group) => sum + group.waiting.length, 0);
  }
  if (myDay.data) {
    counts.clinicalUnsigned = myDay.data.unsigned;
    counts.clinicalResults = myDay.data.results_waiting;
    counts.clinicalQuestions = myDay.data.open_questions.length;
    counts.clinicalFollowUps = myDay.data.follow_ups_today;
  }
  return counts;
}
