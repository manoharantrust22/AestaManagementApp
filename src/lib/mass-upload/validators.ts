/**
 * Field Validators for Mass Upload
 * Client-side validation for CSV fields
 */

import { FieldConfig, ValidationError } from '@/types/mass-upload.types';

interface ValidationResult {
  transformedValue: unknown;
  error?: ValidationError;
  warning?: ValidationError;
}

/**
 * Validate and transform a single field value
 */
export function validateField(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  const trimmedValue = value?.trim() || '';

  // Check required fields
  if (fieldConfig.required && !trimmedValue) {
    return {
      transformedValue: null,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value: trimmedValue,
        errorType: 'required',
        message: `"${fieldConfig.csvHeader}" is required`,
      },
    };
  }

  // If empty and not required, use default or null
  if (!trimmedValue) {
    return {
      transformedValue: fieldConfig.defaultValue ?? null,
    };
  }

  // payer_source is restricted to the SELECTED SITE's configured sources, resolved
  // server-side (by label or key) — not a static enum. Skip the generic enum check so
  // a human label like "Trust Account" isn't rejected here; serverValidate validates it.
  if (fieldConfig.siteScopedSource) {
    return { transformedValue: trimmedValue };
  }

  // Type-specific validation
  switch (fieldConfig.type) {
    case 'number':
      return validateNumber(trimmedValue, fieldConfig, rowNumber);
    case 'date':
      return validateDate(trimmedValue, fieldConfig, rowNumber);
    case 'time':
      return validateTime(trimmedValue, fieldConfig, rowNumber);
    case 'boolean':
      return validateBoolean(trimmedValue, fieldConfig, rowNumber);
    case 'enum':
      return validateEnum(trimmedValue, fieldConfig, rowNumber);
    case 'uuid_lookup':
      // Lookup validation happens server-side
      return { transformedValue: trimmedValue };
    case 'string':
    default:
      return validateString(trimmedValue, fieldConfig, rowNumber);
  }
}

/**
 * Validate number field
 */
function validateNumber(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  // Remove commas and spaces
  const cleanValue = value.replace(/[,\s]/g, '');
  const parsed = parseFloat(cleanValue);

  if (isNaN(parsed)) {
    return {
      transformedValue: null,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value,
        errorType: 'type',
        message: `"${fieldConfig.csvHeader}" must be a valid number (got "${value}")`,
      },
    };
  }

  return { transformedValue: parsed };
}

/**
 * Validate date field (YYYY-MM-DD)
 */
function validateDate(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  // Try to parse various date formats
  const dateFormats = [
    // ISO format
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // DD/MM/YYYY
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    // DD-MM-YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/,
  ];

  let parsedDate: string | null = null;

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = value.match(dateFormats[0]);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (isValidDate(parseInt(year), parseInt(month), parseInt(day))) {
      parsedDate = `${year}-${month}-${day}`;
    }
  }

  // Try DD/MM/YYYY
  if (!parsedDate) {
    const slashMatch = value.match(dateFormats[1]);
    if (slashMatch) {
      const [, day, month, year] = slashMatch;
      if (isValidDate(parseInt(year), parseInt(month), parseInt(day))) {
        parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  // Try DD-MM-YYYY
  if (!parsedDate) {
    const dashMatch = value.match(dateFormats[2]);
    if (dashMatch) {
      const [, day, month, year] = dashMatch;
      if (isValidDate(parseInt(year), parseInt(month), parseInt(day))) {
        parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  if (!parsedDate) {
    return {
      transformedValue: null,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value,
        errorType: 'format',
        message: `"${fieldConfig.csvHeader}" must be a valid date in YYYY-MM-DD format (got "${value}")`,
        suggestion: 'Use format: 2024-01-15',
      },
    };
  }

  return { transformedValue: parsedDate };
}

/**
 * Check if date values are valid
 */
function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
         date.getMonth() === month - 1 &&
         date.getDate() === day;
}

/**
 * Validate time field (HH:MM)
 */
function validateTime(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  // Accept HH:MM or HH:MM:SS format
  const timeMatch = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!timeMatch) {
    return {
      transformedValue: null,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value,
        errorType: 'format',
        message: `"${fieldConfig.csvHeader}" must be a valid time in HH:MM format (got "${value}")`,
        suggestion: 'Use format: 08:30 or 17:30',
      },
    };
  }

  const [, hourStr, minuteStr, secondStr] = timeMatch;
  const hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);
  const second = secondStr ? parseInt(secondStr) : 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return {
      transformedValue: null,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value,
        errorType: 'format',
        message: `"${fieldConfig.csvHeader}" contains invalid time values (got "${value}")`,
      },
    };
  }

  // Return as HH:MM:SS format
  const formattedTime = `${hourStr.padStart(2, '0')}:${minuteStr}:${secondStr?.padStart(2, '0') || '00'}`;
  return { transformedValue: formattedTime };
}

/**
 * Validate boolean field
 */
function validateBoolean(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  const lowerValue = value.toLowerCase();
  const trueValues = ['true', 'yes', '1', 'y'];
  const falseValues = ['false', 'no', '0', 'n'];

  if (trueValues.includes(lowerValue)) {
    return { transformedValue: true };
  }

  if (falseValues.includes(lowerValue)) {
    return { transformedValue: false };
  }

  return {
    transformedValue: null,
    error: {
      rowNumber,
      field: fieldConfig.dbField,
      csvHeader: fieldConfig.csvHeader,
      value,
      errorType: 'format',
      message: `"${fieldConfig.csvHeader}" must be TRUE or FALSE (got "${value}")`,
    },
  };
}

/**
 * Validate enum field
 */
function validateEnum(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  if (!fieldConfig.enumValues || fieldConfig.enumValues.length === 0) {
    return { transformedValue: value };
  }

  const lowerValue = value.toLowerCase();
  const matchedValue = fieldConfig.enumValues.find(
    ev => ev.toLowerCase() === lowerValue
  );

  if (!matchedValue) {
    return {
      transformedValue: null,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value,
        errorType: 'enum',
        message: `"${fieldConfig.csvHeader}" must be one of: ${fieldConfig.enumValues.join(', ')} (got "${value}")`,
      },
    };
  }

  return { transformedValue: matchedValue };
}

/**
 * Validate string field
 */
function validateString(
  value: string,
  fieldConfig: FieldConfig,
  rowNumber: number
): ValidationResult {
  // Check regex validation if provided
  if (fieldConfig.validation && !fieldConfig.validation.test(value)) {
    return {
      transformedValue: value,
      error: {
        rowNumber,
        field: fieldConfig.dbField,
        csvHeader: fieldConfig.csvHeader,
        value,
        errorType: 'format',
        message: `"${fieldConfig.csvHeader}" has invalid format (got "${value}")`,
      },
    };
  }

  return { transformedValue: value };
}

/**
 * Validate multiple rows
 */
export function validateRows(
  rows: Record<string, string>[],
  fieldConfigs: FieldConfig[]
): { validRows: Record<string, unknown>[]; errors: ValidationError[] } {
  const validRows: Record<string, unknown>[] = [];
  const errors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 for header and 1-based indexing
    const transformedRow: Record<string, unknown> = {};
    let hasError = false;

    fieldConfigs.forEach(fieldConfig => {
      const value = row[fieldConfig.csvHeader] || '';
      const result = validateField(value, fieldConfig, rowNumber);

      if (result.error) {
        errors.push(result.error);
        hasError = true;
      }

      transformedRow[fieldConfig.dbField] = result.transformedValue;
    });

    if (!hasError) {
      validRows.push(transformedRow);
    }
  });

  return { validRows, errors };
}
