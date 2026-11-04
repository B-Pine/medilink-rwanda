import { TIMES_OF_DAY, type DosingLabel, type TimeOfDay } from "@medilink/api-client";
import { cx } from "@medilink/ui";
import { ArrowRight, ForkKnife, Moon, Pill, Plus, Sun, SunHorizon } from "@phosphor-icons/react";
import type { TFunction } from "i18next";

/**
 * Label pictograms (#207, upgrade 13 W8) for patients who cannot read the label well: the four
 * times of the day with the ones to take marked, and the medicine before, with or after food.
 * Black on white only, so it prints on a thermal printer; every picture has its word under it.
 */

function TimeIcon({ time }: { time: TimeOfDay }) {
  const props = { "aria-hidden": true, className: "size-[7mm]" } as const;
  switch (time) {
    case "morning":
      return <SunHorizon {...props} weight="bold" />;
    case "noon":
      return <Sun {...props} weight="bold" />;
    case "evening":
      return <SunHorizon {...props} weight="fill" />;
    case "night":
      return <Moon {...props} weight="fill" />;
  }
}

export function DoseSchedule({ label, t }: { label: DosingLabel; t: TFunction }) {
  if (!label.times.length) {
    const word =
      label.frequency_code === "prn" ? t("pharmacy.labels.whenNeeded") : t("pharmacy.labels.once");
    return <p className="m-0 text-[10pt] font-bold">{word}</p>;
  }
  return (
    <ol
      aria-label={t("pharmacy.labels.schedule")}
      className="m-0 grid list-none grid-cols-4 gap-[1.5mm] p-0"
    >
      {TIMES_OF_DAY.map((time) => {
        const take = label.times.includes(time);
        return (
          <li
            key={time}
            className={cx(
              "flex flex-col items-center gap-[0.5mm] rounded-[1.5mm] py-[1mm] text-[7pt] leading-none",
              take
                ? "border-[0.6mm] border-black font-bold"
                : "border border-dashed border-black/50",
            )}
          >
            <span className={take ? undefined : "opacity-40"}>
              <TimeIcon time={time} />
            </span>
            <span>{t(`pharmacy.labels.times.${time}`)}</span>
            <span aria-hidden="true" className="h-[3mm] text-[9pt] leading-none">
              {take ? label.dose.split(" ")[0] : ""}
            </span>
            <span className="sr-only">{take ? label.dose : "—"}</span>
          </li>
        );
      })}
    </ol>
  );
}

const ICON = { "aria-hidden": true, weight: "bold", className: "size-[6mm]" } as const;
const ARROW = { "aria-hidden": true, weight: "bold", className: "size-[3.5mm]" } as const;

export function MealPictogram({ label }: { label: DosingLabel }) {
  if (!label.meal_timing) return null;
  const pictures = {
    before_food: [
      <Pill key="p" {...ICON} />,
      <ArrowRight key="a" {...ARROW} />,
      <ForkKnife key="f" {...ICON} />,
    ],
    with_food: [
      <Pill key="p" {...ICON} />,
      <Plus key="a" {...ARROW} />,
      <ForkKnife key="f" {...ICON} />,
    ],
    after_food: [
      <ForkKnife key="f" {...ICON} />,
      <ArrowRight key="a" {...ARROW} />,
      <Pill key="p" {...ICON} />,
    ],
  }[label.meal_timing];
  return (
    <p className="m-0 flex items-center gap-[1.5mm] text-[10pt] font-bold">
      <span className="inline-flex items-center gap-[0.5mm]">{pictures}</span>
      {label.meal}
    </p>
  );
}
