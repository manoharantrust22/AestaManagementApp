import React from "react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/storage/uploadHelpers", () => ({
  hardenedUpload: vi.fn(async ({ filePath }: { filePath: string }) => ({
    path: filePath,
    publicUrl: `https://example.com/${filePath}`,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({}) } }),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { ReceiptCapture } from "./ReceiptCapture";

describe("ReceiptCapture", () => {
  it("renders empty state with file, paste, and camera buttons", () => {
    render(
      <ReceiptCapture
        label="Bill image"
        value={null}
        onChange={vi.fn()}
        folder="bills/test-site"
      />
    );
    expect(screen.getByText("Bill image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /file/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paste/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /camera/i })).toBeInTheDocument();
  });

  it("renders attached state with filename and remove button when value is set", () => {
    const onChange = vi.fn();
    render(
      <ReceiptCapture
        label="Bill image"
        value={{ url: "https://x/bill.jpg", storage_path: "bills/test-site/bill.jpg" }}
        onChange={onChange}
        folder="bills/test-site"
      />
    );
    expect(screen.getByText(/bill\.jpg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("calls onChange(null) when remove is clicked", () => {
    const onChange = vi.fn();
    render(
      <ReceiptCapture
        label="Bill image"
        value={{ url: "https://x/bill.jpg", storage_path: "bills/test-site/bill.jpg" }}
        onChange={onChange}
        folder="bills/test-site"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("uploads file via hidden input and calls onChange with returned path + publicUrl", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <ReceiptCapture
        label="Bill image"
        value={null}
        onChange={onChange}
        folder="bills/test-site"
      />
    );
    const fileInput = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["x"], "receipt.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("bills/test-site/"),
        storage_path: expect.stringContaining("bills/test-site/"),
      })
    );
  });
});
