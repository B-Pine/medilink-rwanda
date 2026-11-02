import { Navigate } from "react-router";

import { homePath, HOME_PATH } from "./destination";
import { useStaffMe } from "./queries";

/** Where "/" lands (see `homePath`). */
export function HomeRedirect() {
  const { data: me } = useStaffMe();
  return <Navigate to={me ? homePath(me) : HOME_PATH} replace />;
}
