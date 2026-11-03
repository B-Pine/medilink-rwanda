import type { AssistantLanguage, AssistantState, AssistantTurn } from "@medilink/api-client";
import { useMutation } from "@tanstack/react-query";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

export const MAX_MESSAGE = 600;

export interface AssistantMessage {
  id: number;
  from: "person" | "assistant";
  text: string;
}

/**
 * One conversation with the AI symptom assistant (issue #159): the messages, the state the server
 * hands back each turn, and the last turn.
 */
function useConversation() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const language = (
    ["rw", "en", "fr"].includes(i18n.resolvedLanguage ?? "") ? i18n.resolvedLanguage : "rw"
  ) as AssistantLanguage;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [state, setState] = useState<AssistantState | undefined>(undefined);
  const [last, setLast] = useState<AssistantTurn | null>(null);
  const [text, setText] = useState("");
  const counter = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);

  const add = (from: AssistantMessage["from"], value: string) =>
    setMessages((list) => [...list, { id: ++counter.current, from, text: value }]);

  const turn = useMutation({
    mutationFn: (message: string) => api.triage.assistant({ message, language, state }),
    onSuccess: (result) => {
      setLast(result);
      setState(result.state);
      if (result.kind === "clarify") add("assistant", t("public.assistant.clarify"));
      else if (result.reply) add("assistant", result.reply);
    },
  });

  const done = last?.kind === "answer" || last?.kind === "emergency";

  const send = (value: string) => {
    const message = value.trim().slice(0, MAX_MESSAGE);
    if (!message || turn.isPending || done) return;
    add("person", message);
    setText("");
    turn.mutate(message);
  };

  const restart = () => {
    setMessages([]);
    setState(undefined);
    setLast(null);
    setText("");
    turn.reset();
    input.current?.focus();
  };

  return { language, messages, last, turn, done, text, setText, send, restart, input };
}

export type AssistantChat = ReturnType<typeof useConversation>;

interface AssistantContextValue {
  chat: AssistantChat;
  /** The page the floating panel was opened on: a new page closes it. */
  openPath: string | null;
  setOpenPath: (path: string | null) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

/**
 * Above the router, so one conversation carries across pages (each page mounts its own layout)
 * and is shared by the /assistant page and the floating panel.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const chat = useConversation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  return (
    <AssistantContext.Provider value={{ chat, openPath, setOpenPath }}>
      {children}
    </AssistantContext.Provider>
  );
}

function useAssistantContext(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistantChat must be used inside <AssistantProvider>");
  return value;
}

export function useAssistantChat(): AssistantChat {
  return useAssistantContext().chat;
}

/** The chat and the floating panel; null outside the provider (the first-load skeleton). */
export function useAssistantPanel(): AssistantContextValue | null {
  return useContext(AssistantContext);
}
