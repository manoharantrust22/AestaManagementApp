import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ThreadActionButton from "./ThreadActionButton";
import type { MaterialThread, ThreadPO } from "@/lib/material-hub/threadTypes";
import type { UserRole } from "@/lib/permissions";

const role = vi.hoisted(() => ({ current: "site_engineer" as UserRole }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userProfile: { role: role.current } }),
}));

function makePO(overrides: Partial<ThreadPO> = {}): ThreadPO {
  return {
    id: "po-1",
    po_number: "PO-MS8VP70K-XDEW",
    vendor_id: "v-1",
    amount: 7298,
    weight_based: false,
    qty: 1000,
    received_qty: 1000,
    expected: null,
    status: "delivered",
    payer_site_id: "site-1",
    payment_timing: "on_delivery",
    advance_paid: 0,
    delivery_batches: [],
    ...overrides,
  };
}

function makeThread(overrides: Partial<MaterialThread> = {}): MaterialThread {
  return {
    id: "t-1",
    source: "material_request",
    source_row_id: "mr-1",
    site_id: "site-1",
    section: null,
    floor: null,
    priority: "normal",
    stage: "delivered",
    kind: "own",
    advance: false,
    material_id: "m-1",
    material_name: "Fly Ash Bricks",
    material_unit: "nos",
    qty: 1000,
    requested_by: null,
    requested_at: "2026-07-26",
    po: makePO(),
    ...overrides,
  };
}

function renderButton(thread: MaterialThread) {
  return render(
    <ThreadActionButton thread={thread} accent="#2563eb" onAction={vi.fn()} />
  );
}

describe("ThreadActionButton — delivered, unpaid vendor bill", () => {
  beforeEach(() => {
    role.current = "site_engineer";
  });

  it("gives the site engineer a real Settle button, not a waiting chip", () => {
    renderButton(makeThread());
    expect(screen.getByRole("button", { name: /settle vendor/i })).toBeTruthy();
    expect(screen.queryByText(/waiting for office/i)).toBeNull();
  });

  it("still gives the office a real Settle button", () => {
    role.current = "office";
    renderButton(makeThread());
    expect(screen.getByRole("button", { name: /settle vendor/i })).toBeTruthy();
    expect(screen.queryByText(/waiting for/i)).toBeNull();
  });

  it("still tells the site engineer to wait on the office for a PO", () => {
    renderButton(makeThread({ stage: "requested", po: undefined }));
    expect(screen.getByText(/waiting for office/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /create po/i })).toBeNull();
  });
});
