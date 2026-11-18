/**
 * A4 PDF rendering of a ClientStatement (@react-pdf/renderer).
 *
 * This module is heavy (~1 MB with fontkit). It is only ever pulled in via
 * `await import()` from ClientStatementDialog when the user generates a PDF,
 * so it never lands in the page bundle.
 *
 * Fonts: Noto Sans from /public/fonts — the built-in PDF fonts have no ₹ glyph.
 */
import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import {
  formatRupees,
  formatStatementDate,
  type ClientStatement,
} from "@/lib/client-statement/buildClientStatement";

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: `${origin}/fonts/NotoSans-Regular.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/NotoSans-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // No automatic hyphenation — names and amounts must never break mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const C = {
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  line: "#E2E8F0",
  zebra: "#F8FAFC",
  brand: "#1E40AF",
  brandSoft: "#EFF6FF",
  due: "#9A3412",
  dueSoft: "#FFF7ED",
  dueLine: "#FDBA74",
  ok: "#166534",
  okSoft: "#F0FDF4",
};

const s = StyleSheet.create({
  page: { fontFamily: "NotoSans", fontSize: 8.5, color: C.body, paddingTop: 34, paddingBottom: 54, paddingHorizontal: 36, lineHeight: 1.35 },
  row: { flexDirection: "row" },
  // Letterhead
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandBlock: { flexDirection: "row", alignItems: "flex-start", maxWidth: 300 },
  monogram: { width: 34, height: 34, borderRadius: 6, backgroundColor: C.brand, color: "#FFFFFF", fontSize: 17, fontWeight: 700, textAlign: "center", paddingTop: 5, marginRight: 10 },
  logo: { width: 40, height: 40, objectFit: "contain", marginRight: 10 },
  companyName: { fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.3, marginBottom: 3 },
  small: { fontSize: 8, color: C.muted },
  docTitle: { fontSize: 13, fontWeight: 700, color: C.brand, textAlign: "right", letterSpacing: 0.6, lineHeight: 1.3, marginBottom: 3 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  metaLabel: { color: C.muted, width: 52, textAlign: "right", marginRight: 6 },
  metaValue: { color: C.ink, fontWeight: 700, minWidth: 90, textAlign: "right" },
  rule: { height: 2, backgroundColor: C.brand, marginTop: 12, marginBottom: 12 },
  // Parties
  parties: { flexDirection: "row", marginBottom: 12 },
  party: { flex: 1, paddingRight: 12 },
  partyLabel: { fontSize: 7, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 3 },
  partyName: { fontSize: 10, fontWeight: 700, color: C.ink },
  // Summary
  summaryWrap: { flexDirection: "row", marginBottom: 14 },
  summaryTable: { flex: 1.35, borderWidth: 1, borderColor: C.line, borderRadius: 4, marginRight: 10 },
  sRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 10 },
  sRowTotal: { borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.zebra },
  sLabel: { color: C.body },
  sValue: { color: C.ink, fontWeight: 700 },
  balanceCard: { flex: 1, borderRadius: 4, padding: 12, borderWidth: 1, justifyContent: "center" },
  balanceLabel: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8 },
  balanceValue: { fontSize: 20, fontWeight: 700, marginTop: 4, lineHeight: 1.3 },
  balanceSub: { fontSize: 8, marginTop: 4, lineHeight: 1.35 },
  progressTrack: { height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, marginTop: 8 },
  progressFill: { height: 4, borderRadius: 2 },
  // Sections & tables
  sectionTitle: { fontSize: 9.5, fontWeight: 700, color: C.ink, marginBottom: 5, marginTop: 4 },
  th: { flexDirection: "row", backgroundColor: C.brandSoft, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#BFDBFE", paddingVertical: 4 },
  thText: { fontSize: 7.2, fontWeight: 700, color: C.brand, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4 },
  td: { paddingHorizontal: 4, color: C.body },
  tdStrong: { paddingHorizontal: 4, color: C.ink, fontWeight: 700 },
  tfoot: { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.ink },
  right: { textAlign: "right" },
  note: { fontSize: 7.2, color: C.muted, marginTop: 1 },
  pendingBox: { borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: 4, padding: 8, marginBottom: 12 },
  // Pay / notes / signatures
  infoBox: { borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 10, marginTop: 12 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap" },
  infoCell: { width: "50%", marginBottom: 3 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 34 },
  signBlock: { width: 200 },
  signLine: { borderTopWidth: 1, borderTopColor: C.body, marginTop: 30, paddingTop: 3 },
  signImage: { height: 60, marginTop: 2, alignSelf: "flex-start" }, // width follows the image ratio
  signLineAfterImage: { borderTopWidth: 1, borderTopColor: C.body, marginTop: 2, paddingTop: 3 },
  // Footer
  footerRule: { position: "absolute", left: 36, right: 36, bottom: 34, height: 0.5, backgroundColor: C.line },
  footerText: { position: "absolute", left: 36, right: 36, bottom: 22, fontSize: 7, color: C.muted },
});

type Width = `${number}%`;

function Cell({ w, children, strong, right }: { w: Width; children: React.ReactNode; strong?: boolean; right?: boolean }) {
  return (
    <Text style={[strong ? s.tdStrong : s.td, right ? s.right : {}, { width: w }]}>{children}</Text>
  );
}

function Th({ w, children, right }: { w: Width; children: React.ReactNode; right?: boolean }) {
  return <Text style={[s.thText, right ? s.right : {}, { width: w }]}>{children}</Text>;
}

export function ClientStatementDocument({ statement: st }: { statement: ClientStatement }) {
  const { summary } = st;
  const company = st.company;
  const settled = summary.balance <= 0;
  const credit = summary.credit > 0;
  const pay = company.payment;
  const hasPayDetails = Boolean(pay.upiId || pay.accountNo);
  const handover = st.due.kind === "handover";
  const pct = Math.max(0, Math.min(100, summary.pctReceived));
  // Drop columns nobody filled in; give the room to "Applied to".
  const showRef = st.payments.some((p) => p.reference);
  const showFrom = st.payments.some((p) => p.from);
  const appliedW = `${14 + (showRef ? 0 : 15) + (showFrom ? 0 : 16)}%` as Width;

  const balanceTone = settled
    ? { bg: C.okSoft, border: "#BBF7D0", fg: C.ok }
    : { bg: C.dueSoft, border: C.dueLine, fg: C.due };

  return (
    <Document title={`${st.title} — ${st.site.name}`} author={company.name} subject={st.statementNo} creator={company.name} producer={company.name}>
      <Page size="A4" style={s.page}>
        {/* Letterhead */}
        <View style={s.head}>
          <View style={s.brandBlock}>
            {company.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
              <Image src={company.logoUrl} style={s.logo} />
            ) : (
              <Text style={s.monogram}>{(company.name[0] ?? "A").toUpperCase()}</Text>
            )}
            <View>
              <Text style={s.companyName}>{company.name}</Text>
              {company.addressLines.map((l, i) => <Text key={i} style={s.small}>{l}</Text>)}
              {(company.phone || company.email) && (
                <Text style={s.small}>{[company.phone, company.email].filter(Boolean).join("  ·  ")}</Text>
              )}
              {company.gstin && <Text style={s.small}>GSTIN: {company.gstin}</Text>}
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>{st.title.toUpperCase()}</Text>
            <View style={s.metaRow}><Text style={s.metaLabel}>No.</Text><Text style={s.metaValue}>{st.statementNo}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>As on</Text><Text style={s.metaValue}>{formatStatementDate(st.asOfDate)}</Text></View>
          </View>
        </View>
        <View style={s.rule} />

        {/* Parties */}
        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.partyLabel}>STATEMENT FOR</Text>
            <Text style={s.partyName}>{st.recipient.name}</Text>
            {st.recipient.phone && <Text style={s.small}>{st.recipient.phone}</Text>}
          </View>
          <View style={s.party}>
            <Text style={s.partyLabel}>PROJECT</Text>
            <Text style={s.partyName}>{st.site.name}</Text>
            {st.site.addressLines.map((l, i) => <Text key={i} style={s.small}>{l}</Text>)}
          </View>
        </View>

        {/* Summary */}
        <View style={s.summaryWrap} wrap={false}>
          <View style={s.summaryTable}>
            <View style={s.sRow}><Text style={s.sLabel}>Base contract value</Text><Text style={s.sValue}>{formatRupees(summary.baseContract)}</Text></View>
            <View style={s.sRow}>
              <Text style={s.sLabel}>Add: Approved additional works ({st.extras.length})</Text>
              <Text style={s.sValue}>{formatRupees(summary.approvedExtras)}</Text>
            </View>
            <View style={[s.sRow, s.sRowTotal]}><Text style={[s.sLabel, { fontWeight: 700, color: C.ink }]}>Total project value</Text><Text style={s.sValue}>{formatRupees(summary.totalContract)}</Text></View>
            <View style={s.sRow}>
              <Text style={s.sLabel}>Less: Payments received ({st.payments.length})</Text>
              <Text style={s.sValue}>{formatRupees(summary.received)}</Text>
            </View>
          </View>
          <View style={[s.balanceCard, { backgroundColor: balanceTone.bg, borderColor: balanceTone.border }]}>
            <Text style={[s.balanceLabel, { color: balanceTone.fg }]}>
              {credit ? "EXCESS RECEIVED" : settled ? "ACCOUNT SETTLED" : "BALANCE TO BE SETTLED"}
            </Text>
            <Text style={[s.balanceValue, { color: balanceTone.fg }]}>
              {formatRupees(credit ? summary.credit : summary.balanceDue)}
            </Text>
            {st.dueLabel && <Text style={[s.balanceSub, { color: balanceTone.fg }]}>{st.dueLabel}</Text>}
            {credit && <Text style={[s.balanceSub, { color: balanceTone.fg }]}>To be adjusted or refunded</Text>}
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: balanceTone.fg }]} />
            </View>
            <Text style={[s.balanceSub, { color: C.muted }]}>{summary.pctReceived}% of total project value received</Text>
          </View>
        </View>

        {/* A. Additional works */}
        <Text style={s.sectionTitle}>A. Approved additional works</Text>
        {st.extras.length === 0 ? (
          <Text style={[s.small, { marginBottom: 12 }]}>No additional works.</Text>
        ) : (
          <View style={{ marginBottom: 12 }}>
            <View style={s.th}>
              <Th w="5%">#</Th>
              <Th w="49%">Work</Th>
              <Th w="15%">Approved on</Th>
              <Th w="17%">Approved by</Th>
              <Th w="14%" right>Amount</Th>
            </View>
            {st.extras.map((e, i) => (
              <View key={e.id} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
                <Cell w="5%">{i + 1}</Cell>
                <View style={{ width: "49%", paddingHorizontal: 4 }}>
                  <Text style={{ color: C.ink }}>{e.title}</Text>
                  {e.description && <Text style={s.note}>{e.description}</Text>}
                </View>
                <Cell w="15%">{formatStatementDate(e.approvedOn)}</Cell>
                <Cell w="17%">{e.approvedBy ?? "—"}</Cell>
                <Cell w="14%" right strong>{formatRupees(e.amount)}</Cell>
              </View>
            ))}
            <View style={s.tfoot} wrap={false}>
              <Cell w="86%" strong>Total approved additional works</Cell>
              <Cell w="14%" right strong>{formatRupees(summary.approvedExtras)}</Cell>
            </View>
          </View>
        )}

        {st.pendingExtras.length > 0 && (
          <View style={s.pendingBox} wrap={false}>
            <Text style={[s.sectionTitle, { marginTop: 0 }]}>Awaiting your confirmation (not included in the total)</Text>
            {st.pendingExtras.map((p) => (
              <View key={p.id} style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
                <Text>{p.title}</Text>
                <Text style={{ color: C.ink }}>Quoted {formatRupees(p.quotedAmount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* B. Payments */}
        <Text style={s.sectionTitle}>B. Payments received</Text>
        {st.payments.length === 0 ? (
          <Text style={[s.small, { marginBottom: 12 }]}>No payments recorded yet.</Text>
        ) : (
          <View>
            <View style={s.th}>
              <Th w="5%">#</Th>
              <Th w="13%">Date</Th>
              <Th w="13%">Mode</Th>
              {showRef && <Th w="15%">Reference</Th>}
              {showFrom && <Th w="16%">Received from</Th>}
              <Th w={appliedW}>Applied to</Th>
              <Th w="12%" right>Amount</Th>
              <Th w="12%" right>Total so far</Th>
            </View>
            {st.payments.map((p, i) => (
              <View key={p.id} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
                <Cell w="5%">{i + 1}</Cell>
                <Cell w="13%">{formatStatementDate(p.date)}</Cell>
                <Cell w="13%">{p.mode}</Cell>
                {showRef && <Cell w="15%">{p.reference ?? "—"}</Cell>}
                {showFrom && <Cell w="16%">{p.from ?? "—"}</Cell>}
                <View style={{ width: appliedW, paddingHorizontal: 4 }}>
                  <Text>{p.appliedTo}</Text>
                  {p.notes && <Text style={s.note}>{p.notes}</Text>}
                </View>
                <Cell w="12%" right strong>{formatRupees(p.amount)}</Cell>
                <Cell w="12%" right>{formatRupees(p.runningTotal)}</Cell>
              </View>
            ))}
            <View style={s.tfoot} wrap={false}>
              <Cell w="76%" strong>Total received</Cell>
              <Cell w="12%" right strong>{formatRupees(summary.received)}</Cell>
              <Cell w="12%"> </Cell>
            </View>
          </View>
        )}

        {/* How to pay */}
        {hasPayDetails && !settled && (
          <View style={s.infoBox} wrap={false}>
            <Text style={[s.sectionTitle, { marginTop: 0 }]}>Payment details</Text>
            <View style={s.infoGrid}>
              {pay.accountName && <Text style={s.infoCell}>Account name: <Text style={{ color: C.ink, fontWeight: 700 }}>{pay.accountName}</Text></Text>}
              {pay.bankName && <Text style={s.infoCell}>Bank: <Text style={{ color: C.ink, fontWeight: 700 }}>{pay.bankName}</Text></Text>}
              {pay.accountNo && <Text style={s.infoCell}>Account no.: <Text style={{ color: C.ink, fontWeight: 700 }}>{pay.accountNo}</Text></Text>}
              {pay.ifsc && <Text style={s.infoCell}>IFSC: <Text style={{ color: C.ink, fontWeight: 700 }}>{pay.ifsc}</Text></Text>}
              {pay.upiId && <Text style={s.infoCell}>UPI: <Text style={{ color: C.ink, fontWeight: 700 }}>{pay.upiId}</Text></Text>}
            </View>
          </View>
        )}

        {/* Polite note */}
        <View style={s.infoBox} wrap={false}>
          <Text>
            This statement is shared for your verification. If any entry differs from your records, please let us know
            {handover ? " before the handover" : ""} and we will gladly reconcile it. Thank you for your trust.
          </Text>
          {company.footerNote && <Text style={{ marginTop: 4 }}>{company.footerNote}</Text>}
        </View>

        {/* Signatures */}
        <View style={s.signRow} wrap={false}>
          <View style={s.signBlock}>
            <Text style={{ color: C.ink, fontWeight: 700 }}>For {company.name}</Text>
            {company.signatureDataUrl ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                <Image src={company.signatureDataUrl} style={s.signImage} />
                <Text style={s.signLineAfterImage}>{company.signatoryName ?? "Authorised signatory"}</Text>
              </>
            ) : (
              <Text style={s.signLine}>{company.signatoryName ?? "Authorised signatory"}</Text>
            )}
            {company.signatoryName && <Text style={s.small}>Authorised signatory</Text>}
          </View>
          <View style={s.signBlock}>
            <Text style={{ color: C.ink, fontWeight: 700 }}>Acknowledged by client</Text>
            <Text style={[s.signLine, company.signatureDataUrl ? { marginTop: 64 } : {}]}>Name, signature &amp; date</Text>
          </View>
        </View>

        {/* Static text only: react-pdf's dynamic `render` text does not draw with our registered fonts. */}
        <View style={s.footerRule} fixed />
        <Text style={s.footerText} fixed>
          This is a statement of account and not a tax invoice.  ·  {st.statementNo}  ·  {company.name}
        </Text>
      </Page>
    </Document>
  );
}

/** Render the statement to a PDF Blob (browser only). */
export async function renderClientStatementPdf(statement: ClientStatement): Promise<Blob> {
  registerFonts();
  return pdf(<ClientStatementDocument statement={statement} />).toBlob();
}
