/**
 * Indian-comma + compact-suffix money formatters used across the Material Hub.
 *
 * The codebase already has `formatCurrency` in src/lib/formatters.ts, but its
 * shape (`₹6.41L`) is the "compact" variant. The Hub layout uses both:
 *   - `inr(n)`  → full Indian comma format ("₹1,68,675") for amounts
 *   - `inrK(n)` → compact for KPI tiles ("₹6.41L", "₹86.4k")
 *   - `pct(n, total)` → "67%" style percentage
 */

export function inrInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(Math.round(n)).toString();
  if (x.length <= 3) return sign + x;
  const last3 = x.slice(-3);
  const rest = x.slice(0, -3);
  return sign + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function inr(n: number | null | undefined): string {
  return "₹" + inrInt(n);
}

/** Compact: ₹6.41L, ₹86.4k, ₹930.7k */
export function inrK(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "₹0";
  const a = Math.abs(n);
  if (a >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + "Cr";
  if (a >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.?0+$/, "") + "L";
  if (a >= 1e3) return "₹" + (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return "₹" + Math.round(n);
}

export function pct(n: number, total: number): string {
  if (!total) return "0%";
  return Math.round((n / total) * 100) + "%";
}

/** Short scannable date: "14 May" */
export function fmtDateShort(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}