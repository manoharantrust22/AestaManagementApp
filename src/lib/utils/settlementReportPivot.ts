import type {
  SettlementReportRow,
  WidePivot,
  WidePivotCell,
  WidePivotRow,
} from "@/types/settlementReport.types";

const emptyCell = (): WidePivotCell => ({ paid: 0, calc: 0, hasDiff: false });

// A cell is a meaningful "mismatch" only when both paid and calc are populated.
// calc=0 means "no system-calculated value" (older contracts without per-day
// attendance), paid=0 means "no settlement yet". Neither is a mismatch.
const computeDiff = (paid: number, calc: number): boolean =>
  paid > 0 && calc > 0 && Math.abs(paid - calc) > 0.005;

export function pivotToWide(rows: SettlementReportRow[]): WidePivot {
  if (rows.length === 0) {
    return {
      sites: [],
      rows: [],
      totalsRow: {
        week_start: "",
        week_end: "",
        bySite: {},
        totalPaid: 0,
        totalCalc: 0,
      },
    };
  }

  // Collect unique sites and weeks
  const siteMap = new Map<string, string>(); // id → name
  const weekKeys = new Set<string>();
  const weekMeta = new Map<string, { week_start: string; week_end: string }>();
  for (const r of rows) {
    siteMap.set(r.site_id, r.site_name);
    weekKeys.add(r.week_start);
    if (!weekMeta.has(r.week_start)) {
      weekMeta.set(r.week_start, { week_start: r.week_start, week_end: r.week_end });
    }
  }

  const sites = Array.from(siteMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const weeks = Array.from(weekKeys).sort();

  // Build per-week pivot rows
  const pivotRows: WidePivotRow[] = weeks.map((weekStart) => {
    const meta = weekMeta.get(weekStart)!;
    const bySite: Record<string, WidePivotCell> = {};
    for (const s of sites) bySite[s.id] = emptyCell();
    return {
      week_start: meta.week_start,
      week_end: meta.week_end,
      bySite,
      totalPaid: 0,
      totalCalc: 0,
    };
  });

  const rowIndex = new Map<string, WidePivotRow>();
  pivotRows.forEach((row) => rowIndex.set(row.week_start, row));

  // Sum amounts into the pivot
  for (const r of rows) {
    const pivot = rowIndex.get(r.week_start);
    if (!pivot) continue;
    const cell = pivot.bySite[r.site_id];
    cell.paid += Number(r.paid_amount) || 0;
    cell.calc += Number(r.calc_amount) || 0;
  }

  // Finalize diff + week totals
  for (const row of pivotRows) {
    let totalPaid = 0;
    let totalCalc = 0;
    for (const s of sites) {
      const cell = row.bySite[s.id];
      cell.hasDiff = computeDiff(cell.paid, cell.calc);
      totalPaid += cell.paid;
      totalCalc += cell.calc;
    }
    row.totalPaid = totalPaid;
    row.totalCalc = totalCalc;
  }

  // Totals row
  const totalsBySite: Record<string, WidePivotCell> = {};
  let grandPaid = 0;
  let grandCalc = 0;
  for (const s of sites) {
    let p = 0;
    let c = 0;
    for (const row of pivotRows) {
      p += row.bySite[s.id].paid;
      c += row.bySite[s.id].calc;
    }
    totalsBySite[s.id] = {
      paid: p,
      calc: c,
      hasDiff: computeDiff(p, c),
    };
    grandPaid += p;
    grandCalc += c;
  }

  return {
    sites,
    rows: pivotRows,
    totalsRow: {
      week_start: "",
      week_end: "",
      bySite: totalsBySite,
      totalPaid: grandPaid,
      totalCalc: grandCalc,
    },
  };
}
