import { ArrowClockwise, Camera, FileArrowUp, Trash } from "@phosphor-icons/react";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";

import { cx } from "../utils/cx";
import { Badge, type BadgeTone } from "./Badge";
import { Button } from "./Button";

export type FileUploadStatus =
  "uploading" | "pending" | "clean" | "infected" | "rejected" | "failed" | "error";

export interface FileUploadItem {
  id: string;
  name: string;
  /** 0..1 while uploading. */
  progress?: number;
  status: FileUploadStatus;
  /** Server or client error for this file. */
  error?: string | undefined;
}

export interface FileUploadLabels {
  drop: string;
  browse: string;
  camera: string;
  hint: string;
  retry: string;
  remove: string;
  /** Text per status, e.g. { pending: "Checking for viruses", clean: "Ready" }. */
  status: Record<FileUploadStatus, string>;
  tooLarge: string;
  wrongType: string;
}

export interface FileUploadProps {
  label: ReactNode;
  labels: FileUploadLabels;
  items: FileUploadItem[];
  onFiles: (files: File[]) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  /** MIME types or extensions for the picker and the client pre-check. */
  accept?: string;
  maxBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Offer the phone camera (capture="environment"). */
  allowCamera?: boolean;
  error?: string | undefined;
  className?: string;
}

const TONES: Record<FileUploadStatus, BadgeTone> = {
  uploading: "info",
  pending: "info",
  clean: "success",
  infected: "danger",
  rejected: "danger",
  failed: "warning",
  error: "danger",
};

function accepted(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept.split(",").some((rule) => {
    const r = rule.trim().toLowerCase();
    if (r.startsWith(".")) return name.endsWith(r);
    if (r.endsWith("/*")) return file.type.startsWith(r.slice(0, -1));
    return file.type === r;
  });
}

/**
 * Drop zone + browse + phone camera (FR-DOC-03). Client checks (type, size) are only for fast
 * feedback; the server decides. Each file shows progress, a scan status badge (icon + text),
 * retry and remove; status changes are announced politely.
 */
export function FileUpload({
  label,
  labels,
  items,
  onFiles,
  onRetry,
  onRemove,
  accept,
  maxBytes,
  multiple = false,
  disabled = false,
  allowCamera = true,
  error,
  className,
}: FileUploadProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const tooLarge = maxBytes ? files.find((f) => f.size > maxBytes) : undefined;
    const wrong = files.find((f) => !accepted(f, accept));
    if (wrong) {
      setLocalError(labels.wrongType);
      return;
    }
    if (tooLarge) {
      setLocalError(labels.tooLarge);
      return;
    }
    setLocalError(undefined);
    onFiles(multiple ? files : files.slice(0, 1));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) take(event.dataTransfer.files);
  }

  const shownError = localError ?? error;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <span id={`${inputId}-label`} className="font-semibold text-fg">
        {label}
      </span>
      <p id={hintId} className="m-0 text-body-sm text-fg-muted">
        {labels.hint}
      </p>
      {shownError && (
        <p role="alert" className="m-0 font-semibold text-danger">
          {shownError}
        </p>
      )}
      {/* Drop target for mouse users; the Browse and camera buttons are the accessible way. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          "flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-4 py-6 text-center",
          dragging ? "border-primary bg-brand-subtle" : "border-border-input bg-surface",
          disabled && "opacity-70",
        )}
      >
        <FileArrowUp aria-hidden="true" className="size-8 text-fg-muted" />
        <p className="m-0 text-body text-fg-secondary">{labels.drop}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
            {labels.browse}
          </Button>
          {allowCamera && (
            <Button
              variant="ghost"
              disabled={disabled}
              iconStart={<Camera aria-hidden="true" />}
              onClick={() => cameraRef.current?.click()}
            >
              {labels.camera}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-labelledby={`${inputId}-label`}
          aria-describedby={hintId}
          onChange={(event) => {
            take(event.target.files);
            event.target.value = "";
          }}
        />
        {allowCamera && (
          <input
            ref={cameraRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept="image/*"
            capture="environment"
            aria-hidden="true"
            onChange={(event) => {
              take(event.target.files);
              event.target.value = "";
            }}
          />
        )}
      </div>
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-live="polite">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">{item.name}</span>
                <Badge tone={TONES[item.status]}>{labels.status[item.status]}</Badge>
              </div>
              {item.status === "uploading" && (
                <progress
                  className="h-2 w-full"
                  max={1}
                  value={item.progress ?? 0}
                  aria-label={`${item.name}: ${labels.status.uploading}`}
                />
              )}
              {item.error && (
                <p className="m-0 text-body-sm font-semibold text-danger">{item.error}</p>
              )}
              {(onRetry || onRemove) && item.status !== "uploading" && (
                <div className="flex flex-wrap gap-2">
                  {onRetry && ["error", "failed"].includes(item.status) && (
                    <Button
                      variant="ghost"
                      iconStart={<ArrowClockwise aria-hidden="true" />}
                      onClick={() => onRetry(item.id)}
                      aria-label={`${labels.retry}: ${item.name}`}
                    >
                      {labels.retry}
                    </Button>
                  )}
                  {onRemove && (
                    <Button
                      variant="ghost"
                      iconStart={<Trash aria-hidden="true" />}
                      onClick={() => onRemove(item.id)}
                      aria-label={`${labels.remove}: ${item.name}`}
                    >
                      {labels.remove}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
