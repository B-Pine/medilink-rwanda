import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "./Alert";
import { Button } from "./Button";
import { LoadingState } from "./Spinner";

export interface DocumentViewerLabels {
  zoomIn: string;
  zoomOut: string;
  rotate: string;
  previousPage: string;
  nextPage: string;
  page: (page: number, pages: number) => string;
  download: string;
  loading: string;
  error: string;
  retry: string;
}

export interface DocumentViewerProps {
  /** Sniffed MIME type of the stored file (`application/pdf`, `image/jpeg`, `image/png`). */
  contentType: string;
  filename: string;
  /**
   * Fetch a fresh short-lived signed link (5 minutes). Called on every view and every download;
   * links are never cached (security 06 §6).
   */
  getLink: (disposition: "inline" | "attachment") => Promise<{ url: string }>;
  labels: DocumentViewerLabels;
  className?: string;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface PdfPage {
  getViewport: (o: { scale: number; rotation: number }) => { width: number; height: number };
  render: (o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    canvas: HTMLCanvasElement;
  }) => {
    promise: Promise<void>;
  };
}
interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
}

async function loadPdf(url: string): Promise<PdfDocument> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  // No eval (security 06 §6, contract "isEvalSupported: false"): pdf.js 6 removed eval-based
  // font compilation altogether, so the option no longer exists. XFA forms stay off.
  const task = pdfjs.getDocument({ url, enableXfa: false, withCredentials: false });
  return (await task.promise) as unknown as PdfDocument;
}

/**
 * Image and PDF viewer for verification documents: zoom, rotate, pages, keyboard (+/- zoom,
 * r rotate, arrows pages) and a download button. pdf.js loads only when a PDF is opened.
 */
export function DocumentViewer({
  contentType,
  filename,
  getLink,
  labels,
  className,
}: DocumentViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(2); // index into ZOOM_STEPS (1x)
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPdf = contentType === "application/pdf";
  const scale = ZOOM_STEPS[zoom] ?? 1;

  const load = useCallback(() => {
    let cancelled = false;
    getLink("inline")
      .then((link) => !cancelled && setUrl(link.url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [getLink]);

  useEffect(() => load(), [load]);

  function retry() {
    setFailed(false);
    setUrl(null);
    load();
  }

  useEffect(() => {
    if (!isPdf || !url) return;
    let cancelled = false;
    let loaded: PdfDocument | null = null;
    loadPdf(url)
      .then((doc) => {
        loaded = doc;
        if (cancelled) return;
        setPdf(doc);
        setPages(doc.numPages);
        setPage(1);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [isPdf, url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    void pdf.getPage(page).then(async (pdfPage) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const viewport = pdfPage.getViewport({ scale: scale * 1.5, rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (context) await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale, rotation]);

  async function download() {
    try {
      const link = await getLink("attachment");
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.rel = "noopener";
      anchor.click();
    } catch {
      setFailed(true);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "+" || event.key === "=")
      setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length - 1));
    else if (event.key === "-") setZoom((z) => Math.max(z - 1, 0));
    else if (event.key.toLowerCase() === "r") setRotation((r) => (r + 90) % 360);
    else if (event.key === "ArrowRight" && isPdf) setPage((p) => Math.min(p + 1, pages));
    else if (event.key === "ArrowLeft" && isPdf) setPage((p) => Math.max(p - 1, 1));
    else return;
    event.preventDefault();
  }

  return (
    <section
      className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}
      aria-label={filename}
    >
      {/* Shortcuts work while focus is in the toolbar: +/- zoom, r rotate, arrows change page. */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="toolbar"
        aria-label={filename}
        onKeyDown={onKeyDown}
      >
        <Button
          variant="ghost"
          aria-label={labels.zoomOut}
          onClick={() => setZoom((z) => Math.max(z - 1, 0))}
        >
          <MagnifyingGlassMinus aria-hidden="true" />
        </Button>
        <span className="min-w-12 text-center text-body-sm">{Math.round(scale * 100)}%</span>
        <Button
          variant="ghost"
          aria-label={labels.zoomIn}
          onClick={() => setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))}
        >
          <MagnifyingGlassPlus aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          aria-label={labels.rotate}
          onClick={() => setRotation((r) => (r + 90) % 360)}
        >
          <ArrowClockwise aria-hidden="true" />
        </Button>
        {isPdf && (
          <>
            <Button
              variant="ghost"
              aria-label={labels.previousPage}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <CaretLeft aria-hidden="true" />
            </Button>
            <span className="text-body-sm">{labels.page(page, pages)}</span>
            <Button
              variant="ghost"
              aria-label={labels.nextPage}
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <CaretRight aria-hidden="true" />
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          iconStart={<DownloadSimple aria-hidden="true" />}
          onClick={() => void download()}
          className="ml-auto"
        >
          {labels.download}
        </Button>
      </div>
      <div className="flex min-h-64 items-center justify-center overflow-auto rounded-md border border-border bg-subtle p-2">
        {failed ? (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center gap-3">
              <span>{labels.error}</span>
              <Button variant="secondary" onClick={retry}>
                {labels.retry}
              </Button>
            </div>
          </Alert>
        ) : !url ? (
          <LoadingState label={labels.loading} />
        ) : isPdf ? (
          <canvas ref={canvasRef} aria-label={labels.page(page, pages)} className="max-w-none" />
        ) : (
          <img
            src={url}
            alt={filename}
            referrerPolicy="no-referrer"
            style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
            className="max-w-full origin-center transition-transform"
          />
        )}
      </div>
    </section>
  );
}
