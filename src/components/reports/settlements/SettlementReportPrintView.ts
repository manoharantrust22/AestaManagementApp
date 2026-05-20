import type { SettlementReportRow } from "@/types/settlementReport.types";
import { pivotToWide } from "@/lib/utils/settlementReportPivot";

const fmt = (n: number) =>
  n === 0 ? "" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );

export interface PrintArgs {
  rows: SettlementReportRow[];
  scopeLabel: string;
  categoryLabel: string;
  dateFrom: string;
  dateTo: string;
}

export function openSettlementReportPrintView(args: PrintArgs): void {
  const { rows, scopeLabel, categoryLabel, dateFrom, dateTo } = args;
  const pivot = pivotToWide(rows);

  const siteHeaderCells = pivot.sites
    .map((s) => `<th colspan="2" style="text-align:center">${escapeHtml(s.name)}</th>`)
    .join("");
  const siteSubHeaderCells = pivot.sites
    .map(() => `<th style="text-align:right">Paid</th><th style="text-align:right">Calc</th>`)
    .join("");

  const bodyRows = pivot.rows.map((r) => {
    const siteCells = pivot.sites.map((s) => {
      const cell = r.bySite[s.id];
      const warnStyle = cell.hasDiff ? ' style="background:#fff3e0;text-align:right"' : ' style="text-align:right"';
      return `<td style="text-align:right">${fmt(cell.paid)}</td><td${warnStyle}>${fmt(cell.calc)}</td>`;
    }).join("");
    return `<tr>
      <td>${r.week_start} → ${r.week_end}</td>
      ${siteCells}
      <td style="text-align:right"><strong>${fmt(r.totalPaid)}</strong></td>
      <td style="text-align:right"><strong>${fmt(r.totalCalc)}</strong></td>
    </tr>`;
  }).join("");

  const totalsCells = pivot.sites.map((s) => {
    const cell = pivot.totalsRow.bySite[s.id];
    return `<td style="text-align:right"><strong>${fmt(cell.paid)}</strong></td><td style="text-align:right"><strong>${fmt(cell.calc)}</strong></td>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Settlement Report — ${escapeHtml(scopeLabel)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 1100px; margin: 0 auto; color:#222 }
    h1 { color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 8px; margin: 0 0 10px }
    .meta { font-size: 13px; color: #555; margin-bottom: 16px }
    table { width: 100%; border-collapse: collapse; font-size: 13px }
    th, td { border: 1px solid #ddd; padding: 6px 8px }
    th { background: #f5f5f5; font-weight: 600 }
    tfoot td { border-top: 2px solid #999; background: #fafafa }
    @media print {
      body { padding: 0; max-width: none }
      .no-print { display: none }
    }
  </style>
</head>
<body>
  <h1>Settlement Verification Report</h1>
  <div class="meta">
    <strong>Scope:</strong> ${escapeHtml(scopeLabel)}<br>
    <strong>Trade:</strong> ${escapeHtml(categoryLabel)}<br>
    <strong>Period:</strong> ${dateFrom} → ${dateTo}<br>
    <strong>Generated:</strong> ${new Date().toLocaleString("en-IN")}
  </div>
  ${pivot.rows.length === 0
    ? `<p><em>No settlements found for the selected filters.</em></p>`
    : `<table>
    <thead>
      <tr><th rowspan="2">Week</th>${siteHeaderCells}<th colspan="2" style="text-align:center">Total</th></tr>
      <tr>${siteSubHeaderCells}<th style="text-align:right">Paid</th><th style="text-align:right">Calc</th></tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td><strong>Totals</strong></td>
        ${totalsCells}
        <td style="text-align:right"><strong>${fmt(pivot.totalsRow.totalPaid)}</strong></td>
        <td style="text-align:right"><strong>${fmt(pivot.totalsRow.totalCalc)}</strong></td>
      </tr>
    </tfoot>
  </table>`}
  <div class="no-print" style="margin-top:20px;text-align:center">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer">Print / Save as PDF</button>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
