/**
 * Client Statement of Account — pure model builder.
 *
 * Turns a site's contract value, additional works and client payments into the
 * exact figures a client sees on a shared statement (PDF + WhatsApp text).
 * Kept free of React / Supabase so the numbers are unit-tested in isolation
 * and the PDF, the on-screen preview and the saved snapshot all agree.
 *
 * Client-facing rules (differ deliberately from useSiteFinancialSummary):
 *  - Internal figures (supervisor cost, net in hand) are never included.
 *  - An extra counts toward the total once it has a confirmed amount and is
 *    not cancelled (same rule as the summary hero). Quoted extras without a
 *    confirmed amount are listed separately as "awaiting confirmation".
 *  - Over-payment is NOT clamped to zero: it is shown as a credit.
 *  - Payment notes are internal by default and only included on request.
 *    The free-text "reference" field is often used for remarks too ("I went
 *    home and collected"), so it is shown only when it looks like a real
 *    transaction id (UTR / cheque no.) — or when notes are switched on.
 */
import dayjs from "dayjs";

export type StatementTitleVariant = "statement" | "final";

export type StatementDue =
  | { kind: "none" }
  | { kind: "date"; date: string }      // YYYY-MM-DD
  | { kind: "handover"; date: string }; // YYYY-MM-DD

export interface StatementPaymentDetails {
  bankName?: string | null;
  accountName?: string | null;
  accountNo?: string | null;
  ifsc?: string | null;
  upiId?: string | null;
}

/** Saved under companies.settings.statement */
export interface StatementCompanySettings extends StatementPaymentDetails {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  footerNote?: string | null;
  /** Object path in the private "company-private" bucket (never a public URL). */
  signaturePath?: string | null;
  /** Printed under the signature line, e.g. "M. Hari, Managing Partner". */
  signatoryName?: string | null;
}

export interface StatementCompany {
  name: string;
  code: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  gstin: string | null;
  logoUrl: string | null;
  payment: StatementPaymentDetails;
  footerNote: string | null;
  /** Signature image as a data: URL, resolved at runtime from the private bucket. */
  signatureDataUrl: string | null;
  signatoryName: string | null;
}

export interface StatementWorkInput {
  id: string;
  title: string;
  description?: string | null;
  status: string; // quoted | confirmed | paid | cancelled
  estimated_amount: number | string | null;
  confirmed_amount: number | string | null;
  confirmation_date: string | null;
  client_approved_by?: string | null;
  client_approved_by_id?: string | null;
  created_at?: string | null;
}

export interface StatementPaymentInput {
  id: string;
  amount: number | string;
  payment_date: string;
  payment_mode: string;
  transaction_reference?: string | null;
  notes?: string | null;
  tagged_additional_work_id?: string | null;
  payment_phase_id?: string | null;
  received_from_client_id?: string | null;
}

export interface StatementClientInput {
  id: string;
  name: string;
  phone?: string | null;
}

export interface BuildStatementInput {
  site: { name: string; address?: string | null; city?: string | null; contractValue: number | string | null };
  company: StatementCompany;
  recipient: { name: string; phone: string | null; clientId: string | null };
  clients: StatementClientInput[];
  /**
   * Shown as "Approved by" for extras that have no approver recorded —
   * normally the site's primary client (the owner approves variations).
   */
  defaultApprover?: string | null;
  /** Shown as "Received from" for payments with no payer recorded — normally the primary client. */
  defaultPayer?: string | null;
  works: StatementWorkInput[];
  payments: StatementPaymentInput[];
  options: {
    asOfDate: string; // YYYY-MM-DD
    titleVariant: StatementTitleVariant;
    due: StatementDue;
    includeNotes: boolean;
    statementNo: string;
  };
}

export interface StatementExtraRow {
  id: string;
  title: string;
  description: string | null;
  approvedOn: string | null; // YYYY-MM-DD
  approvedBy: string | null;
  amount: number;
  paidAgainst: number;
}

export interface StatementPendingExtraRow {
  id: string;
  title: string;
  quotedAmount: number;
}

export interface StatementPaymentRow {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  mode: string;
  reference: string | null;
  from: string | null;
  appliedTo: string;
  notes: string | null;
  runningTotal: number;
}

export interface StatementSummary {
  baseContract: number;
  approvedExtras: number;
  totalContract: number;
  received: number;
  /** total − received. Negative means the client has paid in excess. */
  balance: number;
  balanceDue: number;
  credit: number;
  pctReceived: number;
}

export interface ClientStatement {
  statementNo: string;
  title: string;
  titleVariant: StatementTitleVariant;
  asOfDate: string;
  due: StatementDue;
  dueLabel: string | null;
  company: StatementCompany;
  recipient: { name: string; phone: string | null; clientId: string | null };
  site: { name: string; addressLines: string[] };
  summary: StatementSummary;
  extras: StatementExtraRow[];
  pendingExtras: StatementPendingExtraRow[];
  payments: StatementPaymentRow[];
  includeNotes: boolean;
}

export const STATEMENT_TITLES: Record<StatementTitleVariant, string> = {
  statement: "Statement of Account",
  final: "Final Settlement Statement",
};

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Rupee amounts never carry float noise into a client document. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** ₹29,23,500 — Indian digit grouping, paise only when present. */
export function formatRupees(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const hasPaise = Math.round(abs * 100) % 100 !== 0;
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** 20 Nov 2026 */
export function formatStatementDate(d: string | null | undefined): string {
  if (!d) return "—";
  const p = dayjs(d);
  return p.isValid() ? p.format("DD MMM YYYY") : "—";
}

/** Fri, 20 Nov 2026 */
export function formatStatementDateWithDay(d: string): string {
  const p = dayjs(d);
  return p.isValid() ? p.format("ddd, DD MMM YYYY") : d;
}

export function dueLabelFor(due: StatementDue): string | null {
  switch (due.kind) {
    case "none":
      return null;
    case "date":
      return `Payable by ${formatStatementDate(due.date)}`;
    case "handover":
      return `Payable at key handover on ${formatStatementDateWithDay(due.date)}`;
  }
}

/** Site initials for the statement number: "Srinivasan House & Shop" → "SHS". */
export function siteCode(siteName: string): string {
  const letters = siteName
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (letters || "SITE").slice(0, 5);
}

/** AESTA/SHS/2611/03 */
export function makeStatementNo(companyCode: string, siteName: string, asOfDate: string, seq: number): string {
  const yymm = dayjs(asOfDate).isValid() ? dayjs(asOfDate).format("YYMM") : "0000";
  const code = (companyCode || "ST").toUpperCase();
  return `${code}/${siteCode(siteName)}/${yymm}/${String(seq).padStart(2, "0")}`;
}

/**
 * Greeting name from a stored client name: "Gayathri w/o Srinivasan" → "Gayathri".
 * Indian rosters often carry relation suffixes (w/o, s/o, d/o, c/o).
 */
export function greetingNameFrom(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+(?:w\/o|s\/o|d\/o|c\/o)\.?\s+/i)[0]!.trim();
}

/** UTR / UPI ref / cheque no.: one token of letters, digits and - / # . (at least 4 chars, at least one digit). */
export function looksLikeTxnReference(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  return /^[A-Za-z0-9#\-/.]{4,40}$/.test(t) && /\d/.test(t);
}

export function buildClientStatement(input: BuildStatementInput): ClientStatement {
  const { site, company, recipient, clients, works, payments, options } = input;
  const fallbackApprover = clean(input.defaultApprover);
  const fallbackPayer = clean(input.defaultPayer);
  const asOf = options.asOfDate;
  const onOrBeforeAsOf = (d: string | null | undefined) => !d || d.slice(0, 10) <= asOf;

  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  // Payments within the statement period, oldest first (ties keep input order).
  const inPeriod = payments
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => onOrBeforeAsOf(p.payment_date))
    .sort((a, b) => a.p.payment_date.localeCompare(b.p.payment_date) || a.i - b.i)
    .map(({ p }) => p);

  const paidByWork = new Map<string, number>();
  for (const p of inPeriod) {
    if (p.tagged_additional_work_id) {
      paidByWork.set(p.tagged_additional_work_id, (paidByWork.get(p.tagged_additional_work_id) ?? 0) + num(p.amount));
    }
  }

  const workById = new Map(works.map((w) => [w.id, w]));

  const live = works.filter((w) => w.status !== "cancelled");

  const extras: StatementExtraRow[] = live
    .filter((w) => w.confirmed_amount != null && onOrBeforeAsOf(w.confirmation_date))
    .map((w) => ({
      id: w.id,
      title: w.title,
      description: clean(w.description),
      approvedOn: w.confirmation_date,
      approvedBy:
        (w.client_approved_by_id ? clientName.get(w.client_approved_by_id) : undefined) ??
        clean(w.client_approved_by) ??
        fallbackApprover,
      amount: round2(num(w.confirmed_amount)),
      paidAgainst: round2(paidByWork.get(w.id) ?? 0),
    }))
    .sort((a, b) => {
      if (a.approvedOn && b.approvedOn) return a.approvedOn.localeCompare(b.approvedOn);
      if (a.approvedOn) return -1;
      if (b.approvedOn) return 1;
      return a.title.localeCompare(b.title);
    });

  const pendingExtras: StatementPendingExtraRow[] = live
    .filter((w) => w.confirmed_amount == null)
    .map((w) => ({ id: w.id, title: w.title, quotedAmount: round2(num(w.estimated_amount)) }));

  let running = 0;
  const paymentRows: StatementPaymentRow[] = inPeriod.map((p) => {
    const amount = round2(num(p.amount));
    running = round2(running + amount);
    let appliedTo = "Contract";
    if (p.tagged_additional_work_id) {
      const w = workById.get(p.tagged_additional_work_id);
      appliedTo = w ? `Extra: ${w.title}` : "Additional work";
    } else if (p.payment_phase_id) {
      appliedTo = "Contract";
    }
    return {
      id: p.id,
      date: p.payment_date,
      amount,
      mode: PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode,
      reference: options.includeNotes || looksLikeTxnReference(p.transaction_reference)
        ? clean(p.transaction_reference)
        : null,
      from: (p.received_from_client_id ? clientName.get(p.received_from_client_id) : undefined) ?? fallbackPayer,
      appliedTo,
      notes: options.includeNotes ? clean(p.notes) : null,
      runningTotal: running,
    };
  });

  const baseContract = round2(num(site.contractValue));
  const approvedExtras = round2(extras.reduce((s, e) => s + e.amount, 0));
  const totalContract = round2(baseContract + approvedExtras);
  const received = running;
  const balance = round2(totalContract - received);

  const siteAddress = [clean(site.address), clean(site.city)].filter((x): x is string => Boolean(x));

  return {
    statementNo: options.statementNo,
    title: STATEMENT_TITLES[options.titleVariant],
    titleVariant: options.titleVariant,
    asOfDate: asOf,
    due: options.due,
    dueLabel: balance > 0 ? dueLabelFor(options.due) : null,
    company,
    recipient,
    site: { name: site.name, addressLines: siteAddress },
    summary: {
      baseContract,
      approvedExtras,
      totalContract,
      received,
      balance,
      balanceDue: Math.max(0, balance),
      credit: Math.max(0, -balance),
      pctReceived: totalContract > 0 ? Math.floor((received / totalContract) * 1000) / 10 : 0,
    },
    extras,
    pendingExtras,
    payments: paymentRows,
    includeNotes: options.includeNotes,
  };
}

/**
 * Stable fingerprint of the money inputs — lets the page tell whether payments
 * or extras changed after the last statement was sent.
 */
export function statementFingerprint(s: Pick<ClientStatement, "summary" | "payments" | "extras">): string {
  return [
    s.summary.totalContract,
    s.summary.received,
    s.payments.length,
    s.extras.length,
  ].join("|");
}
