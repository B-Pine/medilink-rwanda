import { useEffect, useState } from "react";

/** Whether the browser is online; follows the online / offline events. */
export function useOnline() {
  // at build time (pre-render, Node) there is no onLine: count that as online
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
