import { SealCheck } from "@phosphor-icons/react";
import { Logo } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { EmergencyNotice } from "./EmergencyNotice";

const LINKS = [
  { to: "/verify", key: "footer.verify" },
  { to: "/for-facilities", key: "footer.forFacilities" },
  { to: "/help", key: "footer.help" },
  { to: "/privacy", key: "footer.privacy" },
  { to: "/terms", key: "footer.terms" },
] as const;

/** Footer (design 06 §3): emergency notice, site links incl. "Verify a document", copyright. */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto border-t border-border bg-surface print:hidden">
      <div className="mx-auto flex max-w-[70rem] flex-col gap-6 px-4 py-8 sm:px-6">
        <EmergencyNotice />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <Logo className="h-9" />
          <nav aria-label={t("footer.label")}>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="inline-flex min-h-target items-center gap-1.5">
                    {link.to === "/verify" && <SealCheck aria-hidden="true" className="size-5" />}
                    {t(link.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="m-0 text-body-sm text-fg-muted">
          {t("footer.copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
