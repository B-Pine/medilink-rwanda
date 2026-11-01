import { readPreference, writePreference } from "@medilink/ui";
import { Alert, Button, Card, cx } from "@medilink/ui";
import { BellRinging, BellSlash, DeviceMobile, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePush } from "./api";

/**
 * Push opt-in (contract §6.2, FR-NOT-03): the reason first, then `Notification.requestPermission()`
 * only when the button is pressed. States: on (with Turn off), off, denied (how to re-enable),
 * unsupported, iOS not installed ("Add to Home Screen"). Hidden while the server has push off.
 * Exported for S5 (shown after a booking).
 */
export function PushOptIn({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { state, turnOn, turnOff } = usePush();
  if (state === "disabled" || state === "loading") return null;
  const failed = turnOn.isError || turnOff.isError;

  const body = (() => {
    switch (state) {
      case "on":
        return (
          <>
            <p className="m-0 flex items-center gap-2 font-semibold text-success">
              <BellRinging aria-hidden="true" weight="fill" className="size-6" />
              {t("notifications.push.on")}
            </p>
            <p className="m-0 text-fg-secondary">{t("notifications.push.onBody")}</p>
            <Button
              variant="secondary"
              className="self-start"
              loading={turnOff.isPending}
              onClick={() => turnOff.mutate()}
            >
              {t("notifications.push.turnOff")}
            </Button>
          </>
        );
      case "off":
        return (
          <>
            <p className="m-0 font-semibold text-fg">{t("notifications.push.why")}</p>
            <p className="m-0 text-fg-secondary">{t("notifications.push.whyBody")}</p>
            <Button
              size="lg"
              className="self-start"
              loading={turnOn.isPending}
              onClick={() => turnOn.mutate()}
              iconStart={<BellRinging aria-hidden="true" className="size-icon" />}
            >
              {t("notifications.push.turnOn")}
            </Button>
          </>
        );
      case "denied":
        return (
          <>
            <p className="m-0 flex items-center gap-2 font-semibold text-fg">
              <BellSlash aria-hidden="true" className="size-6" />
              {t("notifications.push.denied")}
            </p>
            <p className="m-0 text-fg-secondary">{t("notifications.push.deniedBody")}</p>
          </>
        );
      case "ios-not-installed":
        return (
          <>
            <p className="m-0 flex items-center gap-2 font-semibold text-fg">
              <DeviceMobile aria-hidden="true" className="size-6" />
              {t("notifications.push.ios")}
            </p>
            <ol className="m-0 flex flex-col gap-1 pl-6 text-fg-secondary">
              <li>{t("notifications.push.iosStep1")}</li>
              <li>{t("notifications.push.iosStep2")}</li>
              <li>{t("notifications.push.iosStep3")}</li>
            </ol>
          </>
        );
      default:
        return (
          <>
            <p className="m-0 font-semibold text-fg">{t("notifications.push.unsupported")}</p>
            <p className="m-0 text-fg-secondary">{t("notifications.push.unsupportedBody")}</p>
          </>
        );
    }
  })();

  return (
    <div
      className={cx(
        "flex flex-col gap-3",
        !compact && "rounded-lg border border-border bg-surface p-5",
      )}
    >
      {body}
      {failed && (
        <Alert tone="danger" role="alert">
          {t("notifications.push.failed")}
        </Alert>
      )}
    </div>
  );
}

const DISMISS_DAYS = 7;

function dismissedNow(): boolean {
  const until = Date.parse(readPreference("pushBannerDismissedUntil") ?? "");
  return Number.isFinite(until) && until > Date.now();
}

/**
 * "Turn on alerts so we can tell you when to leave" (design 07 §3.1): shown while push is
 * supported but off; "Not now" hides it for 7 days (a UI flag in localStorage, no personal data;
 * storage errors are ignored inside `writePreference`).
 */
export function PushOffBanner() {
  const { t } = useTranslation();
  const { state, turnOn } = usePush();
  const [dismissed, setDismissed] = useState(dismissedNow);
  if (state !== "off" || dismissed) return null;
  const dismiss = () => {
    writePreference(
      "pushBannerDismissedUntil",
      new Date(Date.now() + DISMISS_DAYS * 86_400_000).toISOString(),
    );
    setDismissed(true);
  };
  return (
    <Card
      as="section"
      aria-labelledby="push-off-banner"
      padding="md"
      className="flex flex-col gap-3 border-brand bg-brand-subtle sm:flex-row sm:items-center"
    >
      <BellRinging aria-hidden="true" weight="duotone" className="size-8 shrink-0 text-brand" />
      <div className="flex flex-1 flex-col gap-1">
        <h2 id="push-off-banner" className="m-0 text-body font-bold text-on-brand-subtle">
          {t("notifications.banner.title")}
        </h2>
        <p className="m-0 text-body-sm text-on-brand-subtle">{t("notifications.banner.body")}</p>
        {turnOn.isError && (
          <p role="alert" className="m-0 text-body-sm font-semibold text-danger">
            {t("notifications.push.failed")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={turnOn.isPending} onClick={() => turnOn.mutate()}>
          {t("notifications.push.turnOn")}
        </Button>
        <Button
          variant="ghost"
          onClick={dismiss}
          iconStart={<X aria-hidden="true" className="size-icon" />}
        >
          {t("notifications.banner.notNow")}
        </Button>
      </div>
    </Card>
  );
}
