/**
 * Standardized Query Key Factory
 * 
 * Provides consistent query key patterns for all data entities.
 * This enables better cache management, invalidation, and persistence.
 * 
 * Key Structure:
 * - Level 1: Entity type (e.g., 'sites', 'attendance')
 * - Level 2: Scope (e.g., 'all', 'byId', 'list')
 * - Level 3+: Filters/params (e.g., siteId, date ranges)
 */

export const queryKeys = {
  // ==================== REFERENCE DATA (24hr cache) ====================
  // Rarely changes, can be cached for extended periods

  sites: {
    all: ['sites'] as const,
    byId: (id: string) => ['sites', id] as const,
    list: () => ['sites', 'list'] as const,
  },

  teams: {
    all: ['teams'] as const,
    bySite: (siteId: string) => ['teams', 'site', siteId] as const,
    byId: (id: string) => ['teams', id] as const,
  },

  laborers: {
    all: ['laborers'] as const,
    list: () => ['laborers', 'list'] as const,
    bySite: (siteId: string) => ['laborers', 'site', siteId] as const,
    byId: (id: string) => ['laborers', id] as const,
    daily: () => ['laborers', 'type', 'daily_market'] as const,
    contract: () => ['laborers', 'type', 'contract'] as const,
  },

  laborCategories: {
    all: ['labor-categories'] as const,
    list: () => ['labor-categories', 'list'] as const,
  },

  laborRoles: {
    all: ['labor-roles'] as const,
    list: () => ['labor-roles', 'list'] as const,
  },

  materials: {
    all: ['materials'] as const,
    list: () => ['materials', 'list'] as const,
    byId: (id: string) => ['materials', id] as const,
  },

  vendors: {
    all: ['vendors'] as const,
    list: () => ['vendors', 'list'] as const,
    byId: (id: string) => ['vendors', id] as const,
  },

  users: {
    all: ['users'] as const,
    list: () => ['users', 'list'] as const,
    byId: (id: string) => ['users', id] as const,
    profile: (userId: string) => ['users', 'profile', userId] as const,
  },

  // ==================== COMPANY DATA (Multi-tenancy) ====================

  companies: {
    all: ['companies'] as const,
    list: () => ['companies', 'list'] as const,
    byId: (id: string) => ['companies', id] as const,
    current: () => ['companies', 'current'] as const,
  },

  companyMembers: {
    all: ['company-members'] as const,
    list: (companyId: string) => ['company-members', companyId, 'list'] as const,
    byId: (memberId: string) => ['company-members', memberId] as const,
  },

  companyInvites: {
    all: ['company-invites'] as const,
    list: (companyId: string) => ['company-invites', companyId, 'list'] as const,
    pending: (companyId: string) => ['company-invites', companyId, 'pending'] as const,
    byToken: (token: string) => ['company-invites', 'token', token] as const,
  },

  companyPrices: {
    all: ['company-prices'] as const,
    list: (companyId: string) => ['company-prices', companyId, 'list'] as const,
    byVendor: (companyId: string, vendorId: string) => ['company-prices', companyId, 'vendor', vendorId] as const,
    byMaterial: (companyId: string, materialId: string) => ['company-prices', companyId, 'material', materialId] as const,
    comparison: (companyId: string, location: string) => ['company-prices', companyId, 'comparison', location] as const,
  },

  subcontracts: {
    all: ['subcontracts'] as const,
    bySite: (siteId: string) => ['subcontracts', 'site', siteId] as const,
    byId: (id: string) => ['subcontracts', id] as const,
    active: (siteId: string) => ['subcontracts', 'site', siteId, 'active'] as const,
  },

  // ==================== TRANSACTIONAL DATA (5min cache) ====================
  // Frequently updated, needs regular refresh

  attendance: {
    all: ['attendance'] as const,
    byDate: (siteId: string, date: string) =>
      ['attendance', 'site', siteId, 'date', date] as const,
    dateRange: (siteId: string, from: string, to: string) =>
      ['attendance', 'site', siteId, 'range', { from, to }] as const,
    active: (siteId: string) =>
      ['attendance', 'site', siteId, 'active'] as const,
    today: (siteId: string) =>
      ['attendance', 'site', siteId, 'today'] as const,
  },

  marketAttendance: {
    all: ['market-attendance'] as const,
    byDate: (siteId: string, date: string) =>
      ['market-attendance', 'site', siteId, 'date', date] as const,
    dateRange: (siteId: string, from: string, to: string) =>
      ['market-attendance', 'site', siteId, 'range', { from, to }] as const,
  },

  expenses: {
    all: ['expenses'] as const,
    bySite: (siteId: string) => ['expenses', 'site', siteId] as const,
    byDate: (siteId: string, date: string) =>
      ['expenses', 'site', siteId, 'date', date] as const,
    dateRange: (siteId: string, from: string, to: string) =>
      ['expenses', 'site', siteId, 'range', { from, to }] as const,
  },

  salaryPeriods: {
    all: ['salary-periods'] as const,
    bySite: (siteId: string) => ['salary-periods', 'site', siteId] as const,
    byId: (id: string) => ['salary-periods', id] as const,
    detailed: (siteId: string) =>
      ['salary-periods', 'site', siteId, 'detailed'] as const,
    pending: (siteId: string) =>
      ['salary-periods', 'site', siteId, 'pending'] as const,
  },

  clientPayments: {
    all: ['client-payments'] as const,
    bySite: (siteId: string) => ['client-payments', 'site', siteId] as const,
    pending: (siteId: string) =>
      ['client-payments', 'site', siteId, 'pending'] as const,
  },

  teaShop: {
    all: ['tea-shop'] as const,
    entries: (siteId: string) => ['tea-shop', 'site', siteId, 'entries'] as const,
    settlements: (siteId: string) =>
      ['tea-shop', 'site', siteId, 'settlements'] as const,
    pending: (siteId: string) =>
      ['tea-shop', 'site', siteId, 'pending'] as const,
  },

  groupTeaShop: {
    all: ['group-tea-shop'] as const,
    byGroup: (groupId: string) => ['group-tea-shop', 'group', groupId] as const,
    entries: (groupId: string) => ['group-tea-shop', 'group', groupId, 'entries'] as const,
    settlements: (groupId: string) => ['group-tea-shop', 'group', groupId, 'settlements'] as const,
    pending: (groupId: string) => ['group-tea-shop', 'group', groupId, 'pending'] as const,
    attendance: (groupId: string, date: string) =>
      ['group-tea-shop', 'group', groupId, 'attendance', date] as const,
  },

  combinedTeaShop: {
    all: ['combined-tea-shop'] as const,
    entries: (groupId: string) => ['combined-tea-shop', 'entries', groupId] as const,
    settlements: (groupId: string) => ['combined-tea-shop', 'settlements', groupId] as const,
    pending: (groupId: string) => ['combined-tea-shop', 'pending', groupId] as const,
    unsettled: (groupId: string) => ['combined-tea-shop', 'unsettled', groupId] as const,
  },

  // Company-level tea shops (new model)
  companyTeaShops: {
    all: ['company-tea-shops'] as const,
    list: () => ['company-tea-shops', 'list'] as const,
    byId: (id: string) => ['company-tea-shops', id] as const,
    assignments: (teaShopId: string) => ['company-tea-shops', teaShopId, 'assignments'] as const,
    forSite: (siteId: string) => ['company-tea-shops', 'for-site', siteId] as const,
    forGroup: (groupId: string) => ['company-tea-shops', 'for-group', groupId] as const,
    entries: (teaShopId: string) => ['company-tea-shops', teaShopId, 'entries'] as const,
    settlements: (teaShopId: string) => ['company-tea-shops', teaShopId, 'settlements'] as const,
    dayUnits: (groupId: string, date: string) => ['company-tea-shops', 'day-units', groupId, date] as const,
    entryAllocations: (entryId: string) => ['company-tea-shops', 'entry-allocations', entryId] as const,
  },

  // ==================== INVENTORY DATA (5min cache) ====================

  materialStock: {
    all: ['material-stock'] as const,
    bySite: (siteId: string) => ['material-stock', 'site', siteId] as const,
    summary: (siteId: string) =>
      ['material-stock', 'site', siteId, 'summary'] as const,
    lowStock: (siteId: string) =>
      ['material-stock', 'site', siteId, 'low-stock'] as const,
  },

  materialUsage: {
    all: ['material-usage'] as const,
    bySite: (siteId: string) => ['material-usage', 'site', siteId] as const,
    byDate: (siteId: string, date: string) =>
      ['material-usage', 'site', siteId, 'date', date] as const,
  },

  materialRequests: {
    all: ['material-requests'] as const,
    bySite: (siteId: string) => ['material-requests', 'site', siteId] as const,
    pending: (siteId: string) =>
      ['material-requests', 'site', siteId, 'pending'] as const,
  },

  purchaseOrders: {
    all: ['purchase-orders'] as const,
    bySite: (siteId: string) => ['purchase-orders', 'site', siteId] as const,
    pending: (siteId: string) =>
      ['purchase-orders', 'site', siteId, 'pending'] as const,
  },

  // ==================== SITE GROUPS & COMMON STOCK ====================

  siteGroups: {
    all: ['site-groups'] as const,
    list: () => ['site-groups', 'list'] as const,
    byId: (id: string) => ['site-groups', id] as const,
    sites: (groupId: string) => ['site-groups', groupId, 'sites'] as const,
  },

  groupStock: {
    all: ['group-stock'] as const,
    byGroup: (groupId: string) => ['group-stock', 'group', groupId] as const,
    summary: (groupId: string) => ['group-stock', 'group', groupId, 'summary'] as const,
    transactions: (groupId: string) => ['group-stock', 'group', groupId, 'transactions'] as const,
    usageBySite: (groupId: string) => ['group-stock', 'group', groupId, 'usage-by-site'] as const,
  },

  // ==================== INTER-SITE SETTLEMENTS ====================

  interSiteSettlements: {
    all: ['inter-site-settlements'] as const,
    bySite: (siteId: string) => ['inter-site-settlements', 'site', siteId] as const,
    byGroup: (groupId: string) => ['inter-site-settlements', 'group', groupId] as const,
    byId: (id: string) => ['inter-site-settlements', id] as const,
    balances: (groupId: string) => ['inter-site-settlements', 'balances', groupId] as const,
    summary: (siteId: string) => ['inter-site-settlements', 'summary', siteId] as const,
    pending: (siteId: string) => ['inter-site-settlements', 'pending', siteId] as const,
  },

  // ==================== MATERIAL PURCHASE EXPENSES ====================

  materialPurchases: {
    all: ['material-purchases'] as const,
    bySite: (siteId: string) => ['material-purchases', 'site', siteId] as const,
    byGroup: (groupId: string) => ['material-purchases', 'group', groupId] as const,
    byId: (id: string) => ['material-purchases', id] as const,
    byRefCode: (refCode: string) => ['material-purchases', 'ref', refCode] as const,
    batches: (groupId: string) => ['material-purchases', 'batches', groupId] as const,
    ownSite: (siteId: string) => ['material-purchases', 'own-site', siteId] as const,
    groupStock: (groupId: string) => ['material-purchases', 'group-stock', groupId] as const,
  },

  // ==================== BATCH USAGE ====================

  batchUsage: {
    all: ['batch-usage'] as const,
    byBatch: (batchRefCode: string) => ['batch-usage', 'batch', batchRefCode] as const,
    bySite: (siteId: string) => ['batch-usage', 'site', siteId] as const,
    byGroup: (groupId: string) => ['batch-usage', 'group', groupId] as const,
    summary: (batchRefCode: string) => ['batch-usage', 'summary', batchRefCode] as const,
    allocations: (settlementId: string) => ['batch-usage', 'allocations', settlementId] as const,
  },

  // ==================== VENDOR INVENTORY & PRICE HISTORY ====================

  vendorInventory: {
    all: ['vendor-inventory'] as const,
    byVendor: (vendorId: string) => ['vendor-inventory', 'vendor', vendorId] as const,
    byMaterial: (materialId: string) => ['vendor-inventory', 'material', materialId] as const,
    byVariants: (variantIds: string[]) => ['vendor-inventory', 'variants', variantIds] as const,
    search: (query: string) => ['vendor-inventory', 'search', query] as const,
  },

  priceHistory: {
    all: ['price-history'] as const,
    byVendorMaterial: (vendorId: string, materialId: string) =>
      ['price-history', 'vendor', vendorId, 'material', materialId] as const,
    byMaterial: (materialId: string) => ['price-history', 'material', materialId] as const,
    byVendor: (vendorId: string) => ['price-history', 'vendor', vendorId] as const,
  },

  // ==================== DELIVERIES & VERIFICATION ====================

  deliveries: {
    all: ['deliveries'] as const,
    bySite: (siteId: string) => ['deliveries', 'site', siteId] as const,
    byId: (id: string) => ['deliveries', id] as const,
    pendingVerification: (siteId: string) =>
      ['deliveries', 'site', siteId, 'pending-verification'] as const,
    byPO: (poId: string) => ['deliveries', 'po', poId] as const,
  },

  // ==================== STORE CATALOG ====================

  storeCatalog: {
    all: ['store-catalog'] as const,
    byVendor: (vendorId: string) => ['store-catalog', 'vendor', vendorId] as const,
    categories: (vendorId: string) => ['store-catalog', 'vendor', vendorId, 'categories'] as const,
    search: (vendorId: string, query: string) => ['store-catalog', 'vendor', vendorId, 'search', query] as const,
    priceComparison: (materialId: string) => ['store-catalog', 'price-comparison', materialId] as const,
  },

  // ==================== WEIGHT PREDICTION ====================

  weightPrediction: {
    all: ['weight-prediction'] as const,
    byVendorMaterialBrand: (vendorId: string | undefined, materialId: string | undefined, brandId: string | null | undefined) =>
      ['weight-prediction', vendorId, materialId, brandId] as const,
    history: (vendorId: string, materialId: string, brandId: string | null) =>
      ['weight-prediction', 'history', vendorId, materialId, brandId] as const,
  },

  // ==================== BILL VERIFICATION ====================

  billVerification: {
    all: ['bill-verification'] as const,
    byPO: (poId: string) => ['bill-verification', 'po', poId] as const,
    unverified: (siteId: string) => ['bill-verification', 'unverified', siteId] as const,
  },

  // ==================== DASHBOARD / AGGREGATED DATA (2min cache) ====================
  // Frequently viewed, needs to be relatively fresh

  dashboard: {
    all: ['dashboard'] as const,
    site: (siteId: string) => ['dashboard', 'site', siteId] as const,
    company: () => ['dashboard', 'company'] as const,
    metrics: (siteId: string) => ['dashboard', 'site', siteId, 'metrics'] as const,
  },

  reports: {
    all: ['reports'] as const,
    attendance: (siteId: string, from: string, to: string) =>
      ['reports', 'attendance', siteId, { from, to }] as const,
    expenses: (siteId: string, from: string, to: string) =>
      ['reports', 'expenses', siteId, { from, to }] as const,
    payments: (siteId: string, from: string, to: string) =>
      ['reports', 'payments', siteId, { from, to }] as const,
  },

  stats: {
    all: ['stats'] as const,
    company: () => ['stats', 'company'] as const,
    site: (siteId: string) => ['stats', 'site', siteId] as const,
  },
} as const;

/**
 * Cache TTL (Time To Live) configurations in milliseconds
 */
export const cacheTTL = {
  // Reference data - rarely changes
  reference: 24 * 60 * 60 * 1000, // 24 hours

  // Transactional data - frequently updated
  transactional: 5 * 60 * 1000, // 5 minutes

  // Dashboard/aggregated data - balance between freshness and performance
  dashboard: 2 * 60 * 1000, // 2 minutes

  // Real-time critical data - very short cache
  realtime: 30 * 1000, // 30 seconds
} as const;

/**
 * Helper to determine cache TTL based on query key
 * Handles complex query keys like ['attendance', 'site', siteId, 'today']
 */
export function getCacheTTL(queryKey: readonly unknown[]): number {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return cacheTTL.transactional;
  }

  const entity = queryKey[0] as string;

  // Reference data entities - 24 hour cache
  const referenceEntities = [
    'sites',
    'teams',
    'laborers',
    'labor-categories',
    'labor-roles',
    'materials',
    'vendors',
    'users',
    'subcontracts',
    'companies',
    'company-members',
    'company-invites',
    'company-prices',
  ];

  // Dashboard/stats entities - 2 minute cache
  const dashboardEntities = ['dashboard', 'reports', 'stats'];

  // Real-time critical entities (checked by prefix) - 30 second cache
  const realtimeEntities = ['attendance', 'market-attendance'];

  if (referenceEntities.includes(entity)) {
    return cacheTTL.reference;
  }

  if (dashboardEntities.includes(entity)) {
    return cacheTTL.dashboard;
  }

  // For attendance queries, check if it's a "today" or "active" query
  // These need shorter TTL for real-time updates
  if (realtimeEntities.includes(entity)) {
    // Check the last element of the query key for real-time indicators
    const lastElement = queryKey[queryKey.length - 1];
    if (lastElement === 'today' || lastElement === 'active') {
      return cacheTTL.realtime;
    }
    // Regular attendance queries get transactional TTL
    return cacheTTL.transactional;
  }

  // Default to transactional TTL
  return cacheTTL.transactional;
}

/**
 * Helper to check if a query should be persisted
 * Some queries (like user sessions) should not be persisted to IndexedDB
 */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return true;
  }

  const entity = queryKey[0] as string;

  // Don't persist sensitive, session-specific, or massive datasets that block main thread
  // Also exclude queries with "detail" sub-key to prevent hydration issues
  const noPersistEntities = ['auth-session', 'temp', 'preview', 'purchase-orders', 'vendors', 'group-tea-shop'];

  // Don't persist detail queries (they can cause hydration issues when pending)
  // Also exclude linked-pos queries that depend on source_request_id column
  if (queryKey.length > 1 && (queryKey[1] === 'detail' || queryKey[1] === 'for-materials' || queryKey[1] === 'items-for-conversion' || queryKey[1] === 'linked-pos')) {
    return false;
  }

  // Don't persist scope-wide aggregate queries (e.g. attendance summary
  // RPC). They're cheap to recompute and persisting an outdated total —
  // or worse, a cached zeros result from a transient error — would
  // silently mislead the user on the next page load.
  if (queryKey.includes('summary')) {
    return false;
  }

  return !noPersistEntities.includes(entity);
}

/**
 * Alias for backward compatibility and simpler imports
 */
export const cacheKeys = {
  ...queryKeys,
  // Convenience method for weight prediction
  weightPrediction: (vendorId: string | undefined, materialId: string | undefined, brandId: string | null | undefined) =>
    queryKeys.weightPrediction.byVendorMaterialBrand(vendorId, materialId, brandId),
};
