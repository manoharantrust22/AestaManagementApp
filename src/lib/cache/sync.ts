/**
 * Background Sync Orchestrator
 *
 * Manages periodic data refreshes without blocking UI.
 * Coordinates background sync for different data tiers.
 */

import { QueryClient } from "@tanstack/react-query";
import { queryKeys, cacheTTL } from "./keys";
import { cleanupPersistedCache } from "./persistor";
import { getTabCoordinator, TabMessage } from "@/lib/tab/coordinator";
import { isUserIdle } from "@/lib/auth/sessionManager";

type SyncConfig = {
  enabled: boolean;
  intervals: {
    reference: number; // Reference data sync interval
    transactional: number; // Transactional data sync interval
    dashboard: number; // Dashboard data sync interval
    cleanup: number; // Cache cleanup interval
  };
};

const DEFAULT_CONFIG: SyncConfig = {
  enabled: true,
  intervals: {
    reference: 10 * 60 * 1000, // 10 minutes
    transactional: 5 * 60 * 1000, // 5 minutes (aligned with default staleTime to avoid redundant refetches)
    dashboard: 5 * 60 * 1000, // 5 minutes
    cleanup: 30 * 60 * 1000, // 30 minutes
  },
};

export class BackgroundSyncOrchestrator {
  private queryClient: QueryClient;
  private config: SyncConfig;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private lastSyncTimes: Map<string, number> = new Map();
  private currentSiteId: string | null = null;
  private isActive: boolean = false;

  constructor(queryClient: QueryClient, config: Partial<SyncConfig> = {}) {
    this.queryClient = queryClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start background sync
   */
  start(siteId?: string): void {
    if (this.isActive) {
      console.log("Background sync already active");
      return;
    }

    this.isActive = true;
    this.currentSiteId = siteId || null;

    console.log("Starting background sync orchestrator...");

    // Sync reference data periodically
    this.scheduleReferenceSync();

    // Sync transactional data more frequently
    this.scheduleTransactionalSync();

    // Sync dashboard data
    this.scheduleDashboardSync();

    // Sync company-level data (not site-specific)
    this.scheduleCompanySync();

    // Schedule cache cleanup
    this.scheduleCleanup();

    // Initial sync after a short delay
    setTimeout(() => {
      this.syncReferenceData();
    }, 2000);
  }

  /**
   * Stop all background sync
   */
  stop(): void {
    console.log("Stopping background sync orchestrator...");

    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });

    this.intervals.clear();
    this.isActive = false;
  }

  /**
   * Update current site context
   * Clears queries for old site to prevent stale data
   */
  setSiteContext(siteId: string): void {
    if (this.currentSiteId === siteId) {
      return;
    }

    const previousSiteId = this.currentSiteId;
    console.log(`Updating sync context from ${previousSiteId} to site: ${siteId}`);

    // Clear queries that were specific to the previous site
    // This prevents stale data from appearing when switching sites
    if (previousSiteId) {
      const queryCache = this.queryClient.getQueryCache();
      const allQueries = queryCache.getAll();

      allQueries.forEach((query) => {
        const queryKey = query.queryKey;
        // Check if query key contains the previous site ID
        const keyString = JSON.stringify(queryKey);
        if (keyString.includes(previousSiteId)) {
          // Only remove if not currently being actively fetched
          if (query.state.fetchStatus !== "fetching") {
            queryCache.remove(query);
          }
        }
      });
    }

    this.currentSiteId = siteId;

    // Trigger immediate sync for new site context
    this.syncSiteContextData(siteId);
  }

  /**
   * Manual refresh all data
   * @returns true if refresh completed successfully
   */
  async refreshAll(): Promise<boolean> {
    console.log("Manual refresh triggered");

    try {
      const results = await Promise.allSettled([
        this.syncReferenceData(),
        this.currentSiteId
          ? this.syncSiteContextData(this.currentSiteId)
          : Promise.resolve(),
        this.syncDashboardData(),
      ]);

      // Check if any sync failed
      const hasFailures = results.some((r) => r.status === "rejected");

      this.updateLastSyncTime("manual");

      if (hasFailures) {
        console.warn(
          "Some sync operations failed:",
          results.filter((r) => r.status === "rejected")
        );
      }

      return !hasFailures;
    } catch (error) {
      console.error("Manual refresh failed:", error);
      return false;
    }
  }

  /**
   * Get last sync time for a specific category
   */
  getLastSyncTime(category: string): number | null {
    return this.lastSyncTimes.get(category) || null;
  }

  /**
   * Get overall last sync time
   */
  getLastSyncTimeOverall(): number | null {
    const times = Array.from(this.lastSyncTimes.values());
    return times.length > 0 ? Math.max(...times) : null;
  }

  // ==================== PRIVATE METHODS ====================

  private scheduleReferenceSync(): void {
    const interval = setInterval(() => {
      if (isUserIdle()) return; // Skip sync during idle
      this.syncReferenceData();
    }, this.config.intervals.reference);

    this.intervals.set("reference", interval);
  }

  private scheduleTransactionalSync(): void {
    const interval = setInterval(() => {
      if (isUserIdle()) return; // Skip sync during idle to reduce network contention
      if (this.currentSiteId) {
        this.syncTransactionalData(this.currentSiteId);
      }
    }, this.config.intervals.transactional);

    this.intervals.set("transactional", interval);
  }

  private scheduleDashboardSync(): void {
    const interval = setInterval(() => {
      if (isUserIdle()) return; // Skip sync during idle
      this.syncDashboardData();
    }, this.config.intervals.dashboard);

    this.intervals.set("dashboard", interval);
  }

  private scheduleCompanySync(): void {
    const interval = setInterval(() => {
      if (isUserIdle()) return; // Skip sync during idle
      this.syncCompanyData();
    }, this.config.intervals.reference); // Same interval as reference data

    this.intervals.set("company", interval);
  }

  private scheduleCleanup(): void {
    const interval = setInterval(() => {
      this.performCleanup();
    }, this.config.intervals.cleanup);

    this.intervals.set("cleanup", interval);
  }

  /**
   * Sync reference data in background
   */
  private async syncReferenceData(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const queriesToSync = [
        queryKeys.sites.list(),
        queryKeys.laborCategories.list(),
        queryKeys.laborRoles.list(),
        queryKeys.materials.list(),
        queryKeys.vendors.list(),
      ];

      // Invalidate queries to trigger background refetch
      await Promise.allSettled(
        queriesToSync.map((queryKey) =>
          this.queryClient.invalidateQueries({
            queryKey,
            refetchType: "none", // Don't refetch if not being observed
          })
        )
      );

      this.updateLastSyncTime("reference");
    } catch (error) {
      console.error("Reference data sync error:", error);
    }
  }

  /**
   * Sync site-specific context data
   */
  private async syncSiteContextData(siteId: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const queriesToSync = [
        queryKeys.teams.bySite(siteId),
        queryKeys.laborers.bySite(siteId),
        queryKeys.subcontracts.active(siteId),
      ];

      await Promise.allSettled(
        queriesToSync.map((queryKey) =>
          this.queryClient.invalidateQueries({
            queryKey,
            refetchType: "active", // Refetch if currently being observed
          })
        )
      );

      this.updateLastSyncTime("context");
    } catch (error) {
      console.error("Site context sync error:", error);
    }
  }

  /**
   * Sync transactional data for current context
   */
  private async syncTransactionalData(siteId: string): Promise<void> {
    if (!this.config.enabled || !siteId) return;

    try {
      const today = new Date().toISOString().split("T")[0];

      const queriesToSync = [
        queryKeys.attendance.today(siteId),
        queryKeys.attendance.active(siteId),
        queryKeys.expenses.byDate(siteId, today),
        queryKeys.salaryPeriods.pending(siteId),
        queryKeys.clientPayments.pending(siteId),
        queryKeys.materialStock.lowStock(siteId),
      ];

      await Promise.allSettled(
        queriesToSync.map((queryKey) =>
          this.queryClient.invalidateQueries({
            queryKey,
            refetchType: "active",
          })
        )
      );

      this.updateLastSyncTime("transactional");
    } catch (error) {
      console.error("Transactional data sync error:", error);
    }
  }

  /**
   * Sync dashboard/aggregated data
   */
  private async syncDashboardData(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const queriesToSync: (readonly unknown[])[] = [
        queryKeys.dashboard.company(),
        queryKeys.stats.company(),
      ];

      if (this.currentSiteId) {
        queriesToSync.push(
          queryKeys.dashboard.site(this.currentSiteId),
          queryKeys.stats.site(this.currentSiteId)
        );
      }

      await Promise.allSettled(
        queriesToSync.map((queryKey) =>
          this.queryClient.invalidateQueries({
            queryKey,
            refetchType: "active",
          })
        )
      );

      this.updateLastSyncTime("dashboard");
    } catch (error) {
      console.error("Dashboard data sync error:", error);
    }
  }

  /**
   * Sync company-level data (not site-specific)
   * These queries work regardless of selected site (e.g., Material Catalog, Vendor Directory)
   */
  private async syncCompanyData(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const queriesToSync: (readonly unknown[])[] = [
        queryKeys.materials.list(),
        queryKeys.materials.all,
        queryKeys.vendors.list(),
        queryKeys.laborCategories.list(),
        queryKeys.laborRoles.list(),
        queryKeys.siteGroups.list(),
        queryKeys.companyTeaShops.list(),
      ];

      await Promise.allSettled(
        queriesToSync.map((queryKey) =>
          this.queryClient.invalidateQueries({
            queryKey,
            refetchType: "active", // Only refetch if currently being observed
          })
        )
      );

      this.updateLastSyncTime("company");
    } catch (error) {
      console.error("Company data sync error:", error);
    }
  }

  /**
   * Perform cache cleanup
   * IMPORTANT: Only removes stale/inactive queries, NOT the entire cache
   */
  private async performCleanup(): Promise<void> {
    try {
      // Get all queries in the cache
      const queryCache = this.queryClient.getQueryCache();
      const allQueries = queryCache.getAll();
      const now = Date.now();
      let removedCount = 0;

      // Only remove queries that are:
      // 1. Not actively being observed (no components using them)
      // 2. Have exceeded their garbage collection time
      allQueries.forEach((query) => {
        const isActive = query.getObserversCount() > 0;
        const gcTime = query.options.gcTime ?? 30 * 60 * 1000; // Default 30 min
        const lastUpdated = query.state.dataUpdatedAt || 0;
        const age = now - lastUpdated;

        // Only remove if not active AND past garbage collection time
        if (!isActive && age > gcTime) {
          queryCache.remove(query);
          removedCount++;
        }
      });

      // Clean up persisted cache (IndexedDB)
      await cleanupPersistedCache();

      if (removedCount > 0) {
        console.log(`Cache cleanup: removed ${removedCount} stale queries`);
      }
    } catch (error) {
      console.error("Cache cleanup error:", error);
    }
  }

  private updateLastSyncTime(category: string): void {
    const now = Date.now();
    this.lastSyncTimes.set(category, now);

    // Store in localStorage for persistence across sessions
    try {
      localStorage.setItem(`sync_${category}`, now.toString());
      localStorage.setItem("sync_last", now.toString());
    } catch (error) {
      console.error("Failed to store sync time:", error);
    }
  }
}

// Singleton instance
let syncOrchestratorInstance: BackgroundSyncOrchestrator | null = null;

// Subscription cleanup for follower tabs
let tabMessageUnsubscribe: (() => void) | null = null;

/**
 * Get or create sync orchestrator instance
 * Returns null if no orchestrator exists and no QueryClient provided
 * (this is expected during initial app load - no warning needed)
 */
export function getSyncOrchestrator(
  queryClient?: QueryClient
): BackgroundSyncOrchestrator | null {
  // If no QueryClient provided and no instance exists, just return null
  // This is expected during initial load when checking if orchestrator is ready
  if (!queryClient && !syncOrchestratorInstance) {
    return null;
  }

  if (!syncOrchestratorInstance && queryClient) {
    syncOrchestratorInstance = new BackgroundSyncOrchestrator(queryClient);
  }

  return syncOrchestratorInstance;
}

/**
 * Initialize background sync
 * Leader tab runs active sync; all tabs listen for broadcasts
 * Follower tabs can still fetch data on-demand via React Query
 */
export function initBackgroundSync(
  queryClient: QueryClient,
  siteId?: string
): void {
  const coordinator = getTabCoordinator();
  const isLeader = !coordinator || coordinator.isLeader;

  // Clean up any existing tab message subscription
  if (tabMessageUnsubscribe) {
    tabMessageUnsubscribe();
    tabMessageUnsubscribe = null;
  }

  // All tabs subscribe to broadcasts for cache invalidation
  if (coordinator) {
    tabMessageUnsubscribe = coordinator.subscribe((message: TabMessage) => {
      if (message.type === "CACHE_INVALIDATE" && message.queryKeys) {
        // Invalidate the specified queries - triggers refetch if query is active
        message.queryKeys.forEach((queryKey) => {
          queryClient.invalidateQueries({
            queryKey: queryKey as unknown[],
            refetchType: "active",
          });
        });
      } else if (message.type === "SITE_CHANGED") {
        // Site changed in another tab - just log it
        // Each tab manages its own site context independently
        console.log("[Sync] Site changed in another tab to:", message.siteId);
      }
    });
  }

  // Only leader tab runs the background sync orchestrator
  // This prevents duplicate polling from multiple tabs
  if (isLeader) {
    console.log("[Sync] Leader tab - starting active sync");
    const orchestrator = getSyncOrchestrator(queryClient);
    orchestrator?.start(siteId);
  } else {
    console.log("[Sync] Follower tab - ready for on-demand fetching");
  }
}

/**
 * Stop background sync
 */
export function stopBackgroundSync(): void {
  // Clean up tab message subscription if we're a follower
  if (tabMessageUnsubscribe) {
    tabMessageUnsubscribe();
    tabMessageUnsubscribe = null;
  }

  // Stop the orchestrator if we're the leader
  syncOrchestratorInstance?.stop();
}

/**
 * Update site context for sync
 */
export function updateSyncContext(siteId: string): void {
  syncOrchestratorInstance?.setSiteContext(siteId);
}

/**
 * Trigger manual refresh
 * @throws Error if sync orchestrator is not initialized
 * @returns true if refresh was successful
 */
export async function manualRefresh(): Promise<boolean> {
  if (!syncOrchestratorInstance) {
    throw new Error(
      "Sync orchestrator not initialized. Please wait for the app to fully load or refresh the page."
    );
  }
  return await syncOrchestratorInstance.refreshAll();
}

/**
 * Get last overall sync time
 */
export function getLastSyncTime(): number | null {
  // Try to get from localStorage first
  try {
    const stored = localStorage.getItem("sync_last");
    if (stored) {
      return parseInt(stored, 10);
    }
  } catch (error) {
    console.error("Failed to get sync time from storage:", error);
  }

  return syncOrchestratorInstance?.getLastSyncTimeOverall() || null;
}
