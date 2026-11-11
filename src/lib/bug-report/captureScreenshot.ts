/**
 * Viewport screenshot via html-to-image. Returns a canvas at `scale` CSS→px
 * so annotation coordinates can be mapped as rect * scale.
 */

const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export interface CapturedScreenshot {
  canvas: HTMLCanvasElement;
  scale: number;
}

export async function captureViewport(): Promise<CapturedScreenshot | null> {
  if (typeof window === "undefined") return null;
  const { toCanvas } = await import("html-to-image");
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const sx = window.scrollX;
  const sy = window.scrollY;
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";

  try {
    const canvas = await toCanvas(document.body, {
      width: w,
      height: h,
      canvasWidth: w,
      canvasHeight: h,
      pixelRatio: scale,
      backgroundColor: bg,
      cacheBust: false,
      imagePlaceholder: TRANSPARENT_PX,
      style: sx || sy ? { transform: `translate(${-sx}px, ${-sy}px)` } : undefined,
      filter: (node) => !(node instanceof Element && node.hasAttribute("data-bug-ignore")),
    });
    return { canvas, scale };
  } catch (err) {
    console.warn("[bug-report] screenshot failed", err);
    return null;
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.85): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}
