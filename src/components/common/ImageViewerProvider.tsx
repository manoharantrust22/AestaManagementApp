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
  const [displayed, setDisplayed] = useState<OpenImageArgs | null>(null);

  const openImage = useCallback((args: OpenImageArgs) => {
    if (args?.src) {
      setCurrent(args);
      setDisplayed(args);
    }
  }, []);

  const handleClose = useCallback(() => {
    setCurrent(null);
    // Delay clearing displayed to allow Dialog animation to complete
    setTimeout(() => setDisplayed(null), 300);
  }, []);

  const value = useMemo(() => ({ openImage }), [openImage]);

  return (
    <ImageViewerContext.Provider value={value}>
      {children}
      <ImageZoomDialog
        open={!!current}
        src={displayed?.src ?? null}
        title={displayed?.title}
        onClose={handleClose}
      />
    </ImageViewerContext.Provider>
  );
}
