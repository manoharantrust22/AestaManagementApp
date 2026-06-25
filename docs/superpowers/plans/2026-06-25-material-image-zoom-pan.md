# Material Image Zoom/Pan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user click any product image in `/company/materials` to open it in a full-screen viewer that supports zoom-in and drag-to-pan, then dismiss back to where they were.

**Architecture:** A new controlled `ImageZoomDialog` (image-only, built on the already-installed `react-zoom-pan-pinch`, mirroring the existing `BillViewerDialog` interaction) is mounted once by an `ImageViewerProvider`. Any descendant opens it imperatively via a no-op-safe `useImageViewer()` hook, avoiding prop-drilling across the five image surfaces (detail-pane header, grid cards, Designs/Variants/Brands tabs).

**Tech Stack:** Next.js 15, React, MUI v7, `react-zoom-pan-pinch@^3.7.0` (already a dependency), Vitest + React Testing Library.

## Global Constraints

- **No new dependencies.** Reuse `react-zoom-pan-pinch` (already `^3.7.0`).
- **`useImageViewer()` MUST be no-op-safe** — when no `ImageViewerProvider` is mounted above it, `openImage` does nothing and never throws.
- **Only activate on a real image.** Every trigger renders/activates only when a non-empty `image_url`/`src` exists; initials/icon-fallback avatars get no zoom affordance and are not clickable.
- **Do not hijack the grid card's whole-card click.** The card body click still opens the detail pane; the only zoom affordance on a card is an explicit overlay icon button that calls `e.stopPropagation()`.
- **YAGNI:** no multi-image gallery / prev-next, no download/share button in the viewer.
- **Naming (exact):** component `ImageZoomDialog` (default export); provider `ImageViewerProvider`; hook `useImageViewer`; opener signature `openImage({ src, title })`. New files live in `src/components/common/`.
- **Tests:** Vitest + `@testing-library/react`. jsdom has no `ResizeObserver`, so every test that renders `ImageZoomDialog` (directly or via the provider) MUST `vi.mock("react-zoom-pan-pinch", ...)` with a passthrough.
- **Commits:** Conventional Commits. Every commit message ends with the line:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Branch:** all work lands on the existing branch `feat/material-image-zoom-pan`.

---

### Task 1: `ImageZoomDialog` — controlled image viewer

**Files:**
- Create: `src/components/common/ImageZoomDialog.tsx`
- Test: `src/components/common/ImageZoomDialog.test.tsx`

**Interfaces:**
- Consumes: `react-zoom-pan-pinch` (`TransformWrapper`, `TransformComponent`).
- Produces:
  ```ts
  export interface ImageZoomDialogProps {
    open: boolean;
    src: string | null;
    title?: string;     // header text + img alt
    onClose: () => void;
  }
  export default function ImageZoomDialog(props: ImageZoomDialogProps): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/common/ImageZoomDialog.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ImageZoomDialog from "./ImageZoomDialog";

// jsdom lacks ResizeObserver that react-zoom-pan-pinch needs; passthrough-mock it
// so we test our shell, not the library's internals.
vi.mock("react-zoom-pan-pinch", () => ({
  TransformWrapper: ({ children }: any) =>
    typeof children === "function"
      ? children({ zoomIn: vi.fn(), zoomOut: vi.fn(), resetTransform: vi.fn() })
      : children,
  TransformComponent: ({ children }: any) => <div>{children}</div>,
}));

describe("ImageZoomDialog", () => {
  it("renders nothing when src is null even if open", () => {
    const { container } = render(
      <ImageZoomDialog open src={null} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the image with src and title-as-alt when open", () => {
    render(
      <ImageZoomDialog
        open
        src="https://example.com/can.jpg"
        title="Dr. Fixit 301"
        onClose={() => {}}
      />
    );
    const img = screen.getByAltText("Dr. Fixit 301") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe("https://example.com/can.jpg");
    expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zoom out/i)).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ImageZoomDialog open src="https://example.com/can.jpg" title="X" onClose={onClose} />
    );
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/common/ImageZoomDialog.test.tsx`
Expected: FAIL — cannot resolve `./ImageZoomDialog`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/common/ImageZoomDialog.tsx`:

```tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  IconButton,
  Typography,
  useTheme,
  useMediaQuery,
  alpha,
  Fade,
  Button,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitScreenIcon,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export interface ImageZoomDialogProps {
  open: boolean;
  src: string | null;
  /** Header text + image alt text. */
  title?: string;
  onClose: () => void;
}

/**
 * Full-screen, controlled image viewer with zoom + pan.
 * Image-only sibling of BillViewerDialog: drag-to-pan, wheel zoom (desktop),
 * pinch zoom (mobile), double-click/tap to reset, on-screen zoom buttons.
 */
export default function ImageZoomDialog({
  open,
  src,
  title,
  onClose,
}: ImageZoomDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
    }
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleOpenInNewTab = useCallback(() => {
    if (src) window.open(src, "_blank");
  }, [src]);

  if (!src) return null;

  const label = title || "Image";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth={false}
      PaperProps={{
        sx: {
          ...(isMobile
            ? {}
            : { width: "90vw", height: "90vh", maxWidth: "90vw", maxHeight: "90vh" }),
          bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.100",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography component="span" variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {label}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.200",
        }}
      >
        {loading && !error && (
          <Box sx={{ position: "absolute", zIndex: 5 }}>
            <CircularProgress size={40} />
          </Box>
        )}

        {error ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, p: 4 }}>
            <Typography color="error">Failed to load image</Typography>
            <Button variant="outlined" onClick={handleOpenInNewTab}>
              Open in new tab
            </Button>
          </Box>
        ) : (
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.1 }}
            pinch={{ step: 5 }}
            doubleClick={{ mode: "reset" }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {!isMobile && (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 16,
                      left: "50%",
                      transform: "translateX(-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      bgcolor: alpha(theme.palette.common.black, 0.7),
                      borderRadius: 2,
                      px: 2,
                      py: 1,
                      zIndex: 10,
                    }}
                  >
                    <IconButton onClick={() => zoomOut()} size="small" sx={{ color: "white" }} aria-label="Zoom out">
                      <ZoomOutIcon />
                    </IconButton>
                    <IconButton onClick={() => resetTransform()} size="small" sx={{ color: "white" }} aria-label="Reset zoom">
                      <FitScreenIcon />
                    </IconButton>
                    <IconButton onClick={() => zoomIn()} size="small" sx={{ color: "white" }} aria-label="Zoom in">
                      <ZoomInIcon />
                    </IconButton>
                  </Box>
                )}

                {isMobile && !loading && (
                  <Typography
                    variant="caption"
                    sx={{
                      position: "absolute",
                      bottom: 8,
                      left: "50%",
                      transform: "translateX(-50%)",
                      bgcolor: alpha(theme.palette.common.black, 0.6),
                      color: "white",
                      px: 2,
                      py: 0.5,
                      borderRadius: 1,
                      zIndex: 10,
                    }}
                  >
                    Pinch to zoom • double-tap to reset
                  </Typography>
                )}

                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Fade in={!loading} timeout={300}>
                    <Box
                      component="img"
                      src={src}
                      alt={label}
                      onLoad={() => setLoading(false)}
                      onError={() => {
                        setLoading(false);
                        setError(true);
                      }}
                      sx={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                        borderRadius: 1,
                        boxShadow: theme.shadows[8],
                      }}
                    />
                  </Fade>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/common/ImageZoomDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ImageZoomDialog.tsx src/components/common/ImageZoomDialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(common): ImageZoomDialog — controlled zoom/pan image viewer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `ImageViewerProvider` + `useImageViewer`

**Files:**
- Create: `src/components/common/ImageViewerProvider.tsx`
- Test: `src/components/common/ImageViewerProvider.test.tsx`

**Interfaces:**
- Consumes: `ImageZoomDialog` (Task 1).
- Produces:
  ```ts
  export interface OpenImageArgs { src: string; title?: string }
  export function ImageViewerProvider(props: { children: React.ReactNode }): JSX.Element
  export function useImageViewer(): { openImage: (args: OpenImageArgs) => void }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/common/ImageViewerProvider.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react";
import { ImageViewerProvider, useImageViewer } from "./ImageViewerProvider";

vi.mock("react-zoom-pan-pinch", () => ({
  TransformWrapper: ({ children }: any) =>
    typeof children === "function"
      ? children({ zoomIn: vi.fn(), zoomOut: vi.fn(), resetTransform: vi.fn() })
      : children,
  TransformComponent: ({ children }: any) => <div>{children}</div>,
}));

function Opener({ src, title }: { src: string; title?: string }) {
  const { openImage } = useImageViewer();
  return <button onClick={() => openImage({ src, title })}>open</button>;
}

describe("ImageViewerProvider / useImageViewer", () => {
  it("opens the viewer with the given src and title", () => {
    render(
      <ImageViewerProvider>
        <Opener src="https://example.com/a.jpg" title="Alpha" />
      </ImageViewerProvider>
    );
    expect(screen.queryByAltText("Alpha")).toBeNull();
    fireEvent.click(screen.getByText("open"));
    const img = screen.getByAltText("Alpha") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/a.jpg");
  });

  it("closes the viewer when the close button is clicked", async () => {
    render(
      <ImageViewerProvider>
        <Opener src="https://example.com/a.jpg" title="Alpha" />
      </ImageViewerProvider>
    );
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByAltText("Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/close/i));
    await waitForElementToBeRemoved(() => screen.queryByAltText("Alpha"));
  });

  it("openImage is a no-op (no throw) when no provider is mounted", () => {
    render(<Opener src="https://example.com/a.jpg" title="Alpha" />);
    expect(() => fireEvent.click(screen.getByText("open"))).not.toThrow();
    expect(screen.queryByAltText("Alpha")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/common/ImageViewerProvider.test.tsx`
Expected: FAIL — cannot resolve `./ImageViewerProvider`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/common/ImageViewerProvider.tsx`:

```tsx
"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import ImageZoomDialog from "./ImageZoomDialog";

export interface OpenImageArgs {
  src: string;
  title?: string;
}

interface ImageViewerContextValue {
  openImage: (args: OpenImageArgs) => void;
}

const ImageViewerContext = createContext<ImageViewerContextValue | null>(null);

/** No-op fallback used when no provider is mounted — keeps shared consumers safe. */
const NOOP: ImageViewerContextValue = { openImage: () => {} };

export function useImageViewer(): ImageViewerContextValue {
  return useContext(ImageViewerContext) ?? NOOP;
}

export function ImageViewerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<OpenImageArgs | null>(null);

  const openImage = useCallback((args: OpenImageArgs) => {
    if (args?.src) setCurrent(args);
  }, []);

  const value = useMemo(() => ({ openImage }), [openImage]);

  return (
    <ImageViewerContext.Provider value={value}>
      {children}
      <ImageZoomDialog
        open={!!current}
        src={current?.src ?? null}
        title={current?.title}
        onClose={() => setCurrent(null)}
      />
    </ImageViewerContext.Provider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/common/ImageViewerProvider.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ImageViewerProvider.tsx src/components/common/ImageViewerProvider.test.tsx
git commit -m "$(cat <<'EOF'
feat(common): ImageViewerProvider + useImageViewer (no-op-safe opener)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Mount provider in catalog page + wire detail-pane header image

**Files:**
- Modify: `src/app/(main)/company/materials/page.tsx` (wrap root return; lines 363-364 and 730-732)
- Modify: `src/components/materials/MaterialInspectPane.tsx` (import + hook + header avatar; lines ~37, ~113, ~242-249)

**Interfaces:**
- Consumes: `ImageViewerProvider`, `useImageViewer` (Task 2).
- Produces: provider mounted around the entire catalog subtree (grid + both inspect panes + dialogs); the 64px detail-pane thumbnail opens the viewer.

- [ ] **Step 1: Add the provider import to the page**

In `src/app/(main)/company/materials/page.tsx`, add this import alongside the other component imports (right after the `MaterialInspectPane` import on line 53):

```tsx
import { ImageViewerProvider } from "@/components/common/ImageViewerProvider";
```

- [ ] **Step 2: Wrap the page's returned tree (open)**

Edit — find:

```tsx
  return (
    <Box>
      <PageHeader
```

Replace with:

```tsx
  return (
    <ImageViewerProvider>
    <Box>
      <PageHeader
```

- [ ] **Step 3: Wrap the page's returned tree (close)**

Edit — find:

```tsx
      </Snackbar>
    </Box>
  );
}
```

Replace with:

```tsx
      </Snackbar>
    </Box>
    </ImageViewerProvider>
  );
}
```

- [ ] **Step 4: Add the hook import + call in MaterialInspectPane**

In `src/components/materials/MaterialInspectPane.tsx`, add this import after the `EntityImageAvatar` import (line 37):

```tsx
import { useImageViewer } from "@/components/common/ImageViewerProvider";
```

Then, inside the `MaterialInspectPane` component, add the hook right after the `activeTab` state — find:

```tsx
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
```

Replace with:

```tsx
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { openImage } = useImageViewer();
```

- [ ] **Step 5: Make the header thumbnail open the viewer**

In `src/components/materials/MaterialInspectPane.tsx`, find the header avatar:

```tsx
              <EntityImageAvatar
                src={material.image_url}
                name={material.name}
                size={64}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
              />
```

Replace with:

```tsx
              <Box
                onClick={
                  material.image_url
                    ? () => openImage({ src: material.image_url!, title: material.name })
                    : undefined
                }
                sx={{
                  display: "flex",
                  borderRadius: 1.25,
                  cursor: material.image_url ? "zoom-in" : "default",
                }}
              >
                <EntityImageAvatar
                  src={material.image_url}
                  name={material.name}
                  size={64}
                  fallbackIcon={<InventoryIcon />}
                  tint="primary"
                />
              </Box>
```

- [ ] **Step 6: Verify build + existing tests still pass**

Run: `npm run build`
Expected: build succeeds (no TS/lint errors).

Run: `npm test -- src/components/common`
Expected: PASS (Tasks 1-2 tests unaffected).

- [ ] **Step 7: Visual verification (CLAUDE.md "After UI Changes")**

With `npm run dev:cloud` running, use Playwright MCP:
1. Navigate to `http://localhost:3000/dev-login`, then to `http://localhost:3000/company/materials`.
2. Click a product card **that has a real photo** (e.g. "Dr. Fixit 301 Pidicrete URP") to open the detail drawer.
3. Click the 64px thumbnail in the drawer header.
4. Confirm the full-screen viewer opens; mouse-wheel zooms; drag pans; the zoom in/out/fit buttons work; double-click resets; Esc/close dismisses.
5. Read console logs (`playwright_console_logs`); fix any errors/warnings introduced.
6. Screenshot for the record, then `playwright_close`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(main)/company/materials/page.tsx" src/components/materials/MaterialInspectPane.tsx
git commit -m "$(cat <<'EOF'
feat(materials): mount image viewer + zoom detail-pane product image

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Grid card zoom-icon overlay

**Files:**
- Modify: `src/components/materials/MaterialGridCard.tsx` (imports; image area lines ~100-184)
- Test: `src/components/materials/MaterialGridCard.test.tsx`

**Interfaces:**
- Consumes: `useImageViewer` (Task 2).
- Produces: a `aria-label="Zoom image"` icon button on cards with a photo; clicking it calls `openImage({ src, title })` and does **not** trigger the card's `onClick`.

- [ ] **Step 1: Write the failing test**

Create `src/components/materials/MaterialGridCard.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaterialGridCard } from "./MaterialGridCard";
import * as ImageViewer from "@/components/common/ImageViewerProvider";
import type { MaterialWithDetails } from "@/types/material.types";

function makeMaterial(overrides: Partial<MaterialWithDetails> = {}): MaterialWithDetails {
  return {
    id: "m1",
    name: "Dr. Fixit 301",
    code: "DRF-0001",
    unit: "liter",
    image_url: "https://example.com/can.jpg",
    ...overrides,
  } as MaterialWithDetails;
}

const baseProps = { variantCount: 0, brandCount: 0, vendorCount: 0 };

describe("MaterialGridCard image zoom", () => {
  it("shows a zoom button for a card with a photo; clicking it opens the viewer without selecting the card", () => {
    const openImage = vi.fn();
    vi.spyOn(ImageViewer, "useImageViewer").mockReturnValue({ openImage });
    const onClick = vi.fn();

    render(<MaterialGridCard material={makeMaterial()} onClick={onClick} {...baseProps} />);

    fireEvent.click(screen.getByLabelText(/zoom image/i));

    expect(openImage).toHaveBeenCalledWith({
      src: "https://example.com/can.jpg",
      title: "Dr. Fixit 301",
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows no zoom button when the material has no photo", () => {
    vi.spyOn(ImageViewer, "useImageViewer").mockReturnValue({ openImage: vi.fn() });
    render(
      <MaterialGridCard material={makeMaterial({ image_url: null })} onClick={vi.fn()} {...baseProps} />
    );
    expect(screen.queryByLabelText(/zoom image/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/materials/MaterialGridCard.test.tsx`
Expected: FAIL — no element with label "Zoom image".

- [ ] **Step 3: Add imports**

In `src/components/materials/MaterialGridCard.tsx`:

Add `IconButton` to the MUI import — find:

```tsx
import { Box, Chip, Tooltip, Typography, alpha, useTheme } from "@mui/material";
```

Replace with:

```tsx
import { Box, Chip, IconButton, Tooltip, Typography, alpha, useTheme } from "@mui/material";
```

Add the zoom icon — find:

```tsx
import {
  Whatshot as FireIcon,
  Inventory2 as InventoryIcon,
  Store as StoreIcon,
} from "@mui/icons-material";
```

Replace with:

```tsx
import {
  Whatshot as FireIcon,
  Inventory2 as InventoryIcon,
  Store as StoreIcon,
  ZoomIn as ZoomInIcon,
} from "@mui/icons-material";
```

Add the hook import after the `EntityImageAvatar` import:

```tsx
import { useImageViewer } from "@/components/common/ImageViewerProvider";
```

- [ ] **Step 4: Call the hook + reveal-on-hover rule**

Find:

```tsx
  const theme = useTheme();
  const unitLabel = UNIT_LABELS[material.unit] || material.unit;
  const [imgFailed, setImgFailed] = useState(false);
```

Replace with:

```tsx
  const theme = useTheme();
  const { openImage } = useImageViewer();
  const unitLabel = UNIT_LABELS[material.unit] || material.unit;
  const [imgFailed, setImgFailed] = useState(false);
```

On the card root `Box`, add a hover rule that reveals the zoom button (desktop). Find:

```tsx
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: 2,
          borderColor: alpha(theme.palette.primary.main, 0.4),
        },
      }}
    >
```

Replace with:

```tsx
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: 2,
          borderColor: alpha(theme.palette.primary.main, 0.4),
        },
        "&:hover .material-card-zoom": { opacity: 1 },
      }}
    >
```

- [ ] **Step 5: Add the overlay zoom button**

In the image-area block, find:

```tsx
        {variantCount > 0 ? (
          <Chip
            size="small"
            label={`${variantCount} variant${variantCount !== 1 ? "s" : ""}`}
```

Insert the zoom button immediately **before** that `{variantCount > 0 ? (` line:

```tsx
        {material.image_url && !imgFailed ? (
          <IconButton
            className="material-card-zoom"
            aria-label="Zoom image"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              openImage({ src: material.image_url!, title: material.name });
            }}
            sx={{
              position: "absolute",
              bottom: 6,
              right: 6,
              width: 26,
              height: 26,
              bgcolor: alpha(theme.palette.common.black, 0.45),
              color: "#fff",
              opacity: { xs: 0.85, md: 0 },
              transition: "opacity 120ms, background-color 120ms",
              "&:hover": { bgcolor: alpha(theme.palette.common.black, 0.65) },
            }}
          >
            <ZoomInIcon sx={{ fontSize: 16 }} />
          </IconButton>
        ) : null}

```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/components/materials/MaterialGridCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/materials/MaterialGridCard.tsx src/components/materials/MaterialGridCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(materials): zoom-icon overlay opens product image viewer on grid cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Designs tab → shared viewer

**Files:**
- Modify: `src/components/materials/MaterialInspectPane.tsx` (`DesignsTab`, lines ~528-650; remove `Dialog` import on line 8 if now unused)

**Interfaces:**
- Consumes: `useImageViewer` (Task 2).
- Produces: clicking a design thumbnail opens the shared zoom/pan viewer instead of the old basic dialog.

- [ ] **Step 1: Replace the DesignsTab local lightbox with the shared opener**

In `DesignsTab`, find:

```tsx
  const [lightbox, setLightbox] = useState<MaterialDesign | null>(null);

  if (isLoading) {
```

Replace with:

```tsx
  const { openImage } = useImageViewer();

  if (isLoading) {
```

Find the thumbnail click handler:

```tsx
          <Box
            key={d.id}
            onClick={() => setLightbox(d)}
```

Replace with:

```tsx
          <Box
            key={d.id}
            onClick={() =>
              d.image_url && openImage({ src: d.image_url, title: d.name || "Design" })
            }
```

- [ ] **Step 2: Delete the now-dead inline Dialog lightbox**

In `DesignsTab`, find and **delete** this entire block (the closing `</Box>` of the grid stays; remove only the `<Dialog>…</Dialog>`):

```tsx
      <Dialog
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        maxWidth="md"
        PaperProps={{ sx: { bgcolor: "background.paper" } }}
      >
        {lightbox && (
          <Box sx={{ position: "relative" }}>
            <IconButton
              onClick={() => setLightbox(null)}
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                bgcolor: "rgba(0,0,0,0.5)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
              }}
            >
              <CloseIcon />
            </IconButton>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.image_url}
              alt={lightbox.name || "Design"}
              style={{ display: "block", maxWidth: "100%", maxHeight: "80vh" }}
            />
            {lightbox.name ? (
              <Typography
                sx={{ p: 1.5, fontSize: 14, fontWeight: 700, textAlign: "center" }}
              >
                {lightbox.name}
              </Typography>
            ) : null}
          </Box>
        )}
      </Dialog>
```

- [ ] **Step 3: Remove the now-unused `Dialog` import**

`Dialog` is used **only** by the block deleted in Step 2. Remove it from the MUI import — find the line:

```tsx
  Dialog,
```

within the `@mui/material` import block (line ~8) and delete that single line. Leave `Drawer`, `IconButton`, `CloseIcon`, etc. intact (still used).

- [ ] **Step 4: Verify build + tests**

Run: `npm run build`
Expected: build succeeds — no "Dialog is defined but never used" and no "lightbox/setLightbox is not defined" errors.

Run: `npm test -- src/components/common src/components/materials/MaterialGridCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Visual verification**

With `npm run dev:cloud` running and logged in via `/dev-login`:
1. Navigate to `/company/materials`, open a **tile** material that has a "Designs (N)" tab.
2. Open the Designs tab; click a design thumbnail.
3. Confirm the shared zoom/pan viewer opens (wheel zoom, drag pan, reset, close).
4. Check console logs; fix any errors. Screenshot, then `playwright_close`.

(If no material with designs exists in the data, rely on the green build + the Task 1-2 viewer tests; note this in the task report.)

- [ ] **Step 6: Commit**

```bash
git add src/components/materials/MaterialInspectPane.tsx
git commit -m "$(cat <<'EOF'
feat(materials): Designs tab uses the shared zoom/pan image viewer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Variants + Brands tab avatars open the viewer

**Files:**
- Modify: `src/components/materials/MaterialInspectPane.tsx` (`VariantsTab` row avatar lines ~1391-1399; `BrandsTabContent` brand avatar lines ~1254-1259)

**Interfaces:**
- Consumes: `useImageViewer` (Task 2).
- Produces: clicking a variant or brand avatar that has an image opens the shared viewer.

- [ ] **Step 1: VariantsTab — hook + clickable avatar**

In `VariantsTab`, find:

```tsx
  // Which row is in inline-edit mode (variantId), or "add" for the new-variant card
  const [editing, setEditing] = useState<string | "add" | null>(null);
```

Replace with:

```tsx
  // Which row is in inline-edit mode (variantId), or "add" for the new-variant card
  const [editing, setEditing] = useState<string | "add" | null>(null);
  const { openImage } = useImageViewer();
```

Find the variant row avatar:

```tsx
            <Box sx={{ flexShrink: 0 }}>
              <EntityImageAvatar
                src={v.image_url}
                name={v.name}
                size={40}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
              />
            </Box>
```

Replace with:

```tsx
            <Box
              onClick={
                v.image_url
                  ? () => openImage({ src: v.image_url!, title: v.name })
                  : undefined
              }
              sx={{ flexShrink: 0, cursor: v.image_url ? "zoom-in" : "default", display: "flex" }}
            >
              <EntityImageAvatar
                src={v.image_url}
                name={v.name}
                size={40}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
              />
            </Box>
```

- [ ] **Step 2: BrandsTabContent — hook + clickable avatar**

In `BrandsTabContent`, find:

```tsx
}) {
  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }
```

Replace with:

```tsx
}) {
  const { openImage } = useImageViewer();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }
```

Find the brand avatar:

```tsx
          <EntityImageAvatar
            src={brand.image_url}
            name={brand.brand_name}
            size={36}
            tint={brand.is_preferred ? "primary" : "secondary"}
          />
```

Replace with:

```tsx
          <Box
            onClick={
              brand.image_url
                ? () => openImage({ src: brand.image_url!, title: brand.brand_name })
                : undefined
            }
            sx={{ flexShrink: 0, cursor: brand.image_url ? "zoom-in" : "default", display: "flex" }}
          >
            <EntityImageAvatar
              src={brand.image_url}
              name={brand.brand_name}
              size={36}
              tint={brand.is_preferred ? "primary" : "secondary"}
            />
          </Box>
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test -- src/components/common src/components/materials/MaterialGridCard.test.tsx`
Expected: PASS.

- [ ] **Step 4: Visual verification**

With dev running + logged in:
1. `/company/materials`, open a material with variants → Variants tab → click a variant image with a photo → viewer opens.
2. Open Brands tab → click a brand image with a photo → viewer opens.
3. Confirm avatars **without** a photo (initials) are not clickable (no zoom cursor, no viewer).
4. Check console; screenshot; `playwright_close`.

- [ ] **Step 5: Commit**

```bash
git add src/components/materials/MaterialInspectPane.tsx
git commit -m "$(cat <<'EOF'
feat(materials): Variants & Brands tab images open the zoom/pan viewer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS (all suites, including the 3 new test files).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no TS/lint errors.

- [ ] **Step 3: Cross-surface Playwright smoke**

With `npm run dev:cloud` running + `/dev-login`, on `/company/materials` confirm the viewer opens, zooms, and pans from all four surfaces, and dismisses cleanly: (a) grid-card zoom icon, (b) detail-pane header thumbnail, (c) Designs tab (if data exists), (d) Variants/Brands tab images. Confirm no new console errors/warnings. `playwright_close` when done.

- [ ] **Step 4: Report**

Summarize results (tests, build, what was visually verified vs. data-limited). No commit needed; the branch `feat/material-image-zoom-pan` is ready for review/merge.

---

## Self-Review

**1. Spec coverage:**
- "Reuse what already works / react-zoom-pan-pinch" → Task 1 (`ImageZoomDialog`). ✓
- `ImageZoomDialog` controlled props + behaviour → Task 1. ✓
- `ImageViewerProvider` + no-op-safe `useImageViewer` → Task 2. ✓
- Wrap catalog page in one provider → Task 3. ✓
- Detail-pane header image trigger → Task 3. ✓
- Grid card expand-icon (stopPropagation, keeps card click) → Task 4. ✓
- Designs tab → shared viewer (replace basic dialog) → Task 5. ✓
- Variants + Brands tab avatars → Task 6. ✓
- No-image rule (no affordance on fallback avatars) → enforced in Tasks 3-6 via `image_url`/`!imgFailed` guards + tested in Task 4's "no photo" case. ✓
- Testing: `useImageViewer` open/close/no-op → Task 2; `ImageZoomDialog` render → Task 1. ✓
- YAGNI (no gallery, no download) → no such steps added. ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases"; all code shown in full; the only narrative-only steps are Playwright visual checks, which list concrete click/assert procedures (UI-in-drawer wiring is impractical to unit test without mocking the full React Query stack — noted honestly). ✓

**3. Type consistency:** `openImage({ src, title })` / `OpenImageArgs { src; title? }` used identically in Tasks 2-6; `ImageZoomDialogProps { open, src, title?, onClose }` consistent between Tasks 1 and 2; `useImageViewer()` return shape `{ openImage }` consistent everywhere. ✓
