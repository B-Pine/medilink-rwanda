import { Camera, ArrowCounterClockwise, Check } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "./Button";

export interface CameraCaptureLabels {
  start: string;
  capture: string;
  retake: string;
  use: string;
  chooseFile: string;
  unavailable: string;
}

export interface CameraCaptureProps {
  labels: CameraCaptureLabels;
  /** Called with the chosen photo (JPEG from the camera, or the picked file). No upload here. */
  onCapture: (blob: Blob) => void;
  disabled?: boolean;
}

/**
 * Photo capture (sprint-03 §6.3): camera preview with retake, or a file input with
 * `capture="environment"` when the camera is denied or missing (NFR-NET-04).
 */
export function CameraCapture({ labels, onCapture, disabled }: CameraCaptureProps) {
  const fileId = useId();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "live" | "preview" | "fallback">("idle");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(
    () => () => {
      stop();
      if (photo) URL.revokeObjectURL(photo.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("fallback");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setState("live");
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play().catch(() => undefined);
      }
    } catch {
      setState("fallback");
    }
  };

  const capture = () => {
    const el = video.current;
    if (!el) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth || 1280;
    canvas.height = el.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stop();
        setPhoto({ blob, url: URL.createObjectURL(blob) });
        setState("preview");
      },
      "image/jpeg",
      0.9,
    );
  };

  const retake = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    void start();
  };

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={video}
        hidden={state !== "live"}
        className="w-full max-w-md rounded-md bg-black"
        playsInline
        muted
      />
      {state === "preview" && photo && (
        <img src={photo.url} alt="" className="w-full max-w-md rounded-md" />
      )}
      {state === "fallback" && (
        <p role="status" className="text-small text-fg-muted">
          {labels.unavailable}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "idle" && (
          <Button variant="secondary" onClick={() => void start()} disabled={disabled}>
            <Camera aria-hidden="true" />
            {labels.start}
          </Button>
        )}
        {state === "live" && (
          <Button onClick={capture}>
            <Camera aria-hidden="true" />
            {labels.capture}
          </Button>
        )}
        {state === "preview" && photo && (
          <>
            <Button variant="secondary" onClick={retake}>
              <ArrowCounterClockwise aria-hidden="true" />
              {labels.retake}
            </Button>
            <Button onClick={() => onCapture(photo.blob)} disabled={disabled}>
              <Check aria-hidden="true" />
              {labels.use}
            </Button>
          </>
        )}
        {(state === "idle" || state === "fallback") && (
          <label
            htmlFor={fileId}
            className="inline-flex min-h-target cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-body"
          >
            {labels.chooseFile}
            <input
              id={fileId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onCapture(file);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
