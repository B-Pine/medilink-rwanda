import { Sparkle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import { PageHeading } from "../../components/PageHeading";
import { PublicLayout } from "../../layout/PublicLayout";
import { AssistantComposer, AssistantNotice, AssistantThread } from "./AssistantChat";
import { useAssistantChat } from "./assistantState";

/**
 * AI symptom assistant, test phase (issue #159, decision 2026-11-03): the person describes what
 * they feel in their own words; the assistant asks a few yes/no questions, then may name a
 * possible cause and always sends them to a doctor, with facilities for the suggested service.
 * Red flags show the 912 card. Not a diagnosis, and not for real patients yet. The same chat opens
 * from the floating assistant button on every other page (AssistantLauncher).
 */
export function AssistantPage() {
  const { t } = useTranslation();
  const chat = useAssistantChat();

  const title = t("public.assistant.title");
  return (
    <PublicLayout>
      <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-3">
          <p className="m-0 inline-flex items-center gap-2 self-start rounded-full bg-violet-bg px-3 py-1 text-caption font-semibold text-violet">
            <Sparkle aria-hidden="true" weight="fill" className="size-3.5" />
            {t("public.assistant.eyebrow")}
          </p>
          <PageHeading
            title={title}
            className="m-0 font-heading text-h1 font-bold tracking-tight text-balance text-fg"
          >
            {title}
          </PageHeading>
          <p className="m-0 text-fg-secondary">{t("public.assistant.intro")}</p>
        </div>

        <AssistantNotice language={chat.language} />

        <div className="flex min-h-[18rem] flex-col gap-3 rounded-3xl bg-surface p-4 shadow-card sm:p-6">
          <AssistantThread chat={chat} />
          <div
            className={
              chat.done ? "flex" : "mt-auto flex flex-col gap-2 border-t border-border/60 pt-4"
            }
          >
            <AssistantComposer chat={chat} />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
