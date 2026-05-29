"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "../AuthContext";
import { CompaniesDataContext, type CompanyMembership } from "./CompaniesDataContext";
import { SelectedCompanyContext } from "./SelectedCompanyContext";
import { CompanyActionsContext } from "./CompanyActionsContext";

// Storage keys
const SELECTED_COMPANY_KEY = "selectedCompanyId";
const COMPANIES_CACHE_KEY = "cachedCompanies";

// Helper functions to safely access localStorage
export function getStoredCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Per-tab sessionStorage wins; shared localStorage is the fresh-tab seed.
    const sessionVal = sessionStorage.getItem(SELECTED_COMPANY_KEY);
    if (sessionVal !== null) return sessionVal;
    return localStorage.getItem(SELECTED_COMPANY_KEY);
  } catch {
    return null;
  }
}

function getStoredCompanies(): CompanyMembership[] {
  if (typeof window === "undefined") return [];
  try {
    const cached = localStorage.getItem(COMPANIES_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

export function storeCompanyId(companyId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (companyId) {
      sessionStorage.setItem(SELECTED_COMPANY_KEY, companyId); // per-tab
      localStorage.setItem(SELECTED_COMPANY_KEY, companyId); // shared seed
    } else {
      sessionStorage.removeItem(SELECTED_COMPANY_KEY);
      localStorage.removeItem(SELECTED_COMPANY_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function storeCompanies(companies: CompanyMembership[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPANIES_CACHE_KEY, JSON.stringify(companies));
  } catch {
    // Ignore storage errors
  }
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [selectedCompany, setSelectedCompanyState] = useState<CompanyMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { userProfile, loading: authLoading } = useAuth();
  const [supabase] = useState(() => createClient() as any);

  // Ref to prevent duplicate fetches
  const hasFetchedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Wrapper to set company and persist to localStorage
  const setSelectedCompany = useCallback((company: CompanyMembership | null) => {
    setSelectedCompanyState(company);
    storeCompanyId(company?.id || null);
  }, []);

  // Fetch companies from database
  const fetchCompanies = useCallback(async () => {
    if (!userProfile) {
      console.log("[CompanyContext] No user profile, skipping fetch");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[CompanyContext] Fetching companies for user:", userProfile.id);

      // Fetch company memberships with company details
      const { data, error: queryError } = await supabase
        .from("company_members")
        .select(`
          role,
          is_primary,
          company:companies(
            id,
            name,
            code,
            logo_url,
            city,
            is_active
          )
        `)
        .eq("user_id", userProfile.id);

      if (queryError) {
        console.error("[CompanyContext] Query error:", queryError);
        throw queryError;
      }

      // Define the shape of the query result
      interface MembershipRow {
        role: string;
        is_primary: boolean;
        company: {
          id: string;
          name: string;
          code: string;
          logo_url: string | null;
          city: string | null;
          is_active: boolean;
        } | null;
      }

      // Transform data to CompanyMembership format
      const companiesData: CompanyMembership[] = ((data || []) as MembershipRow[])
        .filter((m) => m.company && m.company.is_active)
        .map((m) => ({
          id: m.company!.id,
          name: m.company!.name,
          code: m.company!.code,
          logo_url: m.company!.logo_url,
          city: m.company!.city,
          is_active: m.company!.is_active,
          role: m.role,
          is_primary: m.is_primary,
        }));

      console.log("[CompanyContext] Companies fetched:", companiesData.length);

      setCompanies(companiesData);
      storeCompanies(companiesData);

      // Update selected company
      setSelectedCompanyState((prevSelected) => {
        // Keep existing selection if valid
        if (prevSelected) {
          const freshCompany = companiesData.find((c) => c.id === prevSelected.id);
          if (freshCompany) {
            return freshCompany;
          }
        }

        // No companies available
        if (companiesData.length === 0) {
          storeCompanyId(null);
          return null;
        }

        // Try to restore from localStorage
        const savedCompanyId = getStoredCompanyId();

        if (savedCompanyId) {
          const savedCompany = companiesData.find((c) => c.id === savedCompanyId);
          if (savedCompany) {
            storeCompanyId(savedCompany.id);
            return savedCompany;
          }
        }

        // Default to primary company or first company
        const primaryCompany = companiesData.find((c) => c.is_primary);
        const defaultCompany = primaryCompany || companiesData[0];
        storeCompanyId(defaultCompany.id);
        return defaultCompany;
      });

      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch companies";
      console.error("[CompanyContext] Error fetching companies:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
      setIsInitialized(true);
    }
  }, [userProfile, supabase]);

  // Restore from sessionStorage (per-tab) → localStorage (shared seed) on mount.
  useEffect(() => {
    const cachedCompanies = getStoredCompanies();
    const savedCompanyId = getStoredCompanyId(); // sessionStorage → localStorage

    if (cachedCompanies.length > 0) {
      console.log(
        "[CompanyContext] Restoring from cache:",
        cachedCompanies.length,
        "companies"
      );
      setCompanies(cachedCompanies);

      const found = savedCompanyId
        ? cachedCompanies.find((c) => c.id === savedCompanyId)
        : undefined;
      const selectedCompany =
        found || cachedCompanies.find((c) => c.is_primary) || cachedCompanies[0] || null;
      setSelectedCompanyState(selectedCompany);

      if (selectedCompany) {
        // Claim per-tab ownership so another tab's switch can't override us.
        storeCompanyId(selectedCompany.id);
      }
    }
  }, []);

  // Fetch companies when auth is ready
  useEffect(() => {
    console.log("[CompanyContext] Effect triggered:", {
      authLoading,
      hasUserProfile: !!userProfile,
    });

    if (authLoading) {
      console.log("[CompanyContext] Auth still loading, waiting...");
      return;
    }

    if (userProfile) {
      const currentUserId = userProfile.id;
      if (
        !hasFetchedRef.current ||
        lastUserIdRef.current !== currentUserId
      ) {
        console.log("[CompanyContext] User profile available, fetching companies");
        hasFetchedRef.current = true;
        lastUserIdRef.current = currentUserId;
        fetchCompanies();
      }
    } else {
      console.log("[CompanyContext] No user profile, clearing state");
      hasFetchedRef.current = false;
      lastUserIdRef.current = null;
      setCompanies([]);
      setSelectedCompanyState(null);
      setLoading(false);
      setIsInitialized(true);
    }
  }, [authLoading, userProfile?.id, fetchCompanies]);

  const refreshCompanies = useCallback(async () => {
    await fetchCompanies();
  }, [fetchCompanies]);

  // Memoize context values to prevent unnecessary re-renders
  const companiesDataValue = useMemo(
    () => ({
      companies,
      loading,
      isInitialized,
      error,
    }),
    [companies, loading, isInitialized, error]
  );

  const selectedCompanyValue = useMemo(
    () => ({
      selectedCompany,
    }),
    [selectedCompany]
  );

  const actionsValue = useMemo(
    () => ({
      setSelectedCompany,
      refreshCompanies,
    }),
    [setSelectedCompany, refreshCompanies]
  );

  return (
    <CompaniesDataContext.Provider value={companiesDataValue}>
      <SelectedCompanyContext.Provider value={selectedCompanyValue}>
        <CompanyActionsContext.Provider value={actionsValue}>
          {children}
        </CompanyActionsContext.Provider>
      </SelectedCompanyContext.Provider>
    </CompaniesDataContext.Provider>
  );
}
