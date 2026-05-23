import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PayerSourceSplitInput from "./PayerSourceSplitInput";
import type { PayerSourceInput } from "@/types/settlement.types";

// PayerSourceSelector -> usePayerSources -> createClient() runs on render
// even when siteId is undefined. Stub it so the component can mount in
// jsdom without real Supabase env vars.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

function withClient(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function Harness({
  initial,
  total,
  onChange,
}: {
  initial: PayerSourceInput;
  total: number;
  onChange?: (v: PayerSourceInput) => void;
}) {
  const [v, setV] = React.useState<PayerSourceInput>(initial);
  return (
    <PayerSourceSplitInput
      value={v}
      total={total}
      onChange={(next) => {
        setV(next);
        onChange?.(next);
      }}
    />
  );
}

describe("PayerSourceSplitInput", () => {
  it("renders a single PayerSourceSelector when mode='single'", () => {
    render(
      withClient(
        <Harness
          initial={{ mode: "single", source: "own_money" }}
          total={5000}
        />,
      ),
    );
    // The split toggle is collapsed by default
    expect(screen.getByRole("button", { name: /split across sources/i })).toBeInTheDocument();
    // Row-1 amount field NOT visible in single mode
    expect(screen.queryByLabelText(/row 1 amount/i)).toBeNull();
  });

  it("switches to split mode with 2 rows and an empty Row-2 source on toggle", () => {
    const onChange = vi.fn();
    render(
      withClient(
        <Harness
          initial={{ mode: "single", source: "amma_money" }}
          total={5000}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /split across sources/i }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "split" }),
    );
    const last = onChange.mock.calls.at(-1)![0] as PayerSourceInput;
    expect(last.mode).toBe("split");
    if (last.mode !== "split") throw new Error();
    expect(last.rows).toHaveLength(2);
    expect(last.rows[0].source).toBe("amma_money"); // preserved from single
  });

  it("shows 'Remaining' hint when sum < total", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 1000 },
              { source: "trust_account", amount: 1000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(screen.getByText(/remaining.*3,000/i)).toBeInTheDocument();
  });

  it("shows 'Over by' hint when sum > total (red)", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 4000 },
              { source: "trust_account", amount: 2000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(screen.getByText(/over by.*1,000/i)).toBeInTheDocument();
  });

  it("shows OK indicator when sum equals total within ₹1", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 3000 },
              { source: "trust_account", amount: 2000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(screen.getByText(/ok/i)).toBeInTheDocument();
  });

  it("adds a 3rd row when '+ Add another source' is clicked", () => {
    const onChange = vi.fn();
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 1000 },
              { source: "trust_account", amount: 1000 },
            ],
          }}
          total={5000}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /add another source/i }));
    const last = onChange.mock.calls.at(-1)![0] as PayerSourceInput;
    if (last.mode !== "split") throw new Error();
    expect(last.rows).toHaveLength(3);
  });

  it("hides 'Add another source' at 3 rows", () => {
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 1000 },
              { source: "trust_account", amount: 1000 },
              { source: "own_money", amount: 3000 },
            ],
          }}
          total={5000}
        />,
      ),
    );
    expect(
      screen.queryByRole("button", { name: /add another source/i }),
    ).toBeNull();
  });

  it("collapses back to single when toggle is turned off", () => {
    const onChange = vi.fn();
    render(
      withClient(
        <Harness
          initial={{
            mode: "split",
            rows: [
              { source: "amma_money", amount: 3000 },
              { source: "trust_account", amount: 2000 },
            ],
          }}
          total={5000}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /split across sources/i }),
    );
    const last = onChange.mock.calls.at(-1)![0] as PayerSourceInput;
    expect(last.mode).toBe("single");
  });
});
