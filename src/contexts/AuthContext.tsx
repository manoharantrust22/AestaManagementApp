"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { initializeSessionManager, stopSessionManager } from "@/lib/auth/sessionManager";
import { setCachedAccessToken } from "@/lib/auth/accessTokenCache";
import type { Database } from "@/types/database.types";

type User = Database["public"]["Tables"]["users"]["Row"];

interface AuthContextType {
  user: SupabaseUser | null;
  userProfile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());
  const userProfileRef = useRef<User | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  // Retry once on transient errors (network / auth lock contention) before giving up.
  // Returning a boolean lets the watchdog effect know whether to schedule another attempt.
  const fetchUserProfile = useCallback(async (userId: string): Promise<boolean> => {
    const attempt = async (): Promise<{ ok: boolean; profileFound: boolean }> => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("auth_id", userId)
          .maybeSingle();
        if (error) return { ok: false, profileFound: false };
        if (!data) return { ok: true, profileFound: false };
        setUserProfile(data);
        return { ok: true, profileFound: true };
      } catch {
        return { ok: false, profileFound: false };
      }
    };

    console.log("[AuthContext] Fetching user profile...", { userId });
    let result = await attempt();
    if (!result.ok) {
      // Single quick retry — covers transient cross-tab auth-lock or 6-conn-limit stalls
      console.warn("[AuthContext] Profile fetch failed, retrying in 1s...");
      await new Promise((r) => setTimeout(r, 1000));
      result = await attempt();
    }
    if (!result.ok) {
      console.error("[AuthContext] Profile fetch failed after retry");
      return false;
    }
    if (!result.profileFound) {
      console.warn("[AuthContext] No profile row for auth user:", userId);
      // Don't null out an existing profile on a transient empty response; only
      // null it out when there is genuinely no profile and we previously had none.
      setUserProfile((prev) => prev ?? null);
      return false;
    }
    return true;
  }, [supabase]);

  const refreshUserProfile = useCallback(async () => {
    if (user) {
      await fetchUserProfile(user.id);
    }
  }, [user, fetchUserProfile]);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      let hasSession = false;
      try {
        console.log("[AuthContext] Initializing auth...");
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[AuthContext] Session error:", sessionError);
        }

        if (!mounted) return;

        hasSession = !!session?.user;
        console.log("[AuthContext] Session:", hasSession ? "exists" : "null");
        setUser(session?.user ?? null);

        if (session?.user) {
          // Profile fetch is handled by onAuthStateChange INITIAL_SESSION event
          // to avoid duplicate concurrent requests causing CORS errors
          initializeSessionManager();
        }
      } catch (error) {
        console.error("[AuthContext] Error initializing auth:", error);
      } finally {
        if (mounted && !hasSession) {
          // Only mark loading complete when there's no session.
          // When a session exists, onAuthStateChange will set loading=false
          // after fetchUserProfile completes, preventing SiteProvider from
          // seeing authLoading=false with userProfile=null.
          console.log("[AuthContext] No session - auth loading complete");
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Safety timeout: if onAuthStateChange hasn't fired INITIAL_SESSION within
    // 5 seconds, attempt a direct session+profile recovery before clearing the
    // loading gate. Without recovery, downstream providers (SiteProvider) see
    // authLoading=false with userProfile=null and clear their state — leaving
    // a second tab stuck on "No sites available" when cross-tab Supabase auth
    // lock contention or a slow proxy delays the SDK's INITIAL_SESSION emit.
    const safetyTimeout = setTimeout(async () => {
      if (!mounted) return;

      if (!userProfileRef.current) {
        console.warn("[AuthContext] Safety timeout - attempting profile recovery");
        const recovery = (async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!mounted || userProfileRef.current) return;
          if (session?.user) {
            setUser(session.user);
            await fetchUserProfile(session.user.id);
            initializeSessionManager();
          }
        })();
        await Promise.race([
          recovery,
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]).catch((err) => {
          console.error("[AuthContext] Safety timeout recovery failed:", err);
        });
      }

      if (mounted) {
        setLoading((prev) => {
          if (prev) {
            console.warn("[AuthContext] Safety timeout - forcing auth loading complete");
          }
          return false;
        });
      }
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      console.log("[AuthContext] Auth state changed:", _event);
      setUser(session?.user ?? null);
      // Publish the token lock-free so uploads can read it without queuing on
      // the auth processLock (see accessTokenCache.ts). Fires on INITIAL_SESSION
      // / SIGNED_IN / TOKEN_REFRESHED with the fresh token, and null on sign-out.
      setCachedAccessToken(session?.access_token ?? null);

      if (session?.user) {
        // Skip profile fetch on TOKEN_REFRESHED if we already have the profile
        // This prevents unnecessary API calls on token refresh
        if (_event === "TOKEN_REFRESHED" && userProfileRef.current) {
          console.log("[AuthContext] Skipping profile fetch on TOKEN_REFRESHED - already loaded");
        } else {
          await fetchUserProfile(session.user.id);
        }
        // Initialize session manager when user signs in
        initializeSessionManager();
      } else {
        setUserProfile(null);
        // Stop session manager when user signs out
        stopSessionManager();
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      // Cleanup session manager on unmount
      stopSessionManager();
    };
  }, [supabase, fetchUserProfile]);

  // Watchdog #2: recover from "init finished with no user" state. If the
  // initial getSession() stalled past the 5+3s safety budget (cross-tab
  // auth-lock contention through the Cloudflare proxy on 3rd+ tab), loading
  // flips false with user=null even though a session does exist in storage.
  // SiteProvider then clears sites → "No sites available". This watchdog
  // re-polls getSession() with backoff while user remains null and the page
  // is loaded; it stops the moment a user is set (which kicks watchdog #1).
  useEffect(() => {
    if (loading || user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const tryRecover = async () => {
      if (cancelled) return;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          console.log("[AuthContext] Watchdog#2 recovered stalled session");
          setUser(session.user);
          await fetchUserProfile(session.user.id);
          initializeSessionManager();
          return;
        }
      } catch (err) {
        console.warn("[AuthContext] Watchdog#2 getSession error:", err);
      }
      attempt++;
      if (attempt >= 6) return; // ~2+4+8+16+30+30s before giving up
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      console.log(`[AuthContext] Watchdog#2 retry in ${delay}ms (attempt ${attempt + 1})`);
      timer = setTimeout(tryRecover, delay);
    };

    timer = setTimeout(tryRecover, 2000);

    const onVisible = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible" && !user) {
        if (timer) clearTimeout(timer);
        attempt = 0;
        tryRecover();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [loading, user, supabase, fetchUserProfile]);

  // Watchdog #1: keep retrying profile fetch as long as we have an auth user but
  // no profile. The 5s+3s safety-timeout recovery is one-shot; if it ran during
  // a window of cross-tab auth-lock contention or proxy slowness, the second
  // tab would otherwise sit forever with userProfile=null and SiteProvider
  // would render "No sites available". Backs off 3s, 6s, 12s, 24s, capped at 30s.
  // Also retries immediately on tab becoming visible.
  useEffect(() => {
    if (!user || userProfile) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const tryFetch = async () => {
      if (cancelled || userProfileRef.current) return;
      const ok = await fetchUserProfile(user.id);
      if (cancelled || ok) return;
      attempt++;
      const delay = Math.min(3000 * Math.pow(2, attempt - 1), 30000);
      console.log(`[AuthContext] Watchdog retrying profile fetch in ${delay}ms (attempt ${attempt + 1})`);
      timer = setTimeout(tryFetch, delay);
    };

    // Small initial delay so the existing 5s safety-timeout recovery wins the
    // first race when it can; only step in if it didn't.
    timer = setTimeout(tryFetch, 1500);

    const onVisible = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible" && !userProfileRef.current) {
        if (timer) clearTimeout(timer);
        attempt = 0;
        tryFetch();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [user?.id, userProfile?.id, fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Swallow: a missing/expired session would otherwise leave the user
      // stranded on a protected page with stale UI. Local state must be cleared
      // unconditionally so the redirect guard fires.
      console.warn("[AuthContext] signOut error (continuing):", error);
    }
    setUser(null);
    setUserProfile(null);
    stopSessionManager();
  };

  const value = {
    user,
    userProfile,
    loading,
    signIn,
    signOut,
    refreshUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Non-throwing variant of useAuth. Returns undefined when no AuthProvider
 * is mounted — for leaf components (e.g. PayerSourceSelector) that may be
 * rendered in isolation (unit tests) or in trees without the provider, and
 * only need auth for optional, additive behaviour.
 */
export function useOptionalAuth() {
  return useContext(AuthContext);
}
