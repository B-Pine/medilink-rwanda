import { Siren } from "@phosphor-icons/react";
import { cx } from "@medilink/ui";
import { useTranslation } from "react-i18next";

/** Always-reachable emergency notice (design 06 H7): icon + words, red text on a red tint. */
export function EmergencyNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-md border-l-4 border-danger bg-danger-bg p-4",
        className,
      )}
    >
      <Siren aria-hidden="true" weight="bold" className="mt-0.5 size-icon shrink-0 text-danger" />
      <p className="m-0 text-fg">
        <strong className="text-danger">{t("emergency.title")}</strong> {t("emergency.body")}
      </p>
    </div>
  );
}
