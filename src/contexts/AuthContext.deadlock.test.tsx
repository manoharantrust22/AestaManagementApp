import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

/**
 * Regression test for the post-idle app freeze (auth processLock deadlock).
 *
 * auth-js emits SIGNED_IN (on every tab return) and TOKEN_REFRESHED (after
 * every rotation) while HOLDING the auth processLock, and awaits all
 * onAuthStateChange subscriber callbacks before releasing it. Every PostgREST
 * call internally awaits auth.getSession(), which needs that same lock — so a
 * callback that awaits a supabase query deadlocks the lock for the life of
 * the tab and every subsequent query/mutation hangs before fetch.
 *
 * These tests prove AuthContext's callback settles immediately even when the
 * profile fetch never settles — i.e. no supabase call is awaited inside the
 * callback (the exact condition that deadlocks auth-js).
 */

const { state } = vi.hoisted(() => ({
  state: {
    authCallback: null as
      | null
      | ((event: string, session: unknown) => unknown),
    maybeSingleImpl: (() => new Promise(() => {})) as () => Promise<unknown>,
    fromCalls: [] as string[],
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: (
        cb: (event: string, session: unknown) => unknown
      ) => {
        state.authCallback = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: () => Promise.resolve({ error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (table: string) => {
      state.fromCalls.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => state.maybeSingleImpl(),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/auth/sessionManager", () => ({
  initializeSessionManager: vi.fn(),
  stopSessionManager: vi.fn(),
}));

import { AuthProvider } from "./AuthContext";

const fakeSession = {
  user: { id: "auth-user-1" },
  access_token: "test-token",
};

beforeEach(() => {
  state.authCallback = null;
  state.maybeSingleImpl = () => new Promise(() => {});
  state.fromCalls = [];
});

describe("AuthContext onAuthStateChange deadlock guard", () => {
  it("callback settles immediately even when the profile fetch never settles", async () => {
    // The deadlock condition: the profile query can never complete (in prod
    // it is queued behind the very lock auth-js holds while awaiting us).
    state.maybeSingleImpl = () => new Promise(() => {});

    render(
      <AuthProvider>
        <div>app</div>
      </AuthProvider>
    );
    await waitFor(() => expect(state.authCallback).toBeTruthy());

    let settled = false;
    await act(async () => {
      const ret = state.authCallback!("SIGNED_IN", fakeSession);
      await Promise.race([
        Promise.resolve(ret).then(() => {
          settled = true;
        }),
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);
    });

    // With the old `async (…) => { await fetchUserProfile(...) }` callback
    // this stays pending forever and auth-js never releases the lock.
    expect(settled).toBe(true);

    // The profile fetch still happens — just deferred out of the lock window.
    await waitFor(() => expect(state.fromCalls).toContain("users"));
  });

  it("skips the deferred profile refetch when this user's profile is already loaded", async () => {
    state.maybeSingleImpl = () =>
      Promise.resolve({
        data: { id: "profile-1", auth_id: "auth-user-1" },
        error: null,
      });

    render(
      <AuthProvider>
        <div>app</div>
      </AuthProvider>
    );
    await waitFor(() => expect(state.authCallback).toBeTruthy());

    // First event loads the profile via the deferred fetch.
    await act(async () => {
      state.authCallback!("INITIAL_SESSION", fakeSession);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(state.fromCalls).toContain("users");

    // SIGNED_IN re-fires on every tab return; with the profile loaded it
    // must not refetch (would hammer the proxy on each focus).
    state.fromCalls = [];
    await act(async () => {
      state.authCallback!("SIGNED_IN", fakeSession);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(state.fromCalls).not.toContain("users");
  });
});
