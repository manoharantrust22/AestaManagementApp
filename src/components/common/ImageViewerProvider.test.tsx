import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitForElementToBeRemoved, act } from "@testing-library/react";
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

  it("rapid close→re-open within animation window keeps new image visible", () => {
    vi.useFakeTimers();
    try {
      render(
        <ImageViewerProvider>
          <Opener src="https://example.com/a.jpg" title="Alpha" />
          <Opener src="https://example.com/b.jpg" title="Beta" />
        </ImageViewerProvider>
      );

      // Open first image
      act(() => { fireEvent.click(screen.getAllByText("open")[0]); });
      expect(screen.getByAltText("Alpha")).toBeInTheDocument();

      // Close it (starts the 300ms timer)
      act(() => { fireEvent.click(screen.getByLabelText(/close/i)); });

      // Re-open a different image within the animation window (< 300ms)
      act(() => { fireEvent.click(screen.getAllByText("open")[1]); });
      expect(screen.getByAltText("Beta")).toBeInTheDocument();

      // Advance past the original 300ms — the stale timer must NOT fire
      act(() => { vi.advanceTimersByTime(400); });

      // Beta image should still be visible (not blanked by the stale timer)
      expect(screen.getByAltText("Beta")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
