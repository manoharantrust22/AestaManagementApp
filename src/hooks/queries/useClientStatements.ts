"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database, Json } from "@/types/database.types";
import type {
  ClientStatement,
  StatementCompany,
  StatementCompanySettings,
} from "@/lib/client-statement/buildClientStatement";

export type ClientStatementRow = Database["public"]["Tables"]["client_statements"]["Row"];
export type StatementSentVia = "whatsapp" | "share" | "download";

const KEY = (siteId: string | undefined) => ["client-statements", siteId];

/** Statements sent for a site, newest first. */
export function useClientStatements(siteId: string | undefined) {
  return useQuery({
    queryKey: KEY(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: wrapQueryFn(async (): Promise<ClientStatementRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_statements")
        .select("*")
        .eq("site_id", siteId!)
        .order("seq", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ClientStatementRow[];
    }, { operationName: "useClientStatements" }),
  });
}

export interface RecordClientStatementInput {
  siteId: string;
  seq: number;
  statement: ClientStatement;
  sentVia: StatementSentVia;
}

/** Save the snapshot of what was shared. One retry on a seq collision (two people sending at once). */
export function useRecordClientStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ siteId, seq, statement, sentVia }: RecordClientStatementInput) => {
      const supabase = createClient();
      const row = (n: number, no: string) => ({
        site_id: siteId,
        seq: n,
        statement_no: no,
        title: statement.title,
        as_of_date: statement.asOfDate,
        due_label: statement.dueLabel,
        total_contract: statement.summary.totalContract,
        total_received: statement.summary.received,
        balance: statement.summary.balance,
        // Keep the snapshot small: the signature image is not part of the record.
        snapshot: JSON.parse(JSON.stringify({
          ...statement,
          company: { ...statement.company, signatureDataUrl: null },
        })) as Json,
        sent_via: sentVia,
        sent_to_client_id: statement.recipient.clientId,
      });
      const first = await supabase.from("client_statements").insert(row(seq, statement.statementNo)).select().single();
      if (!first.error) return first.data as ClientStatementRow;
      if (first.error.code !== "23505") throw first.error;
      // Someone else used this number meanwhile — take the next free one.
      const { data: last } = await supabase
        .from("client_statements")
        .select("seq")
        .eq("site_id", siteId)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      const next = (last?.seq ?? seq) + 1;
      const no = statement.statementNo.replace(/\/\d+$/, `/${String(next).padStart(2, "0")}`);
      const retry = await supabase.from("client_statements").insert(row(next, no)).select().single();
      if (retry.error) throw retry.error;
      return retry.data as ClientStatementRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: KEY(row.site_id) });
    },
  });
}

// ─── Company letterhead + payment details ───────────────────────────────────

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CompanyLite = Pick<CompanyRow, "id" | "name" | "code" | "address" | "city" | "state" | "phone" | "email" | "gst_number" | "logo_url" | "settings">;

const COMPANY_KEY = (companyId: string | undefined | null) => ["statement-company", companyId];

function settingsOf(c: CompanyLite | null | undefined): StatementCompanySettings {
  const raw = (c?.settings ?? {}) as Record<string, unknown>;
  const st = raw.statement;
  return st && typeof st === "object" ? (st as StatementCompanySettings) : {};
}

const t = (v: string | null | undefined) => {
  const x = (v ?? "").trim();
  return x === "" ? null : x;
};

/** Merge the company row with the statement overrides saved in companies.settings.statement. */
export function toStatementCompany(c: CompanyLite | null | undefined): StatementCompany {
  const st = settingsOf(c);
  const address = t(st.address) ?? t(c?.address);
  const cityLine = [t(c?.city), t(c?.state)].filter(Boolean).join(", ");
  const addressLines = address ? address.split(/\n+/).map((l) => l.trim()).filter(Boolean) : [];
  const city = t(c?.city);
  // Append "City, State" unless the typed address already mentions the city.
  if (cityLine && !(city && address?.toLowerCase().includes(city.toLowerCase()))) {
    addressLines.push(cityLine);
  }
  return {
    name: c?.name ?? "",
    code: c?.code ?? "",
    addressLines,
    phone: t(st.phone) ?? t(c?.phone),
    email: t(st.email) ?? t(c?.email),
    gstin: t(c?.gst_number),
    logoUrl: t(c?.logo_url),
    payment: {
      bankName: t(st.bankName),
      accountName: t(st.accountName),
      accountNo: t(st.accountNo),
      ifsc: t(st.ifsc),
      upiId: t(st.upiId),
    },
    footerNote: t(st.footerNote),
    signatureDataUrl: null, // filled in by useCompanySignature (private bucket)
    signatoryName: t(st.signatoryName),
  };
}

export function useStatementCompany(companyId: string | undefined | null) {
  return useQuery({
    queryKey: COMPANY_KEY(companyId),
    enabled: Boolean(companyId),
    staleTime: 10 * 60_000,
    queryFn: wrapQueryFn(async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, code, address, city, state, phone, email, gst_number, logo_url, settings")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      const row = data as CompanyLite;
      return { row, settings: settingsOf(row), company: toStatementCompany(row) };
    }, { operationName: "useStatementCompany" }),
  });
}

/** Save letterhead/payment overrides into companies.settings.statement (other settings keys untouched). */
export function useSaveStatementCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, settings }: { companyId: string; settings: StatementCompanySettings }) => {
      const supabase = createClient();
      const { data: cur, error: readErr } = await supabase
        .from("companies")
        .select("settings")
        .eq("id", companyId)
        .single();
      if (readErr) throw readErr;
      const base = (cur?.settings && typeof cur.settings === "object" && !Array.isArray(cur.settings))
        ? (cur.settings as Record<string, Json>)
        : {};
      const cleaned = Object.fromEntries(
        Object.entries(settings).map(([k, v]) => [k, typeof v === "string" ? (v.trim() || null) : v ?? null]),
      ) as Record<string, Json>;
      const { error } = await supabase
        .from("companies")
        .update({ settings: { ...base, statement: cleaned } })
        .eq("id", companyId);
      if (error) throw error;
      return companyId;
    },
    onSuccess: (companyId) => {
      qc.invalidateQueries({ queryKey: COMPANY_KEY(companyId) });
    },
  });
}

// ─── Authorised signatory signature (private bucket) ────────────────────────

export const COMPANY_PRIVATE_BUCKET = "company-private";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read the signature"));
    r.readAsDataURL(blob);
  });
}

/**
 * Downloads the signature with the signed-in user's session (RLS: company
 * members only) and returns it as a data: URL for the PDF and preview.
 */
export function useCompanySignature(path: string | null | undefined) {
  return useQuery({
    queryKey: ["company-signature", path],
    enabled: Boolean(path),
    staleTime: 30 * 60_000,
    queryFn: wrapQueryFn(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from(COMPANY_PRIVATE_BUCKET).download(path!);
      if (error) throw error;
      return blobToDataUrl(data);
    }, { operationName: "useCompanySignature" }),
  });
}

/** Upload a new signature and point companies.settings.statement.signaturePath at it. */
export function useUploadCompanySignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, file, previousPath }: { companyId: string; file: File; previousPath?: string | null }) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
      if (file.size > 2 * 1024 * 1024) throw new Error("The image must be under 2 MB.");
      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${companyId}/signature-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(COMPANY_PRIVATE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;

      const { data: cur, error: readErr } = await supabase.from("companies").select("settings").eq("id", companyId).single();
      if (readErr) throw readErr;
      const base = (cur?.settings && typeof cur.settings === "object" && !Array.isArray(cur.settings))
        ? (cur.settings as Record<string, Json>)
        : {};
      const statement = (base.statement && typeof base.statement === "object" && !Array.isArray(base.statement))
        ? (base.statement as Record<string, Json>)
        : {};
      const { error } = await supabase
        .from("companies")
        .update({ settings: { ...base, statement: { ...statement, signaturePath: path } } })
        .eq("id", companyId);
      if (error) throw error;

      if (previousPath && previousPath !== path) {
        // Best effort: an orphaned old signature is harmless.
        await supabase.storage.from(COMPANY_PRIVATE_BUCKET).remove([previousPath]);
      }
      return { companyId, path };
    },
    onSuccess: ({ companyId }) => {
      qc.invalidateQueries({ queryKey: COMPANY_KEY(companyId) });
    },
  });
}
