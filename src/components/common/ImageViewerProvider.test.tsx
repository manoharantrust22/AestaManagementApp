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
