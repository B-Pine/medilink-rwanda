import type { StaffLoginStatus } from "@medilink/api-client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * State between the password step and the second factor (in memory only, never in storage).
 * After a reload it is gone and the user logs in again, which is the safe default.
 */
export interface PendingLogin {
  status: Exclude<StaffLoginStatus, "authenticated">;
  email: string;
  /** Where to go once fully authenticated. */
  from?: string | undefined;
}

interface AuthFlowValue {
  pending: PendingLogin | null;
  setPending: (pending: PendingLogin | null) => void;
}

const AuthFlowContext = createContext<AuthFlowValue | null>(null);

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingLogin | null>(null);
  const value = useMemo(() => ({ pending, setPending }), [pending]);
  return <AuthFlowContext.Provider value={value}>{children}</AuthFlowContext.Provider>;
}

export function useAuthFlow(): AuthFlowValue {
  const value = useContext(AuthFlowContext);
  if (!value) throw new Error("useAuthFlow must be used inside <AuthFlowProvider>");
  return value;
}
