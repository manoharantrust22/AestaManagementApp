"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type Site = Database["public"]["Tables"]["sites"]["Row"];
import { useAuth } from "../AuthContext";
import {
  setSelectedSiteCookie,
  getSelectedSiteCookie,
} from "@/lib/cookies/site-cookie.client";
import { SitesDataContext } from "./SitesDataContext";
import { SelectedSiteContext } from "./SelectedSiteContext";
import { SiteActionsContext } from "./SiteActionsContext";

// Storage keys
const SELECTED_SITE_KEY = "selectedSiteId";
const SITES_CACHE_KEY = "cachedSites";

// Retry config for fetchSites
const MAX_FETCH_RETRIES = 3;

// Helper functions to safely access storage
export function getStoredSiteId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const sessionVal = sessionStorage.getItem(SELECTED_SITE_KEY);
    if (sessionVal !== null) return sessionVal;
    return localStorage.getItem(SELECTED_SITE_KEY);
  } catch {
    return null;
  }
}

function getStoredSites(): Site[] {
  if (typeof window === "undefined") return [];
  try {
    const cached = localStorage.getItem(SITES_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

export function storeSiteId(siteId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (siteId) {
      sessionStorage.setItem(SELECTED_SITE_KEY, siteId);
      localStorage.setItem(SELECTED_SITE_KEY, siteId);
    } else {
      sessionStorage.removeItem(SELECTED_SITE_KEY);
      localStorage.removeItem(SELECTED_SITE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function storeSites(sites: Site[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SITES_CACHE_KEY, JSON.stringify(sites));
  } catch {
    // Ignore storage errors
  }
}

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSiteState] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, userProfile, loading: authLoading } = useAuth();
  const [supabase] = useState(() => createClient());

  // Ref to prevent duplicate fetches
  const hasFetchedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Wrapper to set site and persist to localStorage AND cookie
  const setSelectedSite = useCallback((site: Site | null) => {
    setSelectedSiteState(site);
    storeSiteId(site?.id || null);
    setSelectedSiteCookie(site?.id || null);
  }, []);

  // Track active retry timeout so we can cancel on unmount
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch sites from database with automatic retry on failure
  const fetchSites = useCallback(async (retryCount = 0) => {
    if (!userProfile) {
      console.log("[SiteContext] No user profile, skipping fetch");
      return;
    }

    // Only show loading on initial fetch, not retries (to avoid UI flicker)
    if (retryCount === 0) {
      setLoading(true);
      setError(null);
    }

    try {
      console.log("[SiteContext] Fetching sites...", {
        userRole: userProfile.role,
        assignedSites: userProfile.assigned_sites,
        retryCount,
      });

      let query = supabase.from("sites").select("*").order("name");

      // Filter by assigned sites if user is not admin
      if (userProfile.role !== "admin" && userProfile.assigned_sites) {
        query = query.in("id", userProfile.assigned_sites);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error("[SiteContext] Query error:", queryError);
        throw queryError;
      }

      const sitesData: Site[] = data || [];
      console.log("[SiteContext] Sites fetched:", sitesData.length);

      setSites(sitesData);
      storeSites(sitesData);

      // Update selected site
      setSelectedSiteState((prevSelected) => {
        // Keep existing selection if valid, but use FRESH data from sitesData
        if (prevSelected) {
          const freshSite = sitesData.find((s) => s.id === prevSelected.id);
          if (freshSite) {
            return freshSite;
          }
        }

        // No sites available
        if (sitesData.length === 0) {
          storeSiteId(null);
          setSelectedSiteCookie(null);
          return null;
        }

        // Per-tab sessionStorage/localStorage wins; the shared cookie only seeds a fresh tab.
        const cookieSiteId = getSelectedSiteCookie();
        const storedSiteId = getStoredSiteId(); // sessionStorage → localStorage
        const savedSiteId = storedSiteId || cookieSiteId;

        if (savedSiteId) {
          const savedSite = sitesData.find((s) => s.id === savedSiteId);
          if (savedSite) {
            storeSiteId(savedSite.id);
            setSelectedSiteCookie(savedSite.id);
            return savedSite;
          }
        }

        // Default to first site
        const firstSite = sitesData[0];
        storeSiteId(firstSite.id);
        setSelectedSiteCookie(firstSite.id);
        return firstSite;
      });

      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch sites";

      // Retry with exponential backoff if under the limit
      if (retryCount < MAX_FETCH_RETRIES) {
        const delay = 1000 * Math.pow(2, retryCount); // 1s, 2s, 4s
        console.warn(
          `[SiteContext] Fetch failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_FETCH_RETRIES}):`,
          errorMessage
        );
        retryTimeoutRef.current = setTimeout(() => {
          fetchSites(retryCount + 1);
        }, delay);
        return; // Don't set error/loading yet, retry is pending
      }

      console.error("[SiteContext] Error fetching sites (all retries exhausted):", errorMessage);
      setError(errorMessage);
    } finally {
      // Only update loading/initialized on initial attempt or when retries are exhausted
      if (retryCount === 0 || retryCount >= MAX_FETCH_RETRIES) {
        setLoading(false);
        setIsInitialized(true);
      }
    }
  }, [userProfile, supabase]);

  // Restore on mount. Priority: per-tab sessionStorage → shared localStorage → shared cookie.
  // After resolving, write the id back to sessionStorage so this tab owns its selection
  // and a site switch in another tab can never override it on reload/remount.
  useEffect(() => {
    const cachedSites = getStoredSites();
    const cookieSiteId = getSelectedSiteCookie();
    const storedSiteId = getStoredSiteId(); // sessionStorage → localStorage
    const savedSiteId = storedSiteId || cookieSiteId;

    if (cachedSites.length > 0) {
      console.log(
        "[SiteContext] Restoring from cache:",
        cachedSites.length,
        "sites"
      );
      setSites(cachedSites);

      const found = savedSiteId
        ? cachedSites.find((s) => s.id === savedSiteId)
        : undefined;
      const selectedSite = found || cachedSites[0] || null;
      setSelectedSiteState(selectedSite);

      if (selectedSite) {
        storeSiteId(selectedSite.id); // claim per-tab ownership (session + local)
        if (!cookieSiteId) setSelectedSiteCookie(selectedSite.id);
      }
    }
  }, []);

  // Fetch sites when auth is ready
  useEffect(() => {
    console.log("[SiteContext] Effect triggered:", {
      authLoading,
      hasUser: !!user,
      hasUserProfile: !!userProfile,
    });

    if (authLoading) {
      console.log("[SiteContext] Auth still loading, waiting...");
      return;
    }

    if (userProfile) {
      const currentUserId = userProfile.id;
      if (
        !hasFetchedRef.current ||
        lastUserIdRef.current !== currentUserId
      ) {
        console.log("[SiteContext] User profile available, fetching sites");
        hasFetchedRef.current = true;
        lastUserIdRef.current = currentUserId;
        fetchSites();
      }
      return;
    }

    if (user) {
      // Logged-in auth user but profile fetch hasn't completed yet
      // (e.g., second tab hit AuthContext's safety-timeout window). The
      // AuthContext watchdog will keep retrying; don't clear sites and
      // render "No sites available" in the meantime.
      console.log("[SiteContext] Auth user present but profile pending, waiting...");
      return;
    }

    console.log("[SiteContext] No auth user, clearing state");
    hasFetchedRef.current = false;
    lastUserIdRef.current = null;
    setSites([]);
    setSelectedSiteState(null);
    setLoading(false);
    setIsInitialized(true);
  }, [authLoading, user, userProfile?.id, fetchSites]);

  // Re-fetch sites when token is refreshed and previous fetch had failed
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" && error) {
        console.log("[SiteContext] Token refreshed after error, retrying fetch");
        hasFetchedRef.current = false; // Allow re-fetch
        fetchSites();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, error, fetchSites]);

  // Re-fetch sites when tab becomes visible and in error state
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && error && userProfile) {
        console.log("[SiteContext] Tab visible with error state, retrying fetch");
        fetchSites();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [error, userProfile, fetchSites]);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const refreshSites = useCallback(async () => {
    await fetchSites();
  }, [fetchSites]);

  // Memoize context values to prevent unnecessary re-renders
  const sitesDataValue = useMemo(
    () => ({
      sites,
      loading,
      isInitialized,
      error,
    }),
    [sites, loading, isInitialized, error]
  );

  const selectedSiteValue = useMemo(
    () => ({
      selectedSite,
    }),
    [selectedSite]
  );

  const actionsValue = useMemo(
    () => ({
      setSelectedSite,
      refreshSites,
    }),
    [setSelectedSite, refreshSites]
  );

  return (
    <SitesDataContext.Provider value={sitesDataValue}>
      <SelectedSiteContext.Provider value={selectedSiteValue}>
        <SiteActionsContext.Provider value={actionsValue}>
          {children}
        </SiteActionsContext.Provider>
      </SelectedSiteContext.Provider>
    </SitesDataContext.Provider>
  );
}
