import { isApiError, pickText } from "@medilink/api-client";
import { ArrowLeft, FileX } from "@phosphor-icons/react";
import { Alert, Button, Card, EmptyState, Skeleton } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { ContactCard } from "./HelpCenter";
import { ArticleText, FallbackNote, helpKeys, useLanguage } from "./shared";

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link to={paths.help} className="inline-flex min-h-target items-center gap-2 font-semibold">
      <ArrowLeft aria-hidden="true" />
      {t("help.article.back")}
    </Link>
  );
}

/** /support/articles/:slug: one article as plain text (S10-F2). */
export function ArticlePage() {
  const { t } = useTranslation();
  const api = useApi();
  const lang = useLanguage();
  const { slug = "" } = useParams();
  const article = useQuery({
    queryKey: helpKeys.article(slug),
    queryFn: () => api.help.public.article(slug),
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
  });

  if (article.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4" aria-busy="true">
        <Skeleton height="2.5rem" className="rounded-md" />
        <Skeleton height="12rem" className="rounded-lg" />
      </div>
    );
  }
  if (article.isError) {
    const missing = isApiError(article.error) && article.error.status === 404;
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
        <BackLink />
        {missing ? (
          <>
            <PageHeading title={t("help.article.notFound")}>
              {t("help.article.notFound")}
            </PageHeading>
            <EmptyState
              icon={FileX}
              title={t("help.article.notFound")}
              description={t("help.article.notFoundBody")}
            />
          </>
        ) : (
          <Alert tone="danger" role="alert" title={t("help.loadFailed")}>
            <Button variant="secondary" onClick={() => void article.refetch()}>
              {t("help.retry")}
            </Button>
          </Alert>
        )}
      </div>
    );
  }
  const a = article.data;
  const title = pickText(a.title_i18n, lang);
  const body = pickText(a.body_i18n, lang);
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
      <BackLink />
      <PageHeading title={title.text}>
        <span lang={title.language ?? undefined}>{title.text}</span>
      </PageHeading>
      <FallbackNote texts={[a.body_i18n]} />
      <Card as="article" aria-label={title.text} className="text-[1.125rem]">
        <ArticleText body={body.text} lang={body.language ?? undefined} />
      </Card>
      <ContactCard />
    </div>
  );
}
