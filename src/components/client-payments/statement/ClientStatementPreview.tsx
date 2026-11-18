"use client";

/**
 * On-screen "paper" preview of a ClientStatement. Mirrors ClientStatementPdf
 * section-for-section so what the user checks here is what the client gets.
 * Always light (it represents a printed page), regardless of app theme.
 */
import React from "react";
import { Box, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import {
  formatRupees,
  formatStatementDate,
  type ClientStatement,
} from "@/lib/client-statement/buildClientStatement";

const INK = "#0F172A";
const BODY = "#334155";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const BRAND = "#1E40AF";

const cellSx = { color: BODY, fontSize: 12, py: 0.75, px: 1, borderColor: LINE } as const;
const headSx = { ...cellSx, color: BRAND, fontWeight: 700, fontSize: 11, bgcolor: "#EFF6FF", whiteSpace: "nowrap" } as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", mb: 0.25 }}>
      {children}
    </Typography>
  );
}

export function ClientStatementPreview({ statement: st }: { statement: ClientStatement }) {
  const { summary, company } = st;
  const settled = summary.balance <= 0;
  const credit = summary.credit > 0;
  const tone = settled
    ? { bg: "#F0FDF4", border: "#BBF7D0", fg: "#166534" }
    : { bg: "#FFF7ED", border: "#FDBA74", fg: "#9A3412" };
  const pay = company.payment;
  const hasPayDetails = Boolean(pay.upiId || pay.accountNo);
  const showRef = st.payments.some((p) => p.reference);
  const showFrom = st.payments.some((p) => p.from);

  return (
    <Box
      role="document"
      aria-label={`${st.title} preview`}
      sx={{
        bgcolor: "#FFFFFF",
        color: BODY,
        colorScheme: "light",
        borderRadius: 1,
        boxShadow: "0 1px 3px rgba(15,23,42,0.12), 0 8px 24px rgba(15,23,42,0.08)",
        p: { xs: 2, sm: 4 },
        maxWidth: 820,
        mx: "auto",
        fontSize: 12,
      }}
    >
      {/* Letterhead */}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {company.logoUrl ? (
            <Box component="img" src={company.logoUrl} alt="" sx={{ width: 44, height: 44, objectFit: "contain" }} />
          ) : (
            <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: BRAND, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
              {(company.name[0] ?? "A").toUpperCase()}
            </Box>
          )}
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 18, color: INK, lineHeight: 1.2 }}>{company.name}</Typography>
            {company.addressLines.map((l, i) => <Typography key={i} sx={{ fontSize: 11.5, color: MUTED }}>{l}</Typography>)}
            {(company.phone || company.email) && (
              <Typography sx={{ fontSize: 11.5, color: MUTED }}>{[company.phone, company.email].filter(Boolean).join("  ·  ")}</Typography>
            )}
            {company.gstin && <Typography sx={{ fontSize: 11.5, color: MUTED }}>GSTIN: {company.gstin}</Typography>}
          </Box>
        </Stack>
        <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16, color: BRAND, letterSpacing: 0.6 }}>{st.title.toUpperCase()}</Typography>
          <Typography sx={{ fontSize: 12 }}><Box component="span" sx={{ color: MUTED }}>No. </Box><b style={{ color: INK }}>{st.statementNo}</b></Typography>
          <Typography sx={{ fontSize: 12 }}><Box component="span" sx={{ color: MUTED }}>As on </Box><b style={{ color: INK }}>{formatStatementDate(st.asOfDate)}</b></Typography>
        </Box>
      </Stack>
      <Box sx={{ height: 2, bgcolor: BRAND, my: 2 }} />

      {/* Parties */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Label>Statement for</Label>
          <Typography sx={{ fontWeight: 700, color: INK, fontSize: 14 }}>{st.recipient.name || "—"}</Typography>
          {st.recipient.phone && <Typography sx={{ fontSize: 12, color: MUTED }}>{st.recipient.phone}</Typography>}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Label>Project</Label>
          <Typography sx={{ fontWeight: 700, color: INK, fontSize: 14 }}>{st.site.name}</Typography>
          {st.site.addressLines.map((l, i) => <Typography key={i} sx={{ fontSize: 12, color: MUTED }}>{l}</Typography>)}
        </Box>
      </Stack>

      {/* Summary */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Box sx={{ flex: 1.35, border: `1px solid ${LINE}`, borderRadius: 1 }}>
          {[
            ["Base contract value", summary.baseContract, false],
            [`Add: Approved additional works (${st.extras.length})`, summary.approvedExtras, false],
            ["Total project value", summary.totalContract, true],
            [`Less: Payments received (${st.payments.length})`, summary.received, false],
          ].map(([label, value, total]) => (
            <Stack
              key={label as string}
              direction="row"
              justifyContent="space-between"
              sx={{ px: 1.5, py: 0.9, ...(total ? { bgcolor: "#F8FAFC", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` } : {}) }}
            >
              <Typography sx={{ fontSize: 12.5, color: total ? INK : BODY, fontWeight: total ? 700 : 400 }}>{label as string}</Typography>
              <Typography sx={{ fontSize: 12.5, color: INK, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatRupees(value as number)}</Typography>
            </Stack>
          ))}
        </Box>
        <Box sx={{ flex: 1, bgcolor: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 1, p: 2, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: tone.fg }}>
            {credit ? "EXCESS RECEIVED" : settled ? "ACCOUNT SETTLED" : "BALANCE TO BE SETTLED"}
          </Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 700, color: tone.fg, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
            {formatRupees(credit ? summary.credit : summary.balanceDue)}
          </Typography>
          {st.dueLabel && <Typography sx={{ fontSize: 12, color: tone.fg }}>{st.dueLabel}</Typography>}
          {credit && <Typography sx={{ fontSize: 12, color: tone.fg }}>To be adjusted or refunded</Typography>}
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(100, summary.pctReceived))}
            aria-label="Share of total project value received"
            sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: "#E5E7EB", "& .MuiLinearProgress-bar": { bgcolor: tone.fg } }}
          />
          <Typography sx={{ fontSize: 11.5, color: MUTED, mt: 0.5 }}>{summary.pctReceived}% of total project value received</Typography>
        </Box>
      </Stack>

      {/* A. Extras */}
      <Typography sx={{ fontWeight: 700, color: INK, fontSize: 13.5, mb: 1 }}>A. Approved additional works</Typography>
      {st.extras.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: MUTED, mb: 3 }}>No additional works.</Typography>
      ) : (
        <Box sx={{ overflowX: "auto", mb: 3 }}>
          <Table size="small" sx={{ minWidth: 480 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>#</TableCell>
                <TableCell sx={headSx}>Work</TableCell>
                <TableCell sx={headSx}>Approved on</TableCell>
                <TableCell sx={headSx}>Approved by</TableCell>
                <TableCell sx={headSx} align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {st.extras.map((e, i) => (
                <TableRow key={e.id} sx={{ bgcolor: i % 2 ? "#F8FAFC" : "transparent" }}>
                  <TableCell sx={cellSx}>{i + 1}</TableCell>
                  <TableCell sx={{ ...cellSx, color: INK }}>
                    {e.title}
                    {e.description && <Box sx={{ fontSize: 11, color: MUTED }}>{e.description}</Box>}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>{formatStatementDate(e.approvedOn)}</TableCell>
                  <TableCell sx={cellSx}>{e.approvedBy ?? "—"}</TableCell>
                  <TableCell sx={{ ...cellSx, color: INK, fontWeight: 700, whiteSpace: "nowrap" }} align="right">{formatRupees(e.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ ...cellSx, color: INK, fontWeight: 700, borderTop: `1px solid ${INK}` }} colSpan={4}>Total approved additional works</TableCell>
                <TableCell sx={{ ...cellSx, color: INK, fontWeight: 700, borderTop: `1px solid ${INK}`, whiteSpace: "nowrap" }} align="right">{formatRupees(summary.approvedExtras)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}

      {st.pendingExtras.length > 0 && (
        <Box sx={{ border: `1px dashed ${LINE}`, borderRadius: 1, p: 1.5, mb: 3 }}>
          <Typography sx={{ fontWeight: 700, color: INK, fontSize: 12.5, mb: 0.5 }}>Awaiting your confirmation (not included in the total)</Typography>
          {st.pendingExtras.map((p) => (
            <Stack key={p.id} direction="row" justifyContent="space-between">
              <Typography sx={{ fontSize: 12 }}>{p.title}</Typography>
              <Typography sx={{ fontSize: 12, color: INK }}>Quoted {formatRupees(p.quotedAmount)}</Typography>
            </Stack>
          ))}
        </Box>
      )}

      {/* B. Payments */}
      <Typography sx={{ fontWeight: 700, color: INK, fontSize: 13.5, mb: 1 }}>B. Payments received</Typography>
      {st.payments.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: MUTED, mb: 2 }}>No payments recorded yet.</Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>#</TableCell>
                <TableCell sx={headSx}>Date</TableCell>
                <TableCell sx={headSx}>Mode</TableCell>
                {showRef && <TableCell sx={headSx}>Reference</TableCell>}
                {showFrom && <TableCell sx={headSx}>Received from</TableCell>}
                <TableCell sx={headSx}>Applied to</TableCell>
                <TableCell sx={headSx} align="right">Amount</TableCell>
                <TableCell sx={headSx} align="right">Total so far</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {st.payments.map((p, i) => (
                <TableRow key={p.id} sx={{ bgcolor: i % 2 ? "#F8FAFC" : "transparent" }}>
                  <TableCell sx={cellSx}>{i + 1}</TableCell>
                  <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>{formatStatementDate(p.date)}</TableCell>
                  <TableCell sx={cellSx}>{p.mode}</TableCell>
                  {showRef && <TableCell sx={cellSx}>{p.reference ?? "—"}</TableCell>}
                  {showFrom && <TableCell sx={cellSx}>{p.from ?? "—"}</TableCell>}
                  <TableCell sx={cellSx}>
                    {p.appliedTo}
                    {p.notes && <Box sx={{ fontSize: 11, color: MUTED }}>{p.notes}</Box>}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: INK, fontWeight: 700, whiteSpace: "nowrap" }} align="right">{formatRupees(p.amount)}</TableCell>
                  <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }} align="right">{formatRupees(p.runningTotal)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ ...cellSx, color: INK, fontWeight: 700, borderTop: `1px solid ${INK}` }} colSpan={4 + (showRef ? 1 : 0) + (showFrom ? 1 : 0)}>Total received</TableCell>
                <TableCell sx={{ ...cellSx, color: INK, fontWeight: 700, borderTop: `1px solid ${INK}`, whiteSpace: "nowrap" }} align="right">{formatRupees(summary.received)}</TableCell>
                <TableCell sx={{ ...cellSx, borderTop: `1px solid ${INK}` }} />
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}

      {hasPayDetails && !settled && (
        <Box sx={{ border: `1px solid ${LINE}`, borderRadius: 1, p: 1.5, mt: 3 }}>
          <Typography sx={{ fontWeight: 700, color: INK, fontSize: 12.5, mb: 0.5 }}>Payment details</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.25, fontSize: 12 }}>
            {pay.accountName && <span>Account name: <b style={{ color: INK }}>{pay.accountName}</b></span>}
            {pay.bankName && <span>Bank: <b style={{ color: INK }}>{pay.bankName}</b></span>}
            {pay.accountNo && <span>Account no.: <b style={{ color: INK }}>{pay.accountNo}</b></span>}
            {pay.ifsc && <span>IFSC: <b style={{ color: INK }}>{pay.ifsc}</b></span>}
            {pay.upiId && <span>UPI: <b style={{ color: INK }}>{pay.upiId}</b></span>}
          </Box>
        </Box>
      )}

      <Box sx={{ border: `1px solid ${LINE}`, borderRadius: 1, p: 1.5, mt: 3, fontSize: 12 }}>
        This statement is shared for your verification. If any entry differs from your records, please let us know
        {st.due.kind === "handover" ? " before the handover" : ""} and we will gladly reconcile it. Thank you for your trust.
        {company.footerNote && <Box sx={{ mt: 0.5 }}>{company.footerNote}</Box>}
      </Box>

      <Stack direction="row" justifyContent="space-between" spacing={3} sx={{ mt: 5 }}>
        <Box sx={{ width: 220, maxWidth: "45%" }}>
          <Typography sx={{ fontWeight: 700, color: INK, fontSize: 12 }}>For {company.name}</Typography>
          {company.signatureDataUrl ? (
            <Box component="img" src={company.signatureDataUrl} alt="Authorised signature" sx={{ display: "block", height: 72, maxWidth: 180, objectFit: "contain", objectPosition: "left bottom", mt: 0.5 }} />
          ) : (
            <Box sx={{ height: 36 }} />
          )}
          <Box sx={{ borderTop: `1px solid ${BODY}`, pt: 0.5, fontSize: 11.5 }}>
            {company.signatoryName ?? "Authorised signatory"}
          </Box>
          {company.signatoryName && <Typography sx={{ fontSize: 11, color: MUTED }}>Authorised signatory</Typography>}
        </Box>
        <Box sx={{ width: 220, maxWidth: "45%" }}>
          <Typography sx={{ fontWeight: 700, color: INK, fontSize: 12 }}>Acknowledged by client</Typography>
          <Box sx={{ height: company.signatureDataUrl ? 76 : 36 }} />
          <Box sx={{ borderTop: `1px solid ${BODY}`, pt: 0.5, fontSize: 11.5 }}>Name, signature &amp; date</Box>
        </Box>
      </Stack>

      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4, pt: 1, borderTop: `1px solid ${LINE}`, fontSize: 10.5, color: MUTED }}>
        <span>This is a statement of account and not a tax invoice.</span>
        <span>{st.statementNo}</span>
      </Stack>
    </Box>
  );
}

export default ClientStatementPreview;
