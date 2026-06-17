/**
 * Table configurations for Mass Upload feature
 * Static configs for client-side usage
 *
 * NOTE: For dynamic schema-based templates (auto-updating with DB changes),
 * use dynamicSchema.server.ts in API routes
 */

import { TableConfig, MassUploadTableName, FieldConfig } from '@/types/mass-upload.types';

// Payment mode enum values
const PAYMENT_MODES = ['cash', 'upi', 'bank_transfer', 'cheque', 'other'];

// Work days allowed values
const WORK_DAYS_VALUES = ['0.5', '1', '1.5', '2', '2.5'];

// Expense module enum values
const EXPENSE_MODULES = ['labor', 'material', 'machinery', 'general'];

// Employment type enum values
const EMPLOYMENT_TYPES = ['daily_wage', 'contract', 'specialist'];

// Transaction type enum values
const TRANSACTION_TYPES = ['advance', 'extra'];

// misc_expenses.payment_mode CHECK allows only these (no 'other')
const MISC_PAYMENT_MODES = ['cash', 'upi', 'bank_transfer', 'cheque'];

// misc_expenses.payer_source CHECK values (who funded the expense)
const PAYER_SOURCES = [
  'own_money',
  'amma_money',
  'client_money',
  'trust_account',
  'other_site_money',
  'custom',
];

/**
 * Daily Attendance Configuration
 */
const dailyAttendanceConfig: TableConfig = {
  tableName: 'daily_attendance',
  displayName: 'Daily Attendance',
  description: 'Bulk upload daily attendance records for laborers',
  requiredContext: ['site_id', 'user_id'],
  upsertKey: ['laborer_id', 'date', 'site_id'],
  fields: [
    {
      dbField: 'laborer_id',
      csvHeader: 'laborer_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'laborers',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'date',
      csvHeader: 'date',
      required: true,
      type: 'date',
    },
    {
      dbField: 'work_days',
      csvHeader: 'work_days',
      required: false,
      type: 'enum',
      enumValues: WORK_DAYS_VALUES,
      defaultValue: '1',
    },
    {
      dbField: 'daily_rate_applied',
      csvHeader: 'daily_rate_applied',
      required: true,
      type: 'number',
    },
    {
      dbField: 'daily_earnings',
      csvHeader: 'daily_earnings',
      required: true,
      type: 'number',
    },
    {
      dbField: 'in_time',
      csvHeader: 'in_time',
      required: false,
      type: 'time',
    },
    {
      dbField: 'out_time',
      csvHeader: 'out_time',
      required: false,
      type: 'time',
    },
    {
      dbField: 'section_id',
      csvHeader: 'section_id',
      required: false,
      type: 'uuid_lookup',
      lookupTable: 'building_sections',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'team_id',
      csvHeader: 'team_id',
      required: false,
      type: 'uuid_lookup',
      lookupTable: 'teams',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'work_description',
      csvHeader: 'work_description',
      required: false,
      type: 'string',
    },
    {
      dbField: 'snacks_amount',
      csvHeader: 'snacks_amount',
      required: false,
      type: 'number',
      defaultValue: 0,
    },
  ],
  exampleRow: {
    'laborer_id': 'Rajesh Kumar',
    'date': '2024-01-15',
    'work_days': '1',
    'daily_rate_applied': '850',
    'daily_earnings': '850',
    'in_time': '08:30',
    'out_time': '17:30',
    'section_id': 'Block A',
    'team_id': 'Mason Team',
    'work_description': 'Foundation work',
    'snacks_amount': '50',
  },
};

/**
 * Market Laborer Attendance Configuration
 */
const marketLaborerAttendanceConfig: TableConfig = {
  tableName: 'market_laborer_attendance',
  displayName: 'Market Laborer Attendance',
  description: 'Bulk upload attendance for market/anonymous laborers',
  requiredContext: ['site_id', 'user_id'],
  upsertKey: ['role_id', 'date', 'site_id'],
  fields: [
    {
      dbField: 'role_id',
      csvHeader: 'role_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'labor_roles',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'date',
      csvHeader: 'date',
      required: true,
      type: 'date',
    },
    {
      dbField: 'count',
      csvHeader: 'count',
      required: true,
      type: 'number',
    },
    {
      dbField: 'rate_per_person',
      csvHeader: 'rate_per_person',
      required: true,
      type: 'number',
    },
    {
      dbField: 'work_days',
      csvHeader: 'work_days',
      required: false,
      type: 'enum',
      enumValues: WORK_DAYS_VALUES,
      defaultValue: '1',
    },
    {
      dbField: 'total_cost',
      csvHeader: 'total_cost',
      required: false,
      type: 'number',
    },
    {
      dbField: 'section_id',
      csvHeader: 'section_id',
      required: false,
      type: 'uuid_lookup',
      lookupTable: 'building_sections',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'in_time',
      csvHeader: 'in_time',
      required: false,
      type: 'time',
    },
    {
      dbField: 'out_time',
      csvHeader: 'out_time',
      required: false,
      type: 'time',
    },
    {
      dbField: 'snacks_per_person',
      csvHeader: 'snacks_per_person',
      required: false,
      type: 'number',
      defaultValue: 0,
    },
    {
      dbField: 'notes',
      csvHeader: 'notes',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    'role_id': 'Helper',
    'date': '2024-01-15',
    'count': '5',
    'rate_per_person': '600',
    'work_days': '1',
    'total_cost': '3000',
    'section_id': 'Block A',
    'in_time': '08:00',
    'out_time': '17:00',
    'snacks_per_person': '30',
    'notes': 'Hired from labor market',
  },
};

/**
 * Expenses Configuration
 */
const expensesConfig: TableConfig = {
  tableName: 'expenses',
  displayName: 'Expenses',
  description: 'Bulk upload expenses including materials, machinery, and general costs',
  requiredContext: ['site_id', 'user_id'],
  fields: [
    {
      dbField: 'date',
      csvHeader: 'date',
      required: true,
      type: 'date',
    },
    {
      dbField: 'module',
      csvHeader: 'module',
      required: false,
      type: 'enum',
      enumValues: EXPENSE_MODULES,
      defaultValue: 'general',
    },
    {
      dbField: 'category_id',
      csvHeader: 'category_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'expense_categories',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'amount',
      csvHeader: 'amount',
      required: true,
      type: 'number',
    },
    {
      dbField: 'description',
      csvHeader: 'description',
      required: false,
      type: 'string',
    },
    {
      dbField: 'vendor_name',
      csvHeader: 'vendor_name',
      required: false,
      type: 'string',
    },
    {
      dbField: 'vendor_contact',
      csvHeader: 'vendor_contact',
      required: false,
      type: 'string',
    },
    {
      dbField: 'payment_mode',
      csvHeader: 'payment_mode',
      required: false,
      type: 'enum',
      enumValues: PAYMENT_MODES,
      defaultValue: 'cash',
    },
    {
      dbField: 'reference_number',
      csvHeader: 'reference_number',
      required: false,
      type: 'string',
    },
    {
      dbField: 'is_cleared',
      csvHeader: 'is_cleared',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      dbField: 'notes',
      csvHeader: 'notes',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    'date': '2024-01-15',
    'module': 'material',
    'category_id': 'Cement',
    'amount': '15000',
    'description': '50 bags cement purchase',
    'vendor_name': 'Sri Balaji Cement',
    'vendor_contact': '9876543210',
    'payment_mode': 'upi',
    'reference_number': 'TXN123456',
    'is_cleared': 'TRUE',
    'notes': '',
  },
};

/**
 * Labor Payments Configuration
 */
const laborPaymentsConfig: TableConfig = {
  tableName: 'labor_payments',
  displayName: 'Labor Payments',
  description: 'Bulk upload payment records for laborers',
  requiredContext: ['site_id', 'user_id'],
  fields: [
    {
      dbField: 'laborer_id',
      csvHeader: 'laborer_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'laborers',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'payment_for_date',
      csvHeader: 'payment_for_date',
      required: true,
      type: 'date',
    },
    {
      dbField: 'amount',
      csvHeader: 'amount',
      required: true,
      type: 'number',
    },
    {
      dbField: 'payment_date',
      csvHeader: 'payment_date',
      required: false,
      type: 'date',
    },
    {
      dbField: 'payment_mode',
      csvHeader: 'payment_mode',
      required: false,
      type: 'enum',
      enumValues: PAYMENT_MODES,
      defaultValue: 'cash',
    },
    {
      dbField: 'payment_channel',
      csvHeader: 'payment_channel',
      required: false,
      type: 'string',
    },
    {
      dbField: 'reference_number',
      csvHeader: 'reference_number',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    'laborer_id': 'Rajesh Kumar',
    'payment_for_date': '2024-01-15',
    'amount': '850',
    'payment_date': '2024-01-16',
    'payment_mode': 'upi',
    'payment_channel': 'company_direct_online',
    'reference_number': 'TXN789012',
  },
};

/**
 * Laborers (Master Data) Configuration
 */
const laborersConfig: TableConfig = {
  tableName: 'laborers',
  displayName: 'Laborers',
  description: 'Bulk upload new laborer records',
  requiredContext: ['user_id'],
  upsertKey: ['phone'],
  fields: [
    {
      dbField: 'name',
      csvHeader: 'name',
      required: true,
      type: 'string',
    },
    {
      dbField: 'phone',
      csvHeader: 'phone',
      required: false,
      type: 'string',
      validation: /^\d{10}$/,
    },
    {
      dbField: 'category_id',
      csvHeader: 'category_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'labor_categories',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'role_id',
      csvHeader: 'role_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'labor_roles',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'daily_rate',
      csvHeader: 'daily_rate',
      required: false,
      type: 'number',
    },
    {
      dbField: 'employment_type',
      csvHeader: 'employment_type',
      required: false,
      type: 'enum',
      enumValues: EMPLOYMENT_TYPES,
      defaultValue: 'daily_wage',
    },
    {
      dbField: 'team_id',
      csvHeader: 'team_id',
      required: false,
      type: 'uuid_lookup',
      lookupTable: 'teams',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'address',
      csvHeader: 'address',
      required: false,
      type: 'string',
    },
    {
      dbField: 'emergency_contact_name',
      csvHeader: 'emergency_contact_name',
      required: false,
      type: 'string',
    },
    {
      dbField: 'emergency_contact_phone',
      csvHeader: 'emergency_contact_phone',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    'name': 'Rajesh Kumar',
    'phone': '9876543210',
    'category_id': 'Skilled',
    'role_id': 'Mason',
    'daily_rate': '850',
    'employment_type': 'daily_wage',
    'team_id': 'Mason Team',
    'address': 'Village XYZ, District ABC',
    'emergency_contact_name': 'Suresh Kumar',
    'emergency_contact_phone': '9876543211',
  },
};

/**
 * Advances Configuration
 */
const advancesConfig: TableConfig = {
  tableName: 'advances',
  displayName: 'Advances',
  description: 'Bulk upload advance payments given to laborers',
  requiredContext: ['user_id'],
  fields: [
    {
      dbField: 'laborer_id',
      csvHeader: 'laborer_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'laborers',
      lookupField: 'name',
      lookupDisplayField: 'name',
    },
    {
      dbField: 'date',
      csvHeader: 'date',
      required: true,
      type: 'date',
    },
    {
      dbField: 'amount',
      csvHeader: 'amount',
      required: true,
      type: 'number',
    },
    {
      dbField: 'reason',
      csvHeader: 'reason',
      required: false,
      type: 'string',
    },
    {
      dbField: 'transaction_type',
      csvHeader: 'transaction_type',
      required: true,
      type: 'enum',
      enumValues: TRANSACTION_TYPES,
      defaultValue: 'advance',
    },
    {
      dbField: 'payment_mode',
      csvHeader: 'payment_mode',
      required: false,
      type: 'enum',
      enumValues: PAYMENT_MODES,
      defaultValue: 'cash',
    },
    {
      dbField: 'reference_number',
      csvHeader: 'reference_number',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    'laborer_id': 'Rajesh Kumar',
    'date': '2024-01-15',
    'amount': '5000',
    'reason': 'Medical emergency',
    'transaction_type': 'advance',
    'payment_mode': 'cash',
    'reference_number': '',
  },
};

/**
 * Tea Shop Entries Configuration
 */
const teaShopEntriesConfig: TableConfig = {
  tableName: 'tea_shop_entries',
  displayName: 'Tea Shop Entries',
  description: 'Bulk upload tea shop expense records',
  requiredContext: ['site_id', 'user_id'],
  fields: [
    {
      dbField: 'tea_shop_id',
      csvHeader: 'tea_shop_id',
      required: true,
      type: 'uuid_lookup',
      lookupTable: 'tea_shop_accounts',
      lookupField: 'shop_name',
      lookupDisplayField: 'shop_name',
    },
    {
      dbField: 'date',
      csvHeader: 'date',
      required: true,
      type: 'date',
    },
    {
      dbField: 'amount',
      csvHeader: 'amount',
      required: true,
      type: 'number',
    },
    {
      dbField: 'headcount',
      csvHeader: 'headcount',
      required: false,
      type: 'number',
    },
    {
      dbField: 'notes',
      csvHeader: 'notes',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    'tea_shop_id': 'Chai Wala',
    'date': '2024-01-15',
    'amount': '500',
    'headcount': '10',
    'notes': 'Morning tea',
  },
};

/**
 * Legacy Miscellaneous Expenses Configuration
 *
 * The historical "money-out" ledger for the pre-app (Legacy band) period. Imports
 * land in misc_expenses (company_direct, cleared) and surface in both the
 * Miscellaneous page and All-Site Expenses. The whole upload is revocable as a
 * unit (see import_batches). category + subcontract are OPTIONAL lookups — an
 * unmatched name is a WARNING, not a blocker (the row imports with a null link).
 */
const legacyMiscExpensesConfig: TableConfig = {
  tableName: 'legacy_misc_expenses',
  displayName: 'Legacy Expenses (Bulk)',
  description:
    'Bulk import historical expenses for the legacy period (material, labor settlements, rentals, tea & snacks, subcontract payments). Revocable as a batch.',
  requiredContext: ['site_id', 'user_id'],
  fields: [
    {
      dbField: 'date',
      csvHeader: 'date',
      required: true,
      type: 'date',
      description: 'Expense date (YYYY-MM-DD). Legacy = before the site cutoff.',
    },
    {
      dbField: 'amount',
      csvHeader: 'amount',
      required: true,
      type: 'number',
      description: 'Amount spent (₹).',
    },
    {
      dbField: 'category_id',
      csvHeader: 'category',
      required: false,
      type: 'uuid_lookup',
      lookupTable: 'expense_categories',
      lookupField: 'name',
      lookupDisplayField: 'category',
      description:
        'One of: Daily Labor Settlement, Contract Labor Settlement, Material Settlement, Material Purchasing, Rental Settlement, Tea & Snacks Settlement, General Expense.',
    },
    {
      dbField: 'subcontract_id',
      csvHeader: 'subcontract',
      required: false,
      type: 'uuid_lookup',
      lookupTable: 'subcontracts',
      lookupField: 'title',
      lookupDisplayField: 'subcontract',
      description: 'Exact subcontract title to link this expense to (optional).',
    },
    {
      dbField: 'vendor_name',
      csvHeader: 'vendor_name',
      required: false,
      type: 'string',
    },
    {
      dbField: 'description',
      csvHeader: 'description',
      required: false,
      type: 'string',
    },
    {
      dbField: 'payment_mode',
      csvHeader: 'payment_mode',
      required: false,
      type: 'enum',
      enumValues: MISC_PAYMENT_MODES,
      defaultValue: 'cash',
    },
    {
      dbField: 'payer_source',
      csvHeader: 'payer_source',
      required: false,
      type: 'enum',
      enumValues: PAYER_SOURCES,
    },
    {
      dbField: 'payer_name',
      csvHeader: 'payer_name',
      required: false,
      type: 'string',
      description: 'Free-text payer name (used when payer_source is custom/other site).',
    },
    {
      dbField: 'notes',
      csvHeader: 'notes',
      required: false,
      type: 'string',
    },
  ],
  exampleRow: {
    date: '2024-03-12',
    amount: '15000',
    category: 'Material Settlement',
    subcontract: 'Ground Floor Construction',
    vendor_name: 'Sri Balaji Cement',
    description: '50 bags cement',
    payment_mode: 'cash',
    payer_source: 'own_money',
    payer_name: '',
    notes: 'Legacy paper record',
  },
};

/**
 * All table configurations indexed by table name
 */
export const TABLE_CONFIGS: Record<MassUploadTableName, TableConfig> = {
  legacy_misc_expenses: legacyMiscExpensesConfig,
  daily_attendance: dailyAttendanceConfig,
  market_laborer_attendance: marketLaborerAttendanceConfig,
  expenses: expensesConfig,
  labor_payments: laborPaymentsConfig,
  laborers: laborersConfig,
  advances: advancesConfig,
  tea_shop_entries: teaShopEntriesConfig,
  // Placeholders for future tables
  subcontracts: {
    tableName: 'subcontracts',
    displayName: 'Subcontracts',
    description: 'Bulk upload contract records (coming soon)',
    requiredContext: ['site_id', 'user_id'],
    fields: [],
  },
  subcontract_payments: {
    tableName: 'subcontract_payments',
    displayName: 'Subcontract Payments',
    description: 'Bulk upload contract payment records (coming soon)',
    requiredContext: ['site_id', 'user_id'],
    fields: [],
  },
};

/**
 * Get table configuration by name
 */
export function getTableConfig(tableName: MassUploadTableName): TableConfig | null {
  return TABLE_CONFIGS[tableName] || null;
}

/**
 * Get list of tables available for mass upload (those with fields configured)
 */
export function getAvailableTables(): TableConfig[] {
  return Object.values(TABLE_CONFIGS).filter(config => config.fields.length > 0);
}

/**
 * Get CSV headers for a table
 */
export function getCSVHeaders(tableName: MassUploadTableName): string[] {
  const config = TABLE_CONFIGS[tableName];
  if (!config) return [];
  return config.fields.map(field => field.csvHeader);
}

/**
 * Get field config by CSV header
 */
export function getFieldByCSVHeader(
  tableName: MassUploadTableName,
  csvHeader: string
): FieldConfig | undefined {
  const config = TABLE_CONFIGS[tableName];
  if (!config) return undefined;
  return config.fields.find(field =>
    field.csvHeader.toLowerCase() === csvHeader.toLowerCase()
  );
}

/**
 * Get field config by DB field name
 */
export function getFieldByDBField(
  tableName: MassUploadTableName,
  dbField: string
): FieldConfig | undefined {
  const config = TABLE_CONFIGS[tableName];
  if (!config) return undefined;
  return config.fields.find(field => field.dbField === dbField);
}

/**
 * Generate sample rows for a table based on example row
 */
export function generateTableSampleRows(
  tableName: MassUploadTableName,
  numRows: number = 2
): Record<string, string>[] {
  const config = TABLE_CONFIGS[tableName];
  if (!config || !config.exampleRow) return [];

  const rows: Record<string, string>[] = [];

  for (let i = 0; i < numRows; i++) {
    const row: Record<string, string> = {};
    for (const field of config.fields) {
      const exampleValue = config.exampleRow[field.csvHeader] || '';
      // Modify values slightly for second row
      if (i === 1 && exampleValue) {
        if (field.type === 'number') {
          const num = parseFloat(exampleValue);
          row[field.csvHeader] = isNaN(num) ? exampleValue : String(num * 1.2);
        } else if (field.type === 'date') {
          // Add one day
          const date = new Date(exampleValue);
          date.setDate(date.getDate() + 1);
          row[field.csvHeader] = date.toISOString().split('T')[0];
        } else if (field.csvHeader.includes('name') || field.csvHeader.includes('id')) {
          row[field.csvHeader] = exampleValue.replace(/Kumar|Team|A/g, (m) =>
            m === 'Kumar' ? 'Singh' : m === 'Team' ? 'Group' : 'B'
          );
        } else {
          row[field.csvHeader] = exampleValue;
        }
      } else {
        row[field.csvHeader] = exampleValue;
      }
    }
    rows.push(row);
  }

  return rows;
}
