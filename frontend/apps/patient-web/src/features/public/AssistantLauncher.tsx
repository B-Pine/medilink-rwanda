import { Sparkle } from "@phosphor-icons/react";
import { cx, SidePanel } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

import { AssistantComposer, AssistantNotice, AssistantThread } from "./AssistantChat";
import { useAssistantPanel } from "./assistantState";

/**
 * Floating "AI assistant" button on the public site and in the patient dashboard (issue #159):
 * opens the symptom chat in a side panel, full screen on phones. The conversation carries across
 * pages and is the same as on /assistant, where the button is hidden; a new page closes the panel.
 */
export function AssistantLauncher({
  raised = false,
}: {
  /** Above the phone tab bar of the dashboard. */
  raised?: boolean;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const assistant = useAssistantPanel();
  if (!assistant || pathname === "/assistant") return null;
  const { chat } = assistant;
  // open on this page only: following a link from the answer closes the panel
  const open = assistant.openPath === pathname;
  const setOpen = (value: boolean) => assistant.setOpenPath(value ? pathname : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("public.assistant.launcher")}
        className={cx(
          "group fixed right-4 z-30 inline-flex min-h-14 cursor-pointer items-center gap-2 rounded-full bg-primary p-2 text-on-primary shadow-raised",
          "transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none",
          "sm:right-6",
          raised ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-4 sm:bottom-6",
        )}
      >
        <span
          aria-hidden="true"
          className="relative grid size-10 place-items-center rounded-full bg-on-primary/15"
        >
          <Sparkle weight="fill" className="size-5" />
          {/* a conversation is waiting */}
          {chat.messages.length > 0 && (
            <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-attention-solid ring-2 ring-primary" />
          )}
        </span>
        {/* the label folds away once the page scrolls, so the button stops covering content */}
        <span className="ml-fab-label hidden overflow-hidden pr-3 font-semibold whitespace-nowrap sm:inline-block">
          {t("public.assistant.launcherShort")}
        </span>
      </button>

      <SidePanel
        open={open}
        onOpenChange={setOpen}
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkle aria-hidden="true" weight="fill" className="size-5 text-violet" />
            {t("public.assistant.panelTitle")}
            <span className="rounded-full bg-violet-bg px-2 py-0.5 text-caption font-semibold text-violet">
              {t("public.assistant.testBadge")}
            </span>
          </span>
        }
        closeLabel={t("public.assistant.close")}
        footer={<AssistantComposer chat={chat} />}
      >
        <div className="flex flex-col gap-4">
          <AssistantNotice language={chat.language} compact />
          <AssistantThread chat={chat} compact />
        </div>
      </SidePanel>
    </>
  );
}
