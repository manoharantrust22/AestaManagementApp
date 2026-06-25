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
