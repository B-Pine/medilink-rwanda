import {
  isApiError,
  type ApplicantApplication,
  type ApplicationPatch,
  type LocationItem,
  type LocalisedItem,
} from "@medilink/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "../../app/services";

export const STEPS = ["facility", "location", "documents", "admin", "review"] as const;
export type Step = (typeof STEPS)[number];

export const applicationKey = (id: string) => ["facilityApplication", id] as const;

/** Which step a dotted server field (or feedback target) belongs to. */
export function stepOf(field: string): Step {
  if (field.startsWith("location.")) return "location";
  if (field.startsWith("documents.")) return "documents";
  // The applicant's own details (phone, position) are completed on the administrator step.
  if (field.startsWith("proposed_admin.") || field.startsWith("applicant.")) return "admin";
  if (field.startsWith("facility.")) return "facility";
  return "review";
}

export function firstIncompleteStep(app: ApplicantApplication): Step {
  const missing = app.missing_for_submit[0];
  return missing ? stepOf(missing) : "review";
}

/** The applicant's application; documents are polled while a scan is pending. */
export function useApplication(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: applicationKey(id),
    queryFn: ({ signal }) => api.onboarding.applicant.get(id, signal),
    refetchInterval: (query) =>
      query.state.data?.documents.some((d) => d.upload.status === "pending") ? 2000 : false,
    retry: false,
  });
}

export function usePublicList<T extends LocalisedItem>(
  kind: Parameters<ReturnType<typeof useApi>["masterData"]["publicList"]>[0],
  params: Record<string, string | undefined> = {},
  enabled = true,
) {
  const api = useApi();
  return useQuery({
    queryKey: ["publicMasterData", kind, params],
    queryFn: () => api.masterData.publicList<T>(kind, { page_size: 100, ...params }),
    enabled,
    staleTime: 60 * 60_000,
  });
}

export type LocationOption = LocationItem;

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "retrying" }
  | { kind: "conflict" }
  | { kind: "error"; message: string; fields: Record<string, string[]> };

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

/**
 * Debounced autosave (contract S1-F2): queues partial patches, sends them with the current
 * `version`, retries when offline, and reports `409` as a conflict (the caller reloads).
 */
export function useAutosave(app: ApplicantApplication | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const pending = useRef<Omit<ApplicationPatch, "version">>({});
  const timer = useRef<number | undefined>(undefined);
  const version = useRef(app?.version ?? 0);
  const id = app?.id;

  useEffect(() => {
    if (app && app.version > version.current) version.current = app.version;
  }, [app]);

  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!id || Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    setState({ kind: "saving" });
    try {
      const saved = await api.onboarding.applicant.update(id, {
        ...patch,
        version: version.current,
      });
      version.current = saved.version;
      queryClient.setQueryData(applicationKey(id), saved);
      setState({ kind: "saved", at: new Date() });
    } catch (failure) {
      if (isApiError(failure) && failure.code === "conflict") {
        setState({ kind: "conflict" });
        await queryClient.invalidateQueries({ queryKey: applicationKey(id) });
        return;
      }
      if (isApiError(failure) && (failure.code === "network_error" || failure.status >= 500)) {
        pending.current = mergePatch(patch, pending.current);
        setState({ kind: "retrying" });
        timer.current = window.setTimeout(() => void flushRef.current(), RETRY_MS);
        return;
      }
      setState({
        kind: "error",
        message: isApiError(failure) ? failure.message : "",
        fields: isApiError(failure) ? failure.fields : {},
      });
    }
  }, [api, id, queryClient]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const save = useCallback(
    (patch: Omit<ApplicationPatch, "version">) => {
      pending.current = mergePatch(pending.current, patch);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { state, save, flush };
}

function mergePatch(
  a: Omit<ApplicationPatch, "version">,
  b: Omit<ApplicationPatch, "version">,
): Omit<ApplicationPatch, "version"> {
  const merged: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const current = merged[key];
    merged[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object"
        ? { ...current, ...value }
        : value;
  }
  return merged;
}

/** Rwanda's bounding box, for "Use my location" (contract S1-F3). */
export function insideRwanda(lat: number, lng: number): boolean {
  return lat >= -2.85 && lat <= -1.04 && lng >= 28.85 && lng <= 30.9;
}
