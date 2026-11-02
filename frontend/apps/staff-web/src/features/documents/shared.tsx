import type {
  ClinicalDocumentKind,
  DocumentLink,
  DocumentRow,
  DocumentVerificationStatus,
} from "@medilink/api-client";
import { Badge, Button, type BadgeTone } from "@medilink/ui";
import { DownloadSimple, FileText, Printer } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { errorText, useCan, useWhen } from "../clinical/shared";

export { errorText, useCan, useWhen };

export const documentsKeys = {
  all: ["documents"] as const,
  /** Under `clinical` so signing the consultation refetches them (S6 invalidates `clinical`). */
  letters: (consultationId: string, kind: string) =>
    ["clinical", "letters", consultationId, kind] as const,
  forVisit: (visitId: string) => ["clinical", "documents", "visit", visitId] as const,
  forPatient: (fpId: string) => ["documents", "patient", fpId] as const,
};

export const STATUS_TONE: Record<DocumentVerificationStatus, BadgeTone> = {
  active: "success",
  dispensed: "info",
  cancelled: "neutral",
  expired: "neutral",
};

/**
 * Five-minute link served as an attachment (contract D2, D4): the browser downloads it and stays
 * on the page. `_self` is never blocked as a pop-up, even after the request's await.
 */
export function openFile(link: DocumentLink): void {
  window.open(link.url, "_self");
}

/** One generated document: kind, number, date, status, and Download or Print. */
export function DocumentLine({
  document: d,
  mode,
}: {
  document: DocumentRow;
  mode: "download" | "print";
}) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const canPrint = useCan("documents.print");
  const open = useMutation({
    mutationFn: () =>
      mode === "print" ? api.documents.print(d.id) : api.documents.downloadLink(d.id),
    onSuccess: openFile,
  });
  const ready = d.version_no > 0;
  const kind = t(`documents.kind.${d.kind satisfies ClinicalDocumentKind}`);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <FileText aria-hidden="true" weight="duotone" className="size-6 shrink-0 text-brand" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{kind}</span>
        <span className="text-body-sm text-fg-secondary">
          <span className="font-mono">{d.number}</span> ·{" "}
          {when.date(`${d.document_date}T12:00:00Z`)}
          {d.version_no > 1 && ` · ${t("documents.version", { n: d.version_no })}`}
        </span>
      </div>
      {d.status !== "active" && (
        <Badge tone={STATUS_TONE[d.status]}>{t(`documents.status.${d.status}`)}</Badge>
      )}
      {mode === "print" && !canPrint ? null : (
        <Button
          variant="secondary"
          size="sm"
          disabled={!ready}
          loading={open.isPending}
          onClick={() => open.mutate()}
        >
          {mode === "print" ? (
            <Printer aria-hidden="true" className="size-icon" />
          ) : (
            <DownloadSimple aria-hidden="true" className="size-icon" />
          )}
          {ready
            ? mode === "print"
              ? t("documents.print")
              : t("documents.download")
            : t("documents.preparing")}
          <span className="sr-only"> {`${kind} ${d.number}`}</span>
        </Button>
      )}
      {open.isError && (
        <p role="alert" className="m-0 w-full text-body-sm text-danger">
          {errorText(open.error, t("errors.generic"))}
        </p>
      )}
    </li>
  );
}
