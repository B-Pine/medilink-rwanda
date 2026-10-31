import {
  ArrowRight,
  Buildings,
  CalendarCheck,
  Clock,
  MagnifyingGlass,
  type Icon,
} from "@phosphor-icons/react";
import { Button, buttonClassName, Card, ImigongoPattern, SelectField } from "@medilink/ui";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { PageHeading } from "../components/PageHeading";
import { PublicLayout } from "../layout/PublicLayout";
import {
  DISTRICT_KEYS,
  INSURER_KEYS,
  field,
  searchUrl,
  SERVICE_KEYS,
} from "../features/booking/discovery";
import { HeroIllustration } from "./HeroIllustration";
import { FaqSection, RecordsSection, TrackerShowcase, TrustSection } from "./LandingSections";

const SERVICES = SERVICE_KEYS;
const DISTRICTS = DISTRICT_KEYS;
const INSURERS = INSURER_KEYS;

const STEPS: { key: 1 | 2 | 3; icon: Icon }[] = [
  { key: 1, icon: MagnifyingGlass },
  { key: 2, icon: CalendarCheck },
  { key: 3, icon: Clock },
];

/**
 * Public landing skeleton (design 06 §3): deep forest hero with the search box as the hero
 * (placeholder until Sprint 5), how it works, trust, "for facilities" band, emergency notice
 * and footer (in the layout). Works without an account (H2).
 */
export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [service, setService] = useState("");

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void navigate(
      searchUrl({
        service,
        district: field(form, "district"),
        insurer: field(form, "insurer"),
      }),
    );
  };

  return (
    <PublicLayout>
      {/* Hero: emerald-950 + Imigongo line pattern (combination B). Video comes later. */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden bg-forest text-on-forest"
        id="find-care"
      >
        <ImigongoPattern opacity={0.06} />
        <div className="relative mx-auto flex max-w-[70rem] flex-col gap-8 px-4 py-12 sm:px-6 lg:py-20">
          <div className="flex items-end justify-between gap-8">
            <div className="flex max-w-2xl flex-col gap-4">
              <PageHeading
                title={t("landing.title")}
                id="hero-title"
                className="text-display text-on-forest"
              >
                {t("landing.heroTitle")}
              </PageHeading>
              <p className="m-0 text-h3 font-normal text-on-forest-muted">
                {t("landing.heroBody")}
              </p>
            </div>
            <HeroIllustration className="hidden w-[22rem] shrink-0 drop-shadow-xl lg:block" />
          </div>

          <Card as="div" className="text-fg shadow-raised">
            <form
              onSubmit={onSearch}
              aria-label={t("landing.search.title")}
              className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end"
            >
              <SelectField
                id="search-service"
                label={t("landing.search.service")}
                value={service}
                onChange={(event) => setService(event.target.value)}
              >
                <option value="">{t("landing.search.serviceAny")}</option>
                {SERVICES.map((key) => (
                  <option key={key} value={key}>
                    {t(`landing.services.${key}`)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="search-location"
                name="district"
                label={t("landing.search.location")}
                defaultValue=""
              >
                <option value="">{t("landing.search.locationAny")}</option>
                {DISTRICTS.map((key) => (
                  <option key={key} value={key}>
                    {t(`landing.districts.${key}`)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="search-insurance"
                name="insurer"
                label={t("landing.search.insurance")}
                defaultValue=""
              >
                <option value="">{t("landing.search.insuranceAny")}</option>
                {INSURERS.map((key) => (
                  <option key={key} value={key}>
                    {t(`landing.insurers.${key}`)}
                  </option>
                ))}
              </SelectField>
              <Button
                type="submit"
                size="lg"
                iconStart={<MagnifyingGlass aria-hidden="true" className="size-icon" />}
              >
                {t("landing.search.submit")}
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-body-sm font-semibold text-fg-muted">
                {t("landing.search.popular")}
              </span>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {SERVICES.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      aria-pressed={service === key}
                      onClick={() => setService(key)}
                      className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
                    >
                      {t(`landing.services.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="how-title" id="how-it-works" className="scroll-mt-4">
        <div className="mx-auto flex max-w-[70rem] flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
          <h2 id="how-title" className="m-0 text-h1">
            {t("landing.how.title")}
          </h2>
          <ol className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
            {STEPS.map(({ key, icon: StepIcon }) => (
              <li key={key}>
                <Card className="flex h-full flex-col gap-3">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-subtle text-on-brand-subtle">
                    <StepIcon aria-hidden="true" weight="bold" className="size-6" />
                  </span>
                  <h3 className="m-0 text-h3">{t(`landing.how.step${key}Title`)}</h3>
                  <p className="m-0 text-fg-secondary">{t(`landing.how.step${key}Body`)}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <TrackerShowcase />

      <RecordsSection />

      <TrustSection />

      <section aria-labelledby="facilities-title" className="bg-brand-subtle">
        <div className="mx-auto flex max-w-[70rem] flex-col items-start gap-4 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <Buildings
              aria-hidden="true"
              weight="bold"
              className="size-10 shrink-0 text-on-brand-subtle"
            />
            <div className="flex flex-col gap-2">
              <h2 id="facilities-title" className="m-0 text-h2 text-on-brand-subtle">
                {t("landing.facilities.title")}
              </h2>
              <p className="m-0 max-w-xl text-fg">{t("landing.facilities.body")}</p>
            </div>
          </div>
          <Link
            to="/for-facilities"
            className={buttonClassName({ variant: "secondary", size: "lg" })}
          >
            {t("landing.facilities.cta")}
            <ArrowRight aria-hidden="true" className="size-icon" />
          </Link>
        </div>
      </section>

      <FaqSection />
    </PublicLayout>
  );
}
