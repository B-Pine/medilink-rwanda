import { Button, cx, Spinner } from "@medilink/ui";
import { CheckCircle, Flask, MinusCircle, WarningCircle, type Icon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import type { OrderSetReport } from "./orderSet";

type Tone = "done" | "same" | "attention";

const TONE: Record<Tone, { icon: Icon; className: string }> = {
  done: { icon: CheckCircle, className: "text-success" },
  same: { icon: MinusCircle, className: "text-fg-muted" },
  attention: { icon: WarningCircle, className: "text-attention" },
};

function Line({ tone, children }: { tone: Tone; children: string }) {
  const { icon: LineIcon, className } = TONE[tone];
  return (
    <li className="flex items-start gap-2.5">
      <LineIcon
        aria-hidden="true"
        weight="fill"
        className={cx("mt-0.5 size-5 shrink-0", className)}
      />
      <span>{children}</span>
    </li>
  );
}

/**
 * What an order set did to the draft (W3, #202), line by line: added, already there, or needs
 * the doctor. Lab tests are listed to order by hand until lab orders join order sets.
 */
export function OrderSetSummary({
  report: r,
  busy,
  onDone,
  onAnother,
}: {
  report: OrderSetReport;
  busy: boolean;
  onDone: () => void;
  onAnother: () => void;
}) {
  const { t } = useTranslation();
  const k = "clinical.orderSet";
  const list = (names: string[]) => names.join(", ");
  const needsYou = r.diagnosesSkipped.length + r.medicinesFailed.length + r.tests.length > 0;
  return (
    <div className="flex flex-col gap-4" aria-busy={busy}>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 font-heading text-h3">{t(`${k}.applied`, { name: r.name })}</h3>
        <p className="m-0 text-body-sm text-fg-secondary">{t(`${k}.review`)}</p>
      </div>
      <ul
        aria-label={t(`${k}.listLabel`)}
        aria-live="polite"
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {r.diagnosesAdded.length > 0 && (
          <Line tone="done">{t(`${k}.diagnosesAdded`, { names: list(r.diagnosesAdded) })}</Line>
        )}
        {r.diagnosesAlready.length > 0 && (
          <Line tone="same">{t(`${k}.diagnosesAlready`, { names: list(r.diagnosesAlready) })}</Line>
        )}
        {r.diagnosesSkipped.length > 0 && (
          <Line tone="attention">
            {t(`${k}.diagnosesSkipped`, { names: list(r.diagnosesSkipped) })}
          </Line>
        )}
        {r.sections.length > 0 && (
          <Line tone="done">
            {t(`${k}.sections`, {
              names: list(r.sections.map((s) => t(`clinical.templates.sections.${s}`))),
            })}
          </Line>
        )}
        {r.medicinesAdded.length > 0 && (
          <Line tone="done">{t(`${k}.medicinesAdded`, { names: list(r.medicinesAdded) })}</Line>
        )}
        {r.medicinesAlready.length > 0 && (
          <Line tone="same">{t(`${k}.medicinesAlready`, { names: list(r.medicinesAlready) })}</Line>
        )}
        {r.medicinesFailed.length > 0 && (
          <Line tone="attention">
            {t(`${k}.medicinesFailed`, { names: list(r.medicinesFailed) })}
          </Line>
        )}
        {r.tests.length > 0 && (
          <li className="flex items-start gap-2.5">
            <Flask
              aria-hidden="true"
              weight="fill"
              className="mt-0.5 size-5 shrink-0 text-attention"
            />
            <span>{t(`${k}.tests`, { names: list(r.tests) })}</span>
          </li>
        )}
      </ul>
      {busy && (
        <p className="m-0 flex items-center gap-2 text-body-sm text-fg-secondary">
          <Spinner size="sm" />
          {t(`${k}.adding`)}
        </p>
      )}
      <p className="m-0 text-body-sm text-fg-secondary">
        {needsYou ? t(`${k}.needsYou`) : t(`${k}.stillSign`)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button pill onClick={onDone} disabled={busy}>
          {t(`${k}.done`)}
        </Button>
        <Button variant="ghost" pill onClick={onAnother} disabled={busy}>
          {t(`${k}.another`)}
        </Button>
      </div>
    </div>
  );
}
