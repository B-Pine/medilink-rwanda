import {
  isApiError,
  isImageUploadError,
  type ImageKind,
  type ImagesApi,
} from "@medilink/api-client";
import { useCallback, useState } from "react";
import type { TFunction } from "i18next";

import { errorText } from "./shared";

/** 503 `uploads_unavailable`: the server has no Cloudinary account (local development). */
export function isUploadsUnavailable(error: unknown): boolean {
  return isApiError(error) && error.status === 503;
}

/** What to say when an image upload fails (before, during or after the Cloudinary leg). */
export function imageErrorText(error: unknown, t: TFunction, fallback: string): string | undefined {
  if (isImageUploadError(error)) return t(`setup.images.${error.code}`);
  if (isUploadsUnavailable(error)) return t("setup.images.unavailable");
  return errorText(error, fallback);
}

/** Signed direct upload to Cloudinary with progress; resolves with the public id. */
export function useImageUpload(images: ImagesApi, kind: ImageKind) {
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useCallback(
    async (file: File) => {
      setProgress(0);
      try {
        return (await images.upload(file, kind, setProgress)).public_id;
      } finally {
        setProgress(null);
      }
    },
    [images, kind],
  );
  return { upload, progress };
}
