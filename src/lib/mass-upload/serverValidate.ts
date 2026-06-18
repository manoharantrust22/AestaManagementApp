/**
 * Shared server-side validation for mass upload.
 *
 * Used by BOTH the /validate route (preview) and the /import route (re-validate
 * before commit, so a tampered client payload can never bypass the preview gate).
 *
 * For legacy_misc_expenses it adds: a site-scoped subcontracts lookup, a
 * miscellaneous-scoped category lookup, "unmatched optional lookup -> warning"
 * (warn but allow), a "date on/after the site cutoff -> warning", and the computed
 * financial summary (summarizeLegacyExpenseBatch).
 */

import { createClient } from "@/lib/supabase/server";
import {
  MassUploadTableName,
  ParsedRow,
  ValidationError,
  LookupCache,
  LegacyExpenseSummary,
} from "@/types/mass-upload.types";
import { getTableConfig } from "./tableConfigs";
import { validateField } from "./validators";
import {
  summarizeLegacyExpenseBatch,
  LegacyExpenseRowInput,
} from "./legacyExpenseSummary";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const LEGACY_TABLE: MassUploadTableName = "legacy_misc_expenses";

export interface ServerValidateResult {
  parsedRows: ParsedRow[];
  lookupErrors: ValidationError[];
  summary: { total: number; valid: number; warnings: number; errors: number };
  legacySummary?: LegacyExpenseSummary;
  cutoffDate: string | null;
}

/**
 * Build the lookup cache for resolving names -> UUIDs.
 */
export async function buildLookupCache(
  supabase: ServerClient,
  siteId: string,
  tableName: MassUploadTableName
): Promise<LookupCache> {
  const cache: LookupCache = {
    laborers: new Map(),
    categories: new Map(),
    roles: new Map(),
    sections: new Map(),
    teams: new Map(),
    teaShops: new Map(),
    expenseCategories: new Map(),
    subcontracts: new Map(),
    payerSources: new Map(),
    payerSourceLabels: [],
  };

  const isLegacy = tableName === LEGACY_TABLE;

  if (isLegacy) {
    // Legacy import needs: subcontracts (by title), miscellaneous categories, and the
    // SITE's configured payer sources (so payer_source is restricted per-site, not to
    // the global enum). Mirrors assertPayerSourcesAllowed in engineerWalletV2.ts.
    // payer_sources isn't in the generated Database types -> cast the query builder.
    const { data: payerSrcs } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => Promise<{ data: { key: string; label: string }[] | null }>;
          };
        };
      };
    })
      .from("payer_sources")
      .select("key, label")
      .eq("site_id", siteId)
      .eq("is_hidden", false);

    if (payerSrcs) {
      (payerSrcs as { key: string; label: string }[]).forEach((p) => {
        if (!p.key) return;
        // Accept either the human label ("Trust Account") or the raw key ("trust_account").
        cache.payerSources.set(p.key.toLowerCase(), p.key);
        if (p.label) {
          cache.payerSources.set(p.label.toLowerCase(), p.key);
          cache.payerSourceLabels.push(p.label);
        }
      });
    }

    const { data: subs } = await supabase
      .from("subcontracts")
      .select("id, title, total_value")
      .eq("site_id", siteId);

    if (subs) {
      const ambiguous = new Set<string>();
      subs.forEach((s) => {
        if (!s.title) return;
        const key = s.title.toLowerCase();
        if (cache.subcontracts.has(key)) {
          ambiguous.add(key); // duplicate title -> treat as unmatched (warning)
        } else {
          cache.subcontracts.set(key, {
            id: s.id,
            title: s.title,
            total_value: s.total_value,
          });
        }
      });
      ambiguous.forEach((key) => cache.subcontracts.delete(key));
    }

    const { data: miscCats } = await supabase
      .from("expense_categories")
      .select("id, name")
      .eq("module", "miscellaneous")
      .eq("is_active", true);

    if (miscCats) {
      miscCats.forEach((c) => {
        if (c.name) cache.expenseCategories.set(c.name.toLowerCase(), { id: c.id, name: c.name });
      });
    }

    return cache;
  }

  // --- Generic cache (unchanged behaviour for the existing 7 tables) ---
  const { data: laborers } = await supabase
    .from("laborers")
    .select("id, name, phone")
    .eq("status", "active");
  laborers?.forEach((l) => {
    if (l.name) cache.laborers.set(l.name.toLowerCase(), { id: l.id, name: l.name, phone: l.phone });
    if (l.phone) cache.laborers.set(l.phone, { id: l.id, name: l.name, phone: l.phone });
  });

  const { data: categories } = await supabase
    .from("labor_categories")
    .select("id, name")
    .eq("is_active", true);
  categories?.forEach((c) => {
    if (c.name) cache.categories.set(c.name.toLowerCase(), { id: c.id, name: c.name });
  });

  const { data: roles } = await supabase
    .from("labor_roles")
    .select("id, name")
    .eq("is_active", true);
  roles?.forEach((r) => {
    if (r.name) cache.roles.set(r.name.toLowerCase(), { id: r.id, name: r.name });
  });

  const { data: sections } = await supabase
    .from("building_sections")
    .select("id, name")
    .eq("site_id", siteId);
  sections?.forEach((s) => {
    if (s.name) cache.sections.set(s.name.toLowerCase(), { id: s.id, name: s.name });
  });

  const { data: teams } = await supabase.from("teams").select("id, name").eq("status", "active");
  teams?.forEach((t) => {
    if (t.name) cache.teams.set(t.name.toLowerCase(), { id: t.id, name: t.name });
  });

  const { data: teaShops } = await supabase
    .from("tea_shop_accounts")
    .select("id, shop_name")
    .eq("site_id", siteId)
    .eq("is_active", true);
  teaShops?.forEach((ts) => {
    if (ts.shop_name) cache.teaShops.set(ts.shop_name.toLowerCase(), { id: ts.id, name: ts.shop_name });
  });

  const { data: expenseCategories } = await supabase
    .from("expense_categories")
    .select("id, name")
    .eq("is_active", true);
  expenseCategories?.forEach((ec) => {
    if (ec.name) cache.expenseCategories.set(ec.name.toLowerCase(), { id: ec.id, name: ec.name });
  });

  return cache;
}

function findSimilar(value: string, cache: Map<string, { name: string }>): string | undefined {
  for (const [key, entry] of cache.entries()) {
    if (key.includes(value) || value.includes(key)) return entry.name;
  }
  return undefined;
}

/**
 * Resolve a lookup field value to a UUID.
 */
export function resolveLookup(
  value: string,
  lookupTable: string,
  cache: LookupCache
): { id: string | null; suggestion?: string } {
  if (!value) return { id: null };
  const lowerValue = value.toLowerCase();

  switch (lookupTable) {
    case "laborers": {
      const laborer = cache.laborers.get(lowerValue);
      if (laborer) return { id: laborer.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.laborers) };
    }
    case "labor_categories": {
      const category = cache.categories.get(lowerValue);
      if (category) return { id: category.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.categories) };
    }
    case "labor_roles": {
      const role = cache.roles.get(lowerValue);
      if (role) return { id: role.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.roles) };
    }
    case "building_sections": {
      const section = cache.sections.get(lowerValue);
      if (section) return { id: section.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.sections) };
    }
    case "teams": {
      const team = cache.teams.get(lowerValue);
      if (team) return { id: team.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.teams) };
    }
    case "tea_shop_accounts": {
      const teaShop = cache.teaShops.get(lowerValue);
      if (teaShop) return { id: teaShop.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.teaShops) };
    }
    case "expense_categories": {
      const expCat = cache.expenseCategories.get(lowerValue);
      if (expCat) return { id: expCat.id };
      return { id: null, suggestion: findSimilar(lowerValue, cache.expenseCategories) };
    }
    case "subcontracts": {
      const sub = cache.subcontracts.get(lowerValue);
      if (sub) return { id: sub.id };
      const suggestion = (() => {
        for (const [key, entry] of cache.subcontracts.entries()) {
          if (key.includes(lowerValue) || lowerValue.includes(key)) return entry.title;
        }
        return undefined;
      })();
      return { id: null, suggestion };
    }
    default:
      return { id: null };
  }
}

/**
 * Validate + resolve every row server-side.
 */
export async function validateRowsServerSide(
  supabase: ServerClient,
  tableName: MassUploadTableName,
  siteId: string,
  rows: Record<string, string>[],
  requiredFields: string[] = []
): Promise<ServerValidateResult> {
  const config = getTableConfig(tableName);
  if (!config || config.fields.length === 0) {
    throw new Error(`No configuration found for table: ${tableName}`);
  }

  const isLegacy = tableName === LEGACY_TABLE;
  // Normally-optional fields the user chose to require for this import.
  const extraRequired = new Set(requiredFields);
  const cache = await buildLookupCache(supabase, siteId, tableName);

  // Site cutoff for the "date on/after cutoff" warning.
  let cutoffDate: string | null = null;
  if (isLegacy && siteId) {
    const { data: site } = await supabase
      .from("sites")
      .select("data_started_at")
      .eq("id", siteId)
      .single();
    cutoffDate = (site as { data_started_at: string | null } | null)?.data_started_at ?? null;
  }

  const parsedRows: ParsedRow[] = [];
  const lookupErrors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const transformedData: Record<string, unknown> = {};

    config.fields.forEach((fieldConfig) => {
      const csvValue = row[fieldConfig.csvHeader];
      const trimmedValue = csvValue?.trim() || "";

      // A field is required if the config marks it so OR the user toggled it required
      // for this import. When overridden, clone the config so validateField (which
      // reads .required) emits the blank-required error.
      const isRequired = fieldConfig.required || extraRequired.has(fieldConfig.dbField);
      const effectiveConfig =
        isRequired === fieldConfig.required ? fieldConfig : { ...fieldConfig, required: true };

      const clientValidation = validateField(trimmedValue, effectiveConfig, rowNumber);
      if (clientValidation.error) errors.push(clientValidation.error);
      if (clientValidation.warning) warnings.push(clientValidation.warning);

      // payer_source: restrict to the SELECTED SITE's configured sources (by label or key).
      if (fieldConfig.siteScopedSource) {
        if (trimmedValue) {
          if (cache.payerSources.size === 0) {
            // Site has no configured sources (unseeded/legacy) — mirror
            // assertPayerSourcesAllowed and don't block.
            transformedData[fieldConfig.dbField] = trimmedValue.toLowerCase();
          } else {
            const key = cache.payerSources.get(trimmedValue.toLowerCase());
            if (!key) {
              const allowed = cache.payerSourceLabels.length
                ? ` Allowed for this site: ${cache.payerSourceLabels.join(", ")}.`
                : "";
              errors.push({
                rowNumber,
                field: fieldConfig.dbField,
                csvHeader: fieldConfig.csvHeader,
                value: trimmedValue,
                errorType: "enum",
                message: `"${trimmedValue}" is not a payment source for this site.${allowed}`,
              });
              transformedData[fieldConfig.dbField] = null;
            } else {
              transformedData[fieldConfig.dbField] = key;
            }
          }
        } else {
          transformedData[fieldConfig.dbField] = clientValidation.transformedValue ?? null;
        }
        return; // payer_source handled per-site
      }

      if (fieldConfig.type === "uuid_lookup" && trimmedValue) {
        const lookupResult = resolveLookup(trimmedValue, fieldConfig.lookupTable || "", cache);

        if (!lookupResult.id) {
          const issue: ValidationError = {
            rowNumber,
            field: fieldConfig.dbField,
            csvHeader: fieldConfig.csvHeader,
            value: trimmedValue,
            errorType: "lookup",
            message: `${fieldConfig.lookupDisplayField || fieldConfig.csvHeader} not found: "${trimmedValue}"`,
            suggestion: lookupResult.suggestion ? `Did you mean "${lookupResult.suggestion}"?` : undefined,
          };
          // Unmatched OPTIONAL lookup on the legacy importer -> warn but allow (link
          // stays null) UNLESS the field is strictLookup or required, in which case an
          // unmatched non-blank value is a hard error that blocks the row.
          if (isLegacy && !isRequired && !fieldConfig.strictLookup) {
            issue.message = `${fieldConfig.csvHeader} "${trimmedValue}" not found — importing without this link.`;
            warnings.push(issue);
          } else {
            if (fieldConfig.strictLookup) {
              issue.message = `${fieldConfig.csvHeader} "${trimmedValue}" doesn't match any ${fieldConfig.csvHeader} for this site — fix it or leave it blank.`;
            }
            errors.push(issue);
            lookupErrors.push(issue);
          }
          transformedData[fieldConfig.dbField] = null;
        } else {
          transformedData[fieldConfig.dbField] = lookupResult.id;
        }
      } else {
        transformedData[fieldConfig.dbField] = clientValidation.transformedValue;
      }
    });

    // Legacy: a date on/after the site cutoff isn't "legacy" — warn but allow.
    if (isLegacy && cutoffDate) {
      const d = transformedData["date"];
      if (typeof d === "string" && d >= cutoffDate) {
        warnings.push({
          rowNumber,
          field: "date",
          csvHeader: "date",
          value: d,
          errorType: "constraint",
          message: `Date ${d} is on/after the legacy cutoff (${cutoffDate}) — it will still import.`,
        });
      }
    }

    let status: "valid" | "warning" | "error" = "valid";
    if (errors.length > 0) status = "error";
    else if (warnings.length > 0) status = "warning";

    parsedRows.push({ rowNumber, originalData: row, transformedData, errors, warnings, status });
  });

  const summary = {
    total: parsedRows.length,
    valid: parsedRows.filter((r) => r.status === "valid").length,
    warnings: parsedRows.filter((r) => r.status === "warning").length,
    errors: parsedRows.filter((r) => r.status === "error").length,
  };

  let legacySummary: LegacyExpenseSummary | undefined;
  if (isLegacy) {
    const importable = parsedRows
      .filter((r) => r.status !== "error")
      .map((r) => r.transformedData as unknown as LegacyExpenseRowInput);
    legacySummary = summarizeLegacyExpenseBatch(importable, {
      subcontracts: Array.from(cache.subcontracts.values()),
      categories: Array.from(cache.expenseCategories.values()),
      cutoffDate,
    });
  }

  return { parsedRows, lookupErrors, summary, legacySummary, cutoffDate };
}
