import { createContext, useContext } from "react";

/**
 * True inside the signed-in dashboard shell. Public pages reused there (Find care, facility pages)
 * then drop their own header and footer, so the patient stays in one product (upgrade 12 §2).
 */
export const InDashboardContext = createContext(false);

export const useInDashboard = () => useContext(InDashboardContext);
