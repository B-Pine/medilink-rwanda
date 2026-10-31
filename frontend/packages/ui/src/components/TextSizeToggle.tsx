import { TextAa } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { readPreference, writePreference } from "../preferences/storage";
import { cx } from "../utils/cx";

/** Text size for the patient app (design 07 §3.5): every size is in rem, so this scales the page. */
export type TextSize = "normal" | "large" | "xlarge";
export const TEXT_SIZES: readonly TextSize[] = ["normal", "large", "xlarge"];

const isTextSize = (value: unknown): value is TextSize =>
  value === "normal" || value === "large" || value === "xlarge";

export function storedTextSize(): TextSize {
  const value = readPreference("textSize");
  return isTextSize(value) ? value : "normal";
}

/** Apply a text size to <html> (`data-text-size`, see base.css); "normal" removes it. */
export function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  if (size === "normal") delete root.dataset.textSize;
  else root.dataset.textSize = size;
}

/** Apply the stored text size before the first render. */
export function initTextSize(): TextSize {
  const size = storedTextSize();
  applyTextSize(size);
  return size;
}

/** The sample letter is a size swatch, not text to translate. */
const SAMPLE_GLYPH = "A";
const SAMPLE: Record<TextSize, string> = {
  normal: "text-body",
  large: "text-h3",
  xlarge: "text-h2",
};

/** Normal / Large / Extra large as a segmented radio group; each option shows its own size. */
export function TextSizeToggle({ className }: { className?: string }) {
  const { t } = useTranslation("ui");
  const [size, setSize] = useState<TextSize>(storedTextSize);
  const name = `text-size-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const choose = (next: TextSize) => {
    setSize(next);
    applyTextSize(next);
    writePreference("textSize", next === "normal" ? null : next);
  };

  return (
    <fieldset className={cx("m-0 min-w-0 border-0 p-0", className)}>
      <legend className="mb-1.5 flex items-center gap-2 p-0 font-semibold text-fg">
        <TextAa aria-hidden="true" className="size-5 text-fg-muted" />
        {t("textSize.label")}
      </legend>
      <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-subtle p-1">
        {TEXT_SIZES.map((option) => {
          const id = `${name}-${option}`;
          const checked = size === option;
          return (
            <div key={option} className="relative">
              <input
                id={id}
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => choose(option)}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <label
                htmlFor={id}
                className={cx(
                  "flex min-h-target cursor-pointer items-center gap-2 rounded-sm px-3 font-semibold",
                  "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  checked ? "bg-surface text-fg shadow-raised" : "text-fg-muted hover:text-fg",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx("font-heading leading-none", SAMPLE[option])}
                >
                  {SAMPLE_GLYPH}
                </span>
                {t(`textSize.${option}`)}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
