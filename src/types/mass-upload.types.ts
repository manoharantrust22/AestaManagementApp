/**
 * Type definitions for Mass Upload feature
 */

// Field types supported in CSV templates
export type FieldType =
  | 'string'
  | 'number'
  | 'date'
  | 'time'
  | 'boolean'
  | 'enum'
  | 'uuid_lookup';

// Configuration for a single field in a table
export interface FieldConfig {
  dbField: string;                    // Database column name
  csvHeader: string;                  // Human-readable CSV header
  required: boolean;                  // Is field required for insert?
  type: FieldType;                    // Field data type
  enumValues?: string[];              // For enum types - allowed values
  lookupTable?: string;               // For uuid_lookup - table to lookup
  lookupField?: string;               // For uuid_lookup - field to match (name, phone, etc.)
  lookupDisplayField?: string;        // For uuid_lookup - field to display in errors
  defaultValue?: string | number | boolean | null;  // Auto-fill value if not provided
  validation?: RegExp;                // Optional validation pattern
  description?: string;               // Help text for CSV template
  transform?: (value: string) => unknown; // Value transformer function
}

// Configuration for a table that supports mass upload
export interface TableConfig {
  tableName: string;                  // Database table name
  displayName: string;                // Human-readable name
  description: string;                // Description shown in UI
  fields: FieldConfig[];              // Field configurations
  requiredContext: ('site_id' | 'user_id')[]; // Auto-injected fields from context
  upsertKey?: string[];               // Fields for upsert matching (if supported)
  exampleRow?: Record<string, string>; // Example data for template
}

// Supported table names for mass upload
export type MassUploadTableName =
  | 'daily_attendance'
  | 'market_laborer_attendance'
  | 'expenses'
  | 'labor_payments'
  | 'laborers'
  | 'subcontracts'
  | 'subcontract_payments'
  | 'tea_shop_entries'
  | 'advances'
  | 'legacy_misc_expenses';

// Validation error for a single field
export interface ValidationError {
  rowNumber: number;
  field: string;
  csvHeader: string;
  value: unknown;
  errorType: 'required' | 'type' | 'enum' | 'lookup' | 'format' | 'constraint';
  message: string;
  suggestion?: string;                // e.g., "Did you mean 'Rajesh Kumar'?"
}

// Result of parsing and validating a single row
export interface ParsedRow {
  rowNumber: number;
  originalData: Record<string, string>;  // Raw CSV data
  transformedData: Record<string, unknown>; // Transformed for DB insert
  errors: ValidationError[];
  warnings: ValidationError[];
  status: 'valid' | 'warning' | 'error';
  isSampleRow?: boolean;  // True if this is a sample/example row from template
  isSkipped?: boolean;    // True if user chose to skip this row
}

// Result of parsing entire CSV file
export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
}

// Lookup cache for resolving names to UUIDs
export interface LookupCache {
  laborers: Map<string, { id: string; name: string; phone: string | null }>;
  categories: Map<string, { id: string; name: string }>;
  roles: Map<string, { id: string; name: string }>;
  sections: Map<string, { id: string; name: string }>;
  teams: Map<string, { id: string; name: string }>;
  teaShops: Map<string, { id: string; name: string }>;
  expenseCategories: Map<string, { id: string; name: string }>;
  // Subcontracts indexed by lowercased title (ambiguous/duplicate titles are
  // intentionally NOT added, so they resolve as "unmatched" -> a warning).
  subcontracts: Map<string, { id: string; title: string; total_value: number | null }>;
}

// Server-side validation request
export interface ValidateRequest {
  tableName: MassUploadTableName;
  siteId: string;
  rows: Record<string, string>[];
  // dbField names of normally-optional fields the user chose to require for THIS
  // import (see TemplateDownloader toggles). Blank/unmatched -> error, not warning.
  requiredFields?: string[];
}

// Financial summary of a legacy-expense batch (computed server-side, shown in the
// preview step and frozen into import_batches.summary at commit).
export interface LegacyExpenseSummary {
  totalSpent: number;
  count: number;
  byCategory: Array<{ categoryId: string | null; name: string; total: number; count: number }>;
  bySubcontract: Array<{
    subcontractId: string | null;
    title: string;
    matched: boolean;
    value: number | null;     // contract total_value (null when unmatched)
    importedSpend: number;     // spend in THIS batch (indicative, not a live rollup)
    balance: number | null;    // value - importedSpend (null when unmatched)
  }>;
  byPayerSource: Array<{ payerSource: string; total: number; count: number }>;
  dateRange: { min: string | null; max: string | null };
  rowsOnOrAfterCutoff: number; // rows dated >= the site cutoff (a "warn but allow" flag)
}

// A persisted bulk-import batch (one row per upload). Drives the Import History UI.
export interface ImportBatch {
  id: string;
  site_id: string;
  site_name?: string | null;
  target_table: string;
  status: 'committed' | 'reverted' | 'purged';
  file_name: string | null;
  original_csv_path: string | null;
  file_hash: string | null;
  total_count: number;
  inserted_count: number;
  summary: LegacyExpenseSummary | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  reverted_at: string | null;
  revert_reason: string | null;
}

// Server-side validation response
export interface ValidateResponse {
  success: boolean;
  parsedRows: ParsedRow[];
  lookupErrors: ValidationError[];
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
  };
  // Only present for legacy_misc_expenses — drives the preview summary panel.
  legacySummary?: LegacyExpenseSummary;
}

// Import request
export interface ImportRequest {
  tableName: MassUploadTableName;
  siteId: string;
  rows: Record<string, unknown>[];
  userId: string;
  userName: string;
  // Provenance for revocable imports (legacy_misc_expenses): the retained CSV in the
  // 'imports' bucket + its sha256 (for the duplicate-upload guard).
  file?: {
    file_name?: string;
    original_csv_path?: string;
    file_hash?: string;
  };
  // dbField names of normally-optional fields the user chose to require for THIS import.
  requiredFields?: string[];
}

// Import result
export interface ImportResult {
  success: boolean;
  importLogId?: string;
  summary: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  errors: Array<{
    rowNumber: number;
    error: string;
  }>;
}

// Import progress for UI updates
export interface ImportProgress {
  status: 'idle' | 'validating' | 'importing' | 'completed' | 'error';
  currentRow: number;
  totalRows: number;
  successCount: number;
  errorCount: number;
  message?: string;
}

// Wizard step type
export type WizardStep = 'select-table' | 'upload' | 'preview' | 'import';

// Wizard state
export interface MassUploadState {
  step: WizardStep;
  selectedTable: MassUploadTableName | null;
  selectedSiteId: string | null;
  selectedSiteName: string | null;
  uploadedFile: File | null;
  parseResult: ParseResult | null;
  importProgress: ImportProgress;
  importResult: ImportResult | null;
}
