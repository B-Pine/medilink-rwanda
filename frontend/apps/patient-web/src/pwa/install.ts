import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * "Install the app" (upgrade 03 §2, 04 §5): the browser's install prompt, kept until the person
 * asks for it. `null` where the browser offers none (iOS, already installed).
 */
export function useInstallPrompt(): (() => void) | null {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const done = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (!event) return null;
  return () => {
    void event.prompt().finally(() => setEvent(null));
  };
}
