import * as RadixDialog from "@radix-ui/react-dialog";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useRef, type KeyboardEvent } from "react";

import { cx } from "../utils/cx";

export interface LightboxImage {
  src: string;
  alt: string;
}

export interface LightboxProps {
  images: LightboxImage[];
  /** The open image, or null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  labels: {
    close: string;
    previous: string;
    next: string;
  };
}

/**
 * Photos full size in a focus-trapped dialog (Radix): Escape closes, the arrow keys and the two
 * buttons step through, focus returns to the thumbnail that opened it. Each image keeps its alt,
 * which is also the dialog's name (so it should say which photo of how many).
 */
export function Lightbox({ images, index, onIndexChange, labels }: LightboxProps) {
  const open = index !== null && images[index] !== undefined;
  // opened from outside (no Radix trigger), so remember what had focus to give it back on close
  const opener = useRef<HTMLElement | null>(null);
  const total = images.length;
  const current = open ? images[index] : undefined;
  const step = (by: number) => {
    if (index === null || total < 2) return;
    onIndexChange((index + by + total) % total);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
    else return;
    event.preventDefault();
  };
  const control =
    // the theme resets Tailwind's colours, so black and white are written out; the photo stage is
    // dark in both themes
    "grid size-12 cursor-pointer place-items-center rounded-full bg-[rgb(0_0_0/0.6)] text-[#fff] transition-colors duration-150 hover:bg-[rgb(0_0_0/0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff]";

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[60] bg-[rgb(0_0_0/0.9)] data-[state=open]:animate-fade" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          // runs before focus moves in, so the thumbnail still has it
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
            opener.current = null;
          }}
          className="fixed inset-0 z-[61] flex flex-col items-center justify-center gap-3 p-4 outline-none sm:p-10"
        >
          <RadixDialog.Title className="sr-only">{current?.alt ?? ""}</RadixDialog.Title>
          {current && (
            <img
              key={current.src}
              src={current.src}
              alt={current.alt}
              decoding="async"
              className="max-h-[calc(100dvh-8rem)] max-w-full rounded-md object-contain shadow-lg"
            />
          )}
          {total > 1 && (
            <p
              aria-hidden="true"
              className="m-0 rounded-full bg-[rgb(0_0_0/0.6)] px-3 py-1 text-body-sm font-semibold text-[#fff] tabular-nums"
            >
              {(index ?? 0) + 1} / {total}
            </p>
          )}
          <RadixDialog.Close asChild>
            <button
              type="button"
              aria-label={labels.close}
              className={cx(control, "absolute top-4 right-4")}
            >
              <X aria-hidden="true" weight="bold" className="size-5" />
            </button>
          </RadixDialog.Close>
          {total > 1 && (
            <>
              <button
                type="button"
                aria-label={labels.previous}
                onClick={() => step(-1)}
                className={cx(control, "absolute top-1/2 left-3 -translate-y-1/2 sm:left-6")}
              >
                <CaretLeft aria-hidden="true" weight="bold" className="size-5" />
              </button>
              <button
                type="button"
                aria-label={labels.next}
                onClick={() => step(1)}
                className={cx(control, "absolute top-1/2 right-3 -translate-y-1/2 sm:right-6")}
              >
                <CaretRight aria-hidden="true" weight="bold" className="size-5" />
              </button>
            </>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
