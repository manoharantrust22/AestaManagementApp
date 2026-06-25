"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ImageZoomDialog from "./ImageZoomDialog";

const CLOSE_ANIMATION_MS = 300;

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openImage = useCallback((args: OpenImageArgs) => {
    if (args?.src) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrent(args);
      setDisplayed(args);
    }
  }, []);

  const handleClose = useCallback(() => {
    setCurrent(null);
    // Delay clearing displayed to allow Dialog animation to complete
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDisplayed(null), CLOSE_ANIMATION_MS);
  }, []);

  // Cancel any pending timer on unmount to prevent state updates on unmounted component
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

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
