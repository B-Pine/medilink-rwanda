import { isApiError } from "@medilink/api-client";
import { Alert, Badge, Button, Card, Skeleton, TextField } from "@medilink/ui";
import { DownloadSimple, QrCode, SealCheck, SealWarning } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { PublicLayout } from "../../layout/PublicLayout";
import { PageContainer, PageHeader } from "../site/kit";
import { useDate } from "../records/RecordsPages";
import { openFile, STATUS_TONE } from "./DocumentsPages";

/**
 * /verify and /verify/:code (S7-F7, FR-DOC-04, V1): anyone checks a document by the code under
 * its QR code. The page shows almost nothing; the content only after the patient's date of birth.
 */
export function VerifyPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const navigate = useNavigate();
  const { code = "" } = useParams();
  const [typed, setTyped] = useState(code);
  const [dob, setDob] = useState("");
  const found = useQuery({
    queryKey: ["verify", code],
    queryFn: () => api.documents.public.verify(code),
    enabled: code.length > 0,
    retry: false,
  });
  const details = useMutation({
    mutationFn: () => api.documents.public.details(code, dob),
  });
  // inline errors once a form was sent empty (phase 5: no silent submits)
  const [codeMissing, setCodeMissing] = useState(false);
  const [dobMissing, setDobMissing] = useState(false);
  const lookUp = (event: FormEvent) => {
    event.preventDefault();
    const clean = typed.replace(/[^a-z0-9]/gi, "").toUpperCase();
    setCodeMissing(!clean);
    if (clean) void navigate(`/verify/${clean}`);
  };
  const askDetails = (event: FormEvent) => {
    event.preventDefault();
    setDobMissing(!dob);
    if (dob && !details.isPending) details.mutate();
  };
  const notFound = isApiError(found.error) && found.error.status === 404;
  const limited = isApiError(found.error) && found.error.status === 429;
  const doc = found.data;
  const valid = doc?.status === "active" || doc?.status === "dispensed";

  return (
    <PublicLayout>
      {/* the one public page template: breadcrumb → H1 → lead */}
      <PageContainer narrow className="flex flex-col gap-6 pb-16">
        <PageHeader
          crumbs={[{ label: t("documents.verify.title") }]}
          title={t("documents.verify.title")}
          lead={t("documents.verify.intro")}
        />
        <form noValidate onSubmit={lookUp} className="flex flex-wrap items-end gap-3">
          <TextField
            label={t("documents.verify.code")}
            hint={t("documents.verify.codeHint")}
            value={typed}
            error={codeMissing ? t("documents.verify.codeRequired") : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setTyped(e.target.value);
              setCodeMissing(false);
            }}
            className="min-w-56 flex-1"
          />
          <Button type="submit">
            <QrCode aria-hidden="true" className="size-icon" />
            {t("documents.verify.check")}
          </Button>
        </form>

        {code && found.isPending ? (
          <Skeleton height="8rem" className="rounded-lg" />
        ) : notFound ? (
          <Alert tone="danger" role="alert" title={t("documents.verify.notFound")}>
            {t("documents.verify.notFoundBody")}
          </Alert>
        ) : limited ? (
          <Alert tone="warning" role="alert">
            {t("documents.verify.limited")}
          </Alert>
        ) : found.isError ? (
          <Alert tone="danger" role="alert">
            {t("documents.failed")}
          </Alert>
        ) : doc ? (
          <Card as="section" aria-labelledby="verify-result" className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              {valid ? (
                <SealCheck
                  aria-hidden="true"
                  weight="fill"
                  className="size-10 shrink-0 text-success"
                />
              ) : (
                <SealWarning
                  aria-hidden="true"
                  weight="fill"
                  className="size-10 shrink-0 text-warning"
                />
              )}
              <div className="flex flex-col gap-1">
                <h2 id="verify-result" className="m-0 text-h3">
                  {valid ? t("documents.verify.genuine") : t("documents.verify.notValid")}
                </h2>
                <span>
                  <Badge tone={STATUS_TONE[doc.status]}>
                    {t(`documents.status.${doc.status}`)}
                  </Badge>
                </span>
              </div>
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-fg-muted">{t("documents.verify.kind")}</dt>
              <dd className="m-0 font-semibold">{t(`documents.kind.${doc.kind}`)}</dd>
              <dt className="text-fg-muted">{t("documents.verify.number")}</dt>
              <dd className="m-0 font-mono">{doc.number}</dd>
              <dt className="text-fg-muted">{t("documents.verify.issued")}</dt>
              <dd className="m-0">{date(doc.issued_at)}</dd>
              {doc.valid_until && (
                <>
                  <dt className="text-fg-muted">{t("documents.verify.validUntil")}</dt>
                  <dd className="m-0">{date(doc.valid_until)}</dd>
                </>
              )}
              <dt className="text-fg-muted">{t("documents.verify.facility")}</dt>
              <dd className="m-0">{doc.facility_name}</dd>
              <dt className="text-fg-muted">{t("documents.verify.author")}</dt>
              <dd className="m-0">
                {doc.author_name}
                {doc.author_licence && ` · ${doc.author_licence}`}
              </dd>
            </dl>
            {doc.version_no > 1 && (
              <p className="m-0 text-body-sm text-fg-muted">
                {t("documents.verify.version", { n: doc.version_no })}
              </p>
            )}

            {details.data ? (
              <div className="flex flex-col gap-2 border-t border-hairline pt-4">
                <h3 className="m-0 text-body font-semibold">
                  {t("documents.verify.for", { name: details.data.patient_name })}
                </h3>
                {details.data.sections.map((section, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    {section.heading && (
                      <span className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
                        {section.heading}
                      </span>
                    )}
                    {section.lines.map((line, j) => (
                      <p key={j} className="m-0">
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <form
                noValidate
                onSubmit={askDetails}
                className="flex flex-col gap-3 border-t border-hairline pt-4"
              >
                <p className="m-0 text-body-sm text-fg-secondary">
                  {t("documents.verify.detailsIntro")}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <TextField
                    type="date"
                    label={t("documents.verify.dob")}
                    value={dob}
                    error={dobMissing ? t("documents.verify.dobRequired") : undefined}
                    onChange={(e) => {
                      setDob(e.target.value);
                      setDobMissing(false);
                    }}
                    className="w-56"
                  />
                  <Button type="submit" variant="secondary" loading={details.isPending}>
                    {t("documents.verify.showDetails")}
                  </Button>
                </div>
                {details.isError && (
                  <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
                    {isApiError(details.error) && details.error.status === 422
                      ? t("documents.verify.dobMismatch")
                      : t("documents.failed")}
                  </p>
                )}
              </form>
            )}
          </Card>
        ) : null}
      </PageContainer>
    </PublicLayout>
  );
}

/** /shared/:token (S7-F7, D5): a document a patient shared, until the link expires. */
export function SharedDocumentPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const { token = "" } = useParams();
  const shared = useQuery({
    queryKey: ["shared-document", token],
    queryFn: () => api.documents.public.shared(token),
    retry: false,
  });
  return (
    <PublicLayout>
      <div className="mx-auto flex w-full max-w-[36rem] flex-col gap-6 px-4 py-10 sm:px-6">
        <PageHeading title={t("documents.shared.title")}>{t("documents.shared.title")}</PageHeading>
        {shared.isPending ? (
          <Skeleton height="8rem" className="rounded-lg" />
        ) : shared.isError ? (
          <Alert tone="warning" role="alert" title={t("documents.shared.gone")}>
            {t("documents.shared.goneBody")}
          </Alert>
        ) : (
          <Card className="flex flex-col gap-3">
            <span className="text-h3 font-semibold">{t(`documents.kind.${shared.data.kind}`)}</span>
            <span className="text-fg-secondary">
              {shared.data.facility_name} · {date(shared.data.document_date)} ·{" "}
              <span className="font-mono">{shared.data.number}</span>
            </span>
            <Button
              className="self-start"
              onClick={async () => {
                // the link inside lasts five minutes: fetch a fresh one when it has run out
                const fresh =
                  Date.parse(shared.data.download.expires_at) > Date.now()
                    ? shared.data
                    : (await shared.refetch()).data;
                if (fresh) openFile(fresh.download);
              }}
            >
              <DownloadSimple aria-hidden="true" className="size-icon" />
              {t("documents.download")}
            </Button>
            <span className="text-body-sm text-fg-muted">
              {t("documents.shared.until", { date: date(shared.data.expires_at, true) })}
            </span>
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
