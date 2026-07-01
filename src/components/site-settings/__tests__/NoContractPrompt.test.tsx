import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoContractPrompt } from "../NoContractPrompt";

describe("NoContractPrompt", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(<NoContractPrompt show={false} onCreate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the warning and fires onCreate when the button is clicked", () => {
    const onCreate = vi.fn();
    render(<NoContractPrompt show onCreate={onCreate} />);
    expect(screen.getByText(/no contract yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create contract/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
