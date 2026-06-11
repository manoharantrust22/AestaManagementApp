import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// The Refresh button now does an in-place soft recovery instead of a full page
// reload — assert it calls softRecoverSession and never reloads.
const { softRecoverSessionMock } = vi.hoisted(() => ({
  softRecoverSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/sessionManager", () => ({
  softRecoverSession: softRecoverSessionMock,
}));

import { SessionErrorHandler } from "./SessionErrorHandler";

const originalLocation = window.location;
let locationMock: { pathname: string; href: string; reload: ReturnType<typeof vi.fn> };

beforeEach(() => {
  softRecoverSessionMock.mockResolvedValue(undefined);
  locationMock = { pathname: "/site/materials/hub", href: "", reload: vi.fn() };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: locationMock,
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.clearAllMocks();
});

describe("SessionErrorHandler", () => {
  it("shows a warning banner on a non-permanent refresh failure and recovers in place (no reload)", async () => {
    render(
      <SessionErrorHandler>
        <div>app</div>
      </SessionErrorHandler>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("session-refresh-failed", {
          detail: { error: "network blip" },
        })
      );
    });

    expect(await screen.findByText(/changes may not save/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() =>
      expect(softRecoverSessionMock).toHaveBeenCalledTimes(1)
    );
    // The whole point of the fix: never blow away in-progress form data.
    expect(locationMock.reload).not.toHaveBeenCalled();
    // Banner dismisses after the soft recovery resolves.
    await waitFor(() =>
      expect(screen.queryByText(/changes may not save/i)).toBeNull()
    );
  });

  it("redirects to login on a permanent (expired/invalid) refresh failure", async () => {
    render(
      <SessionErrorHandler>
        <div>app</div>
      </SessionErrorHandler>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("session-refresh-failed", {
          detail: { error: "Invalid Refresh Token: token has expired" },
        })
      );
    });

    await waitFor(() =>
      expect(locationMock.href).toBe("/login?session_expired=true")
    );
    expect(softRecoverSessionMock).not.toHaveBeenCalled();
  });
});
