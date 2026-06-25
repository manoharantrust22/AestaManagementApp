# Zoomable / pannable product images in `/company/materials`

- **Date:** 2026-06-25
- **Status:** Approved (design)
- **Surface:** `/company/materials` (Material Catalog)

## Problem

On the Material Catalog, product images are only shown as small thumbnails — on
the grid cards and in the material detail drawer ([MaterialInspectPane](../../../src/components/materials/MaterialInspectPane.tsx)).
There is no way to open a product image at full size, zoom in, and pan around to
inspect detail (e.g. read the label on a Dr. Fixit can). Clicking the detail-pane
thumbnail does nothing today.

## Goal

Click any product image in the catalog → open it in a full-screen viewer with
**zoom in/out** and **drag-to-pan**, then dismiss back to where you were. Applies
across the whole catalog surface (detail pane, grid cards, and the
Designs / Variants / Brands tabs).

## Reuse what already works

The app already ships [`BillViewerDialog`](../../../src/components/common/BillViewerDialog.tsx),
which uses `react-zoom-pan-pinch` (already a dependency, `^3.7.0`) and provides
exactly the interaction we want for images:

- drag-to-pan
- mouse-wheel zoom (desktop)
- pinch-to-zoom (mobile)
- double-click / double-tap to reset
- on-screen zoom in / out / fit buttons
- close on Esc / backdrop / button

We reuse this **interaction**, but extract a clean **image-only** version so we
are not bending a bill-specific component (alt="Vendor Bill", `bill-*.jpg`
download name, PDF branch) onto product images.

## Architecture

Three pieces, all additive.

### 1. `ImageZoomDialog` (new — `src/components/common/ImageZoomDialog.tsx`)

Presentational, **controlled** dialog. Image-only (no PDF branch).

Props:

```ts
interface ImageZoomDialogProps {
  open: boolean;
  src: string | null;
  title?: string;     // shown in header + used as alt text
  onClose: () => void;
}
```

Behaviour (mirrors `BillViewerDialog`'s image branch):

- Full-screen on mobile (`breakpoints.down("md")`), large modal (90vw/90vh) on desktop.
- `TransformWrapper` with `initialScale={1}`, `minScale={0.5}`, `maxScale={4}`,
  `centerOnInit`, `wheel.step` ~0.1, `doubleClick.mode="reset"`.
- Zoom in / out / reset (fit) icon buttons on desktop; a "Pinch to zoom •
  double-tap to reset" hint on mobile.
- Loading spinner until the image loads; on error, an "Open in new tab" fallback.
- Returns `null` when `src` is falsy.
- Zoom/pan state resets each time it opens (keyed by `open` + `src`).

### 2. `ImageViewerProvider` + `useImageViewer()` (new — `src/components/common/ImageViewerProvider.tsx`)

Mounts **one** `ImageZoomDialog` for its subtree and exposes an imperative opener,
so we do not prop-drill `open` / `src` / `onClose` through five call sites.

```ts
function useImageViewer(): { openImage: (args: { src: string; title?: string }) => void };
```

- `ImageViewerProvider` holds `{ open, src, title }` state, renders the dialog,
  and provides `openImage`.
- `useImageViewer()` is **no-op-safe**: if no provider is mounted above it,
  `openImage` is a no-op (does nothing, no throw). This keeps shared components
  that call it — notably `MaterialInspectPane`, which is reused elsewhere — safe
  on pages that don't wrap them in a provider.

### 3. Wiring

Wrap the `/company/materials` page subtree (the grid **and** the detail drawer,
which are rendered by the same page) in a single `<ImageViewerProvider>`. Then:

| Surface | File | Trigger |
|---|---|---|
| Detail pane header image | [MaterialInspectPane.tsx](../../../src/components/materials/MaterialInspectPane.tsx) | Click the 64px thumbnail → `openImage`. Subtle `cursor: zoom-in` on hover. |
| Grid card image | [MaterialGridCard.tsx](../../../src/components/materials/MaterialGridCard.tsx) | Small expand/magnifier **icon button** overlaid on the image (hover-revealed on desktop, faint-always on mobile). Click calls `openImage` with `stopPropagation` so the rest of the card still opens the detail pane. |
| Designs tab | `DesignsTab` inside MaterialInspectPane | Replace the existing basic `Dialog` lightbox with the shared viewer (same click on the thumbnail). |
| Variants tab | `VariantsTab` inside MaterialInspectPane | Click the variant avatar → `openImage`. |
| Brands tab | `BrandsTabContent` inside MaterialInspectPane | Click the brand avatar → `openImage`. |

**Grid-card decision (explicit):** we do **not** hijack the whole-card image
click. The card's body click already opens the detail pane and we keep that. An
explicit expand icon is the only zoom affordance on the card, which keeps both
behaviours unambiguous.

**No-image rule:** every trigger only renders / activates when there is a real
`image_url`. Surfaces that fall back to the initials/icon avatar (no image) get
no expand affordance and are not clickable.

## Edge cases

- Only opens for a non-empty image URL; broken-image fallbacks are inert.
- Esc, backdrop click, and the close button all dismiss.
- Zoom/pan resets on each open.
- Image URLs reaching these components are already normalized upstream
  (`normalizeImageUrl`), so the viewer takes the `src` as-is.

## Testing

- Vitest unit test for `useImageViewer` / `ImageViewerProvider`: `openImage`
  shows the dialog with the given `src`; close hides it; calling `openImage`
  with **no** provider is a no-op (no throw).
- Light render test for `ImageZoomDialog`: when `open` with a `src`, it renders
  the image (correct `src`/`alt`) and the zoom controls; returns nothing when
  `src` is null.

## Out of scope (YAGNI)

- No multi-image gallery / prev-next navigation — each surface shows a single image.
- No download / share button inside the viewer (can be added later).
- No changes to other routes; `MaterialInspectPane` reused elsewhere keeps
  working (no-op opener) but only gains the live viewer under the catalog provider.
