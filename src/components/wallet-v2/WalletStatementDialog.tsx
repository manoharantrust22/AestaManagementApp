"use client";

/**
 * Wallet Statement — a printable / shareable per-(engineer, site) statement.
 *
 * Renders every active deposit and spend oldest-first with a running balance, so
 * the final balance equals the card's Held. Built for reconciling with a site
 * engineer: the on-screen table doubles as a tick-off sheet, "Copy for WhatsApp"
 * produces a plain-text version to forward, and "Print / PDF" opens a clean sheet.
 *
 * No new schema — reads the same site_engineer_transactions rows (cancelled_at IS
 * NULL) the rest of the wallet uses, via useWalletStatement.
 */

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Close,
  ContentCopy,
  Check,
  Print,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import { useWalletStatement } from "@/hooks/queries/useEngineerWalletV2";
import { classifySpend, parseMiscReference, prettyPayerSource } from "./spendDetailHelpers";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

interface WalletStatementDialogProps {
  open: boolean;
  onClose: () => void;
  engineerId: string;
  engineerName: string;
  siteId: string;
  siteName: string;
}

/** Short human "particulars" label for a ledger row. */
function particulars(row: WalletLedgerEntry): string {
  const d = (row.description ?? "").trim();
  if (row.transaction_type === "deposit") return d || (row.notes ?? "").trim() || "Deposit";
  if (row.transaction_type === "return") return d || "Return to office";

  const kind = classifySpend(d);
  if (kind === "salary") {
    const ref = d.match(/SET-\d{6}-\d+/)?.[0];
    return ref ? `Salary — ${ref}` : "Salary settlement";
  }
  if (kind === "contract") return d.replace(/\s*\(SET-.*\)\s*$/, "").trim() || "Contract payment";
  if (kind === "taskwork") {
    const title = d.split(" - ").slice(1).join(" - ").trim();
    return title ? `Task work — ${title}` : "Task work payment";
  }
  if (kind === "misc") {
    const after = d.split(" - ").slice(1).join(" - ").trim();
    const ref = parseMiscReference(d);
    return after ? `Misc — ${after}` : ref ? `Misc — ${ref}` : "Misc expense";
  }
  return d || "Spend";
}

/** Bucket a spend for the by-type summary. */
function spendBucket(d: string | null): string {
  const k = classifySpend(d);
  if (k === "salary" || k === "contract") return "Salary / contract";
  if (k === "taskwork") return "Task work";
  if (k === "misc") return "Misc";
  if (/^Group stock/i.test(d ?? "")) return "Group stock (cement)";
  if (/^Material payment/i.test(d ?? "")) return "Material";
  if (/^Rental settlement/i.test(d ?? "")) return "Rental";
  return "Other";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function WalletStatementDialog({
  open,
  onClose,
  engineerId,
  engineerName,
  siteId,
  siteName,
}: WalletStatementDialogProps) {
  const { data, isLoading, isError, error } = useWalletStatement(engineerId, siteId, open);
  const rows = useMemo(() => data ?? [], [data]);
  const [copied, setCopied] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const today = dayjs().format("D MMM YYYY");

  // Running balance + totals. Final balance == Held (deposits − spends − returns).
  const { lines, deposited, spent, returned, held } = useMemo(() => {
    let bal = 0;
    let dep = 0;
    let sp = 0;
    let ret = 0;
    const ls = rows.map((r, i) => {
      const amt = Number(r.amount);
      if (r.transaction_type === "deposit") {
        bal += amt;
        dep += amt;
      } else if (r.transaction_type === "return") {
        bal -= amt;
        ret += amt;
      } else {
        bal -= amt;
        sp += amt;
      }
      return { row: r, idx: i + 1, balance: bal };
    });
    return { lines: ls, deposited: dep, spent: sp, returned: ret, held: dep - sp - ret };
  }, [rows]);

  const spendSummary = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    for (const r of rows) {
      if (r.transaction_type !== "spend") continue;
      const b = spendBucket(r.description);
      const cur = m.get(b) ?? { n: 0, total: 0 };
      cur.n += 1;
      cur.total += Number(r.amount);
      m.set(b, cur);
    }
    return [...m.entries()]
      .map(([bucket, v]) => ({ bucket, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const depositCount = lines.filter((l) => l.row.transaction_type === "deposit").length;
  const spendCount = lines.filter((l) => l.row.transaction_type === "spend").length;

  const buildText = (): string => {
    const L: string[] = [];
    L.push(`WALLET STATEMENT — ${siteName}`);
    L.push(`Engineer: ${engineerName}`);
    L.push(`As on ${today}`);
    L.push("");
    L.push(`Deposited : ₹${fmt(deposited)}  (${depositCount})`);
    L.push(`Spent     : ₹${fmt(spent)}  (${spendCount})`);
    if (returned > 0) L.push(`Returned  : ₹${fmt(returned)}`);
    L.push(`HELD now  : ₹${fmt(held)}`);
    L.push("");
    L.push("All entries (oldest first):");
    for (const ln of lines) {
      const r = ln.row;
      const date = dayjs(r.transaction_date).format("DD MMM");
      if (r.transaction_type === "deposit") {
        const src = prettyPayerSource(r.payer_source ?? "", r.payer_name);
        L.push(`${ln.idx}. ${date}  +₹${fmt(r.amount)} [${src}]  ${particulars(r)}  = ₹${fmt(ln.balance)}`);
      } else {
        L.push(`${ln.idx}. ${date}  −₹${fmt(r.amount)}  ${particulars(r)}  = ₹${fmt(ln.balance)}`);
      }
    }
    return L.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (rare) — fall back to print which the user can copy from.
      handlePrint();
    }
  };

  const handlePrint = () => {
    const rowsHtml = lines
      .map((ln) => {
        const r = ln.row;
        const date = dayjs(r.transaction_date).format("DD MMM YY");
        const isDep = r.transaction_type === "deposit";
        const src = isDep ? prettyPayerSource(r.payer_source ?? "", r.payer_name) : "";
        const part =
          escapeHtml(particulars(r)) +
          (src ? ` <span class="src">(${escapeHtml(src)})</span>` : "");
        const inCol = isDep ? `₹${fmt(r.amount)}` : "";
        const outCol = !isDep ? `₹${fmt(r.amount)}` : "";
        const balCls = ln.balance < 0 ? "bal neg" : "bal";
        return `<tr><td class="idx">${ln.idx}</td><td class="date">${date}</td><td>${part}</td><td class="r in">${inCol}</td><td class="r out">${outCol}</td><td class="r ${balCls}">₹${fmt(
          ln.balance
        )}</td><td class="tick"></td></tr>`;
      })
      .join("");

    const summaryHtml = spendSummary
      .map((s) => `<tr><td>${escapeHtml(s.bucket)}</td><td class="c">${s.n}</td><td class="r">₹${fmt(s.total)}</td></tr>`)
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>Wallet Statement — ${escapeHtml(siteName)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1a1a1a;
    margin: 22px; font-size: 11px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head {
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 24px; border-bottom: 2px solid #0a6b2e; padding-bottom: 9px; margin-bottom: 14px;
  }
  h1 { font-size: 16px; margin: 0 0 3px; letter-spacing: .2px; }
  .sub { color: #555; font-size: 11px; }
  .totals { display: flex; gap: 22px; text-align: right; white-space: nowrap; }
  .totals div { font-size: 9px; color: #8a8a8a; text-transform: uppercase; letter-spacing: .4px; }
  .totals b { display: block; font-size: 15px; color: #1a1a1a; text-transform: none; letter-spacing: 0; margin-top: 1px; }
  .totals span { display: block; font-size: 8.5px; color: #aaa; text-transform: none; }
  .totals .held b { color: #0a6b2e; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
  th, td { border: 1px solid #dcdcdc; padding: 3px 6px; vertical-align: top; overflow-wrap: break-word; word-break: break-word; }
  thead th {
    background: #0a6b2e; color: #fff; text-align: left; font-weight: 600;
    font-size: 10px; text-transform: uppercase; letter-spacing: .3px; border-color: #0a6b2e;
  }
  tbody tr:nth-child(even) { background: #f6f8f6; }
  td.r, th.r { text-align: right; }
  td.c, th.c { text-align: center; }
  td.r { font-variant-numeric: tabular-nums; }
  td.idx { color: #aaa; text-align: center; }
  td.date { white-space: nowrap; color: #444; }
  td.in { color: #0a6b2e; }
  td.out { color: #b00020; }
  td.bal { font-weight: 700; }
  td.bal.neg { color: #b00020; }
  .src { color: #999; font-weight: 400; }
  h2 { font-size: 11px; margin: 16px 0 5px; text-transform: uppercase; letter-spacing: .4px; color: #555; }
  .note { font-size: 9.5px; color: #888; margin-top: 12px; border-top: 1px solid #eee; padding-top: 6px; }
  .sumtable { width: 320px; }
  @media print {
    body { margin: 10mm 8mm; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style></head><body>
  <div class="head">
    <div>
      <h1>Wallet Statement — ${escapeHtml(siteName)}</h1>
      <div class="sub">Engineer: ${escapeHtml(engineerName)} &nbsp;·&nbsp; As on ${today}</div>
    </div>
    <div class="totals">
      <div>Deposited<b>₹${fmt(deposited)}</b><span>${depositCount} entries</span></div>
      <div>Spent<b>₹${fmt(spent)}</b><span>${spendCount} entries</span></div>
      ${returned > 0 ? `<div>Returned<b>₹${fmt(returned)}</b></div>` : ""}
      <div class="held">Held now<b>₹${fmt(held)}</b></div>
    </div>
  </div>
  <table>
    <colgroup>
      <col style="width:26px" />
      <col style="width:68px" />
      <col />
      <col style="width:62px" />
      <col style="width:62px" />
      <col style="width:74px" />
      <col style="width:28px" />
    </colgroup>
    <thead><tr><th class="c">#</th><th>Date</th><th>Particulars</th><th class="r">In</th><th class="r">Out</th><th class="r">Balance</th><th class="c">✓</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${
    summaryHtml
      ? `<h2>Spends by type</h2><table class="sumtable"><colgroup><col /><col style="width:38px" /><col style="width:84px" /></colgroup><thead><tr><th>Type</th><th class="c">#</th><th class="r">Total</th></tr></thead><tbody>${summaryHtml}</tbody></table>`
      : ""
  }
  <div class="note">Cancelled / duplicate entries are excluded. Balance is cumulative — the last row equals the current Held amount.</div>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile}>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Wallet Statement
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {siteName} · {engineerName} · as on {today}
            </Typography>
          </Box>
        </Stack>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: "absolute", top: 8, right: 8 }}
          aria-label="Close"
        >
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading ? (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 3 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Loading statement…
            </Typography>
          </Stack>
        ) : isError ? (
          <Alert severity="error">
            {(error as Error)?.message || "Couldn't load the statement."}
          </Alert>
        ) : rows.length === 0 ? (
          <Alert severity="info">No wallet activity for this site yet.</Alert>
        ) : (
          <>
            {/* Totals */}
            <Stack direction="row" spacing={3} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
              <TotalBox label="Deposited" value={deposited} caption={`${depositCount} entries`} color="success.main" />
              <TotalBox label="Spent" value={spent} caption={`${spendCount} entries`} color="error.main" />
              {returned > 0 && <TotalBox label="Returned" value={returned} color="info.main" />}
              <TotalBox label="Held now" value={held} strong color={held < 0 ? "warning.main" : "text.primary"} />
            </Stack>

            <TableContainer
              component={Box}
              sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}
            >
              <Table size="small" sx={{ "& td, & th": { borderColor: "divider" } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.hover" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Particulars</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>In</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Out</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((ln) => {
                    const r = ln.row;
                    const isDep = r.transaction_type === "deposit";
                    return (
                      <TableRow key={r.id} hover>
                        <TableCell sx={{ color: "text.disabled" }}>{ln.idx}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {dayjs(r.transaction_date).format("DD MMM")}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" component="span">
                            {particulars(r)}
                          </Typography>
                          {isDep && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={prettyPayerSource(r.payer_source ?? "", r.payer_name)}
                              sx={{ ml: 0.75, height: 18, fontSize: "0.65rem" }}
                            />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ color: "success.main", whiteSpace: "nowrap" }}>
                          {isDep ? `₹${fmt(r.amount)}` : ""}
                        </TableCell>
                        <TableCell align="right" sx={{ color: "error.main", whiteSpace: "nowrap" }}>
                          {!isDep ? `₹${fmt(r.amount)}` : ""}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            color: ln.balance < 0 ? "warning.main" : "text.primary",
                          }}
                        >
                          ₹{fmt(ln.balance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {spendSummary.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                    display: "block",
                    mb: 0.5,
                  }}
                >
                  Spends by type
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.75 }}>
                  {spendSummary.map((s) => (
                    <Chip
                      key={s.bucket}
                      size="small"
                      variant="outlined"
                      label={`${s.bucket}: ₹${fmt(s.total)} (${s.n})`}
                      sx={{ height: 24 }}
                    />
                  ))}
                </Stack>
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose} size="small">
          Close
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
          onClick={handleCopy}
          disabled={rows.length === 0}
          color={copied ? "success" : "primary"}
        >
          {copied ? "Copied" : "Copy for WhatsApp"}
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<Print fontSize="small" />}
          onClick={handlePrint}
          disabled={rows.length === 0}
        >
          Print / PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TotalBox({
  label,
  value,
  caption,
  color,
  strong,
}: {
  label: string;
  value: number;
  caption?: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant={strong ? "h6" : "subtitle1"} fontWeight={strong ? 800 : 700} sx={{ color, lineHeight: 1.2 }}>
        ₹{fmt(value)}
      </Typography>
      {caption && (
        <Typography variant="caption" color="text.disabled">
          {caption}
        </Typography>
      )}
    </Box>
  );
}
