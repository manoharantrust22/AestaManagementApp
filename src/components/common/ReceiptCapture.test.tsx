import React from "react";
import { describe, it, expect, vi } from "vitest";
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
});
