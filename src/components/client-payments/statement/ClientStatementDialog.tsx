"use client";

/**
 * Share a Statement of Account with the client.
 *
 * Left: what goes on the statement (title, as-on date, when the balance is
 * due, who it's for, message language, letterhead/payment details).
 * Right: live paper preview. Bottom: Share on WhatsApp / Download PDF / Copy.
 *
 * Sharing:
 *  - Phones: the native share sheet carries the PDF file *and* the message,
 *    so it lands in WhatsApp in one step.
 *  - Desktop: the PDF downloads and WhatsApp opens on the client's chat with
 *    the message prefilled; the user attaches the downloaded PDF.
 * The PDF is pre-rendered in the background as options change so the tap
 * stays within the browser's user-gesture window (navigator.share needs it).
 *
 * Every share/download saves a numbered snapshot in client_statements.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton,
  InputLabel, MenuItem, Select, Stack, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import {
  Close, ContentCopy, DeleteOutline, Download, Draw, ExpandMore, Refresh, WhatsApp,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { Database } from "@/types/database.types";
import type { SiteAdditionalWork } from "@/types/site.types";
import {
  buildClientStatement,
  formatRupees,
  greetingNameFrom,
  makeStatementNo,
  type StatementCompanySettings,
  type StatementDue,
  type StatementTitleVariant,
} from "@/lib/client-statement/buildClientStatement";
import {
  buildStatementMessage,
  statementFileName,
  type StatementMessageLang,
} from "@/lib/client-statement/statementMessage";
import { whatsappHref } from "@/lib/utils/contact";
import { useSiteClients } from "@/hooks/queries/useSiteClients";
import {
  toStatementCompany,
  useClientStatements,
  useRecordClientStatement,
  useSaveStatementCompanySettings,
  useStatementCompany,
  useCompanySignature,
  useUploadCompanySignature,
  type ClientStatementRow,
  type StatementSentVia,
} from "@/hooks/queries/useClientStatements";
import { useToast } from "@/contexts/ToastContext";
import ClientStatementPreview from "./ClientStatementPreview";

type Site = Database["public"]["Tables"]["sites"]["Row"];
type ClientPayment = Database["public"]["Tables"]["client_payments"]["Row"];

type DueKind = StatementDue["kind"];

interface StoredOptions {
  titleVariant?: StatementTitleVariant;
  dueKind?: DueKind;
  dueDate?: string;
  lang?: StatementMessageLang;
  recipientId?: string | null;
}

const optionsKey = (siteId: string) => `client-statement.options.${siteId}`;

function readStored(siteId: string): StoredOptions {
  try {
    const raw = window.localStorage.getItem(optionsKey(siteId));
    return raw ? (JSON.parse(raw) as StoredOptions) : {};
  } catch {
    return {};
  }
}

function writeStored(siteId: string, v: StoredOptions) {
  try { window.localStorage.setItem(optionsKey(siteId), JSON.stringify(v)); } catch { /* private mode */ }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const COMPANY_FIELDS: Array<{ key: keyof StatementCompanySettings; label: string; multiline?: boolean; placeholder?: string; half?: boolean }> = [
  { key: "address", label: "Office address", multiline: true, placeholder: "Door no, street\nArea" },
  { key: "phone", label: "Phone", half: true },
  { key: "email", label: "Email", half: true },
  { key: "accountName", label: "Account name", half: true },
  { key: "bankName", label: "Bank & branch", half: true },
  { key: "accountNo", label: "Account number", half: true },
  { key: "ifsc", label: "IFSC", half: true },
  { key: "upiId", label: "UPI ID", placeholder: "name@bank" },
  { key: "signatoryName", label: "Name under the signature", placeholder: "e.g. M. Hari, Managing Partner" },
  { key: "footerNote", label: "Note at the end of the statement", multiline: true, placeholder: "e.g. Warranty and maintenance details will be shared at handover." },
];

export interface ClientStatementDialogProps {
  open: boolean;
  onClose: () => void;
  site: Site;
  works: SiteAdditionalWork[];
  payments: ClientPayment[];
}

export function ClientStatementDialog({ open, onClose, site, works, payments }: ClientStatementDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const { showSuccess, showError, showWarning } = useToast();

  const clientsQ = useSiteClients(site.id);
  const companyQ = useStatementCompany(site.company_id);
  const statementsQ = useClientStatements(site.id);
  const recordStatement = useRecordClientStatement();
  const saveCompany = useSaveStatementCompanySettings();
  const uploadSignature = useUploadCompanySignature();
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const today = dayjs().format("YYYY-MM-DD");

  // ── Options ────────────────────────────────────────────────────────────────
  const [titleVariant, setTitleVariant] = useState<StatementTitleVariant>("statement");
  const [asOfDate, setAsOfDate] = useState(today);
  const [dueKind, setDueKind] = useState<DueKind>("none");
  const [dueDate, setDueDate] = useState(dayjs().add(2, "day").format("YYYY-MM-DD"));
  const [lang, setLang] = useState<StatementMessageLang>("en");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [greetingName, setGreetingName] = useState("");
  const [messageOverride, setMessageOverride] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState<StatementCompanySettings>({});
  const [mobileTab, setMobileTab] = useState<"setup" | "preview">("setup");
  const [notice, setNotice] = useState<{ severity: "success" | "info" | "warning"; text: string } | null>(null);

  // Restore remembered options each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const s = readStored(site.id);
    setTitleVariant(s.titleVariant ?? "statement");
    setAsOfDate(dayjs().format("YYYY-MM-DD"));
    setDueKind(s.dueKind ?? "none");
    setDueDate(s.dueDate && s.dueDate >= dayjs().format("YYYY-MM-DD") ? s.dueDate : dayjs().add(2, "day").format("YYYY-MM-DD"));
    setLang(s.lang ?? "en");
    setIncludeNotes(false);
    setRecipientId(s.recipientId ?? null);
    setMessageOverride(null);
    setNotice(null);
    setMobileTab("setup");
  }, [open, site.id]);

  useEffect(() => {
    if (!open) return;
    writeStored(site.id, { titleVariant, dueKind, dueDate, lang, recipientId });
  }, [open, site.id, titleVariant, dueKind, dueDate, lang, recipientId]);

  // Recipient defaults: remembered → primary client → first client → legacy site fields.
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const recipient = useMemo(() => {
    const c = clients.find((x) => x.id === recipientId) ?? clients.find((x) => x.is_primary) ?? clients[0];
    if (c) return { clientId: c.id, name: c.name, phone: c.phone };
    return { clientId: null, name: site.client_name ?? "", phone: site.client_contact };
  }, [clients, recipientId, site.client_name, site.client_contact]);

  useEffect(() => {
    if (!open) return;
    setPhone(recipient.phone ?? "");
    setGreetingName(greetingNameFrom(recipient.name));
  }, [open, recipient.clientId, recipient.name, recipient.phone]);

  // Company draft follows the saved settings whenever they (re)load.
  useEffect(() => {
    if (companyQ.data) setCompanyDraft(companyQ.data.settings);
  }, [companyQ.data]);

  const signatureQ = useCompanySignature(companyDraft.signaturePath ?? null);
  const signatureDataUrl = signatureQ.data ?? null;

  const company = useMemo(() => {
    const row = companyQ.data?.row;
    const c = row
      ? toStatementCompany({
          ...row,
          settings: {
            ...((row.settings && typeof row.settings === "object" && !Array.isArray(row.settings)) ? row.settings : {}),
            statement: companyDraft,
          } as never,
        })
      : toStatementCompany({ id: "", name: "Aesta", code: "AESTA", address: null, city: null, state: null, phone: null, email: null, gst_number: null, logo_url: null, settings: { statement: companyDraft } as never });
    return { ...c, signatureDataUrl };
  }, [companyQ.data, companyDraft, signatureDataUrl]);

  const companyDirty = useMemo(() => {
    const saved = companyQ.data?.settings ?? {};
    const norm = (o: StatementCompanySettings) =>
      JSON.stringify([...COMPANY_FIELDS.map((f) => (o[f.key] ?? "").toString().trim()), o.signaturePath ?? ""]);
    return norm(saved) !== norm(companyDraft);
  }, [companyQ.data, companyDraft]);

  // ── Statement model ───────────────────────────────────────────────────────
  const due: StatementDue = dueKind === "none" ? { kind: "none" } : { kind: dueKind, date: dueDate };
  const nextSeq = (statementsQ.data?.[0]?.seq ?? 0) + 1;
  const [recorded, setRecorded] = useState<{ key: string; row: ClientStatementRow } | null>(null);

  const primaryClientName = (clients.find((c) => c.is_primary) ?? clients[0])?.name ?? site.client_name;
  const draft = useMemo(() => buildClientStatement({
    site: { name: site.name, address: site.address, city: site.city, contractValue: site.project_contract_value },
    company,
    recipient: { name: recipient.name, phone: phone.trim() || null, clientId: recipient.clientId },
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    // Older entries often have no approver/payer recorded: the owner approved and paid.
    defaultApprover: primaryClientName,
    defaultPayer: primaryClientName,
    works,
    payments,
    options: { asOfDate, titleVariant, due, includeNotes, statementNo: "" },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `due` is derived from dueKind/dueDate
  }), [site, company, recipient, phone, clients, primaryClientName, works, payments, asOfDate, titleVariant, dueKind, dueDate, includeNotes]);

  const contentKey = useMemo(() => JSON.stringify(draft), [draft]);
  const statementNo = recorded && recorded.key === contentKey
    ? recorded.row.statement_no
    : makeStatementNo(company.code, site.name, asOfDate, nextSeq);
  const statement = useMemo(() => ({ ...draft, statementNo }), [draft, statementNo]);
  const statementKey = useMemo(() => JSON.stringify(statement), [statement]);

  const derivedMessage = useMemo(
    () => buildStatementMessage({ statement, greetingName, lang }),
    [statement, greetingName, lang],
  );
  // Any change to the figures/options resets hand edits so a stale amount can never be sent.
  useEffect(() => { setMessageOverride(null); }, [derivedMessage]);
  const message = messageOverride ?? derivedMessage;

  // ── PDF pre-render ────────────────────────────────────────────────────────
  const [pdfState, setPdfState] = useState<{ key: string; blob: Blob } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const latestKey = useRef(statementKey);
  latestKey.current = statementKey;

  const renderPdf = useCallback(async (st: typeof statement): Promise<Blob> => {
    const mod = await import("./ClientStatementPdf");
    return mod.renderClientStatementPdf(st);
  }, []);

  useEffect(() => {
    if (!open || companyQ.isLoading || clientsQ.isLoading) return;
    let cancelled = false;
    const key = statementKey;
    const st = statement;
    const t = setTimeout(() => {
      renderPdf(st)
        .then((blob) => { if (!cancelled && latestKey.current === key) { setPdfState({ key, blob }); setPdfError(null); } })
        .catch((e) => { if (!cancelled) setPdfError(e instanceof Error ? e.message : "Could not prepare the PDF"); });
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, statementKey, statement, renderPdf, companyQ.isLoading, clientsQ.isLoading]);

  const pdfReady = pdfState?.key === statementKey;
  const getPdf = useCallback(async () => (pdfReady && pdfState ? pdfState.blob : renderPdf(statement)), [pdfReady, pdfState, renderPdf, statement]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState<StatementSentVia | null>(null);

  const record = useCallback(async (via: StatementSentVia) => {
    if (recorded && recorded.key === contentKey) return;
    try {
      const row = await recordStatement.mutateAsync({ siteId: site.id, seq: nextSeq, statement, sentVia: via });
      setRecorded({ key: contentKey, row });
    } catch (e) {
      // Never block the share itself on the history write.
      console.warn("[ClientStatement] could not save statement history", e);
      showWarning("Statement shared, but it couldn't be saved to the history.");
    }
  }, [recorded, contentKey, recordStatement, site.id, nextSeq, statement, showWarning]);

  const copyMessage = useCallback(async (silent = false) => {
    try {
      await navigator.clipboard.writeText(message);
      if (!silent) showSuccess("Message copied");
      return true;
    } catch {
      if (!silent) showError("Couldn't copy. Select the message text and copy it manually.");
      return false;
    }
  }, [message, showSuccess, showError]);

  const handleDownload = async () => {
    setBusy("download");
    try {
      const blob = await getPdf();
      downloadBlob(blob, statementFileName(statement));
      await record("download");
      setNotice({ severity: "success", text: `PDF downloaded: ${statementFileName(statement)}` });
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not create the PDF");
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    const fileName = statementFileName(statement);
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    let canShareFiles = false;
    try {
      canShareFiles = Boolean(coarse && navigator.canShare?.({ files: [new File([""], fileName, { type: "application/pdf" })] }));
    } catch { canShareFiles = false; }

    if (canShareFiles) {
      setBusy("share");
      try {
        // Some WhatsApp builds drop the caption when a file is attached — keep it on the clipboard too.
        const copied = await copyMessage(true);
        const blob = await getPdf();
        await navigator.share({ files: [new File([blob], fileName, { type: "application/pdf" })], text: message, title: statement.title });
        await record("share");
        setNotice({
          severity: "success",
          text: copied
            ? "Shared. If WhatsApp didn't include the message, paste it. It's on your clipboard."
            : "Shared.",
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === "AbortError") return; // user closed the share sheet
        if (name === "NotAllowedError") {
          setNotice({ severity: "info", text: "The PDF is ready now. Tap “Share on WhatsApp” again." });
          return;
        }
        showError(e instanceof Error ? e.message : "Sharing failed");
      } finally {
        setBusy(null);
      }
      return;
    }

    // Desktop: open the chat in the same gesture (avoids popup blocking), then download the PDF.
    setBusy("whatsapp");
    const url = whatsappHref(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
    const win = window.open("about:blank", "_blank");
    try {
      const blob = await getPdf();
      downloadBlob(blob, fileName);
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener");
      await record("whatsapp");
      setNotice({ severity: "info", text: `WhatsApp opened with the message. Attach the downloaded PDF (${fileName}) in that chat.` });
    } catch (e) {
      win?.close();
      showError(e instanceof Error ? e.message : "Could not create the PDF");
    } finally {
      setBusy(null);
    }
  };

  const handleSignatureFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !site.company_id) return;
    try {
      const { path } = await uploadSignature.mutateAsync({
        companyId: site.company_id,
        file,
        previousPath: companyQ.data?.settings.signaturePath ?? null,
      });
      setCompanyDraft((d) => ({ ...d, signaturePath: path }));
      showSuccess("Signature saved");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not upload the signature");
    }
  };

  const handleSaveCompany = async () => {
    if (!site.company_id) return;
    try {
      await saveCompany.mutateAsync({ companyId: site.company_id, settings: companyDraft });
      showSuccess("Company details saved for all statements");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not save company details");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const lastSent = statementsQ.data?.[0];
  const balanceLine = statement.summary.credit > 0
    ? `Excess received ${formatRupees(statement.summary.credit)}`
    : statement.summary.balanceDue > 0
      ? `Balance ${formatRupees(statement.summary.balanceDue)}`
      : "Fully settled";

  const setup = (
    <Stack spacing={2.25} sx={{ p: { xs: 2, md: 2.5 } }}>
      <Box>
        <Typography variant="overline" color="text.secondary" component="div" sx={{ lineHeight: 1.6 }}>Document</Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          color="primary"
          value={titleVariant}
          onChange={(_, v: StatementTitleVariant | null) => v && setTitleVariant(v)}
          aria-label="Document type"
        >
          <ToggleButton value="statement" sx={{ minHeight: 44, textTransform: "none" }}>Statement of Account</ToggleButton>
          <ToggleButton value="final" sx={{ minHeight: 44, textTransform: "none" }}>Final settlement</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Stack direction="row" spacing={1.5}>
        <TextField
          label="As on"
          type="date"
          size="small"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value || today)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
          helperText="Payments after this date are left out"
          sx={{ flex: 1 }}
        />
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <FormControl size="small" sx={{ flex: 1.2 }}>
          <InputLabel id="stmt-due-label">Balance due</InputLabel>
          <Select labelId="stmt-due-label" label="Balance due" value={dueKind} onChange={(e) => setDueKind(e.target.value as DueKind)}>
            <MenuItem value="none">No due date</MenuItem>
            <MenuItem value="handover">At key handover</MenuItem>
            <MenuItem value="date">By a date</MenuItem>
          </Select>
        </FormControl>
        {dueKind !== "none" && (
          <TextField
            label={dueKind === "handover" ? "Handover date" : "Pay by"}
            type="date"
            size="small"
            value={dueDate}
            onChange={(e) => e.target.value && setDueDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: 1 }}
          />
        )}
      </Stack>

      <Divider />

      <Box>
        <Typography variant="overline" color="text.secondary" component="div" sx={{ lineHeight: 1.6 }}>Send to</Typography>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {clients.length > 0 && (
            <FormControl size="small" fullWidth>
              <InputLabel id="stmt-recipient-label">Client</InputLabel>
              <Select
                labelId="stmt-recipient-label"
                label="Client"
                value={recipient.clientId ?? ""}
                onChange={(e) => setRecipientId(String(e.target.value))}
              >
                {clients.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}{c.role ? ` · ${c.role}` : ""}{c.is_primary ? " (primary)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="WhatsApp number"
              size="small"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "tel" } }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Greet as"
              size="small"
              value={greetingName}
              onChange={(e) => setGreetingName(e.target.value)}
              helperText={`“Dear ${greetingName.trim() || "Sir/Madam"},”`}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Stack>
      </Box>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>Message</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={lang}
            onChange={(_, v: StatementMessageLang | null) => v && setLang(v)}
            aria-label="Message language"
          >
            <ToggleButton value="en" sx={{ px: 1.5, textTransform: "none" }}>English</ToggleButton>
            <ToggleButton value="ta" sx={{ px: 1.5, textTransform: "none" }}>தமிழ்</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <TextField
          multiline
          fullWidth
          minRows={6}
          maxRows={14}
          value={message}
          onChange={(e) => setMessageOverride(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "WhatsApp message" } }}
          sx={{ "& textarea": { fontSize: 13.5, lineHeight: 1.5 } }}
        />
        {messageOverride !== null && (
          <Button size="small" startIcon={<Refresh />} onClick={() => setMessageOverride(null)} sx={{ mt: 0.5 }}>
            Reset to suggested message
          </Button>
        )}
      </Box>

      <FormControlLabel
        control={<Switch checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />}
        label={
          <Box component="span" sx={{ display: "flex", flexDirection: "column" }}>
            <Typography component="span" variant="body2">Include payment notes &amp; remarks</Typography>
            <Typography component="span" variant="caption" color="text.secondary">
              Off by default: notes and free-text references are often internal. Transaction IDs (UTR, cheque no.) always show.
            </Typography>
          </Box>
        }
      />

      <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1, "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box>
            <Typography variant="body2" fontWeight={600}>Letterhead & payment details</Typography>
            <Typography variant="caption" color="text.secondary">
              {company.payment.upiId || company.payment.accountNo ? "Bank/UPI details shown on the statement" : "Add your address, bank or UPI details"}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            {COMPANY_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                size="small"
                placeholder={f.placeholder}
                multiline={f.multiline}
                minRows={f.multiline ? 2 : undefined}
                value={companyDraft[f.key] ?? ""}
                onChange={(e) => setCompanyDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                sx={{ gridColumn: f.half ? "span 1" : "1 / -1" }}
              />
            ))}
          </Box>
          <Box sx={{ mt: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="body2" fontWeight={600}>Authorised signature</Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
              Printed above &ldquo;For {company.name}&rdquo;. Stored privately: only your team can load it.
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 132, height: 64, borderRadius: 1, bgcolor: "#fff", border: 1, borderColor: "divider",
                  display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0,
                }}
              >
                {signatureQ.isLoading ? (
                  <CircularProgress size={18} />
                ) : signatureDataUrl ? (
                  <Box component="img" src={signatureDataUrl} alt="Current signature" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <Typography variant="caption" color="text.secondary">No signature</Typography>
                )}
              </Box>
              <Stack spacing={0.75}>
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={handleSignatureFile}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={uploadSignature.isPending ? <CircularProgress size={14} /> : <Draw />}
                  onClick={() => signatureInputRef.current?.click()}
                  disabled={uploadSignature.isPending || !site.company_id}
                >
                  {signatureDataUrl ? "Replace" : "Upload signature"}
                </Button>
                {companyDraft.signaturePath && (
                  <Button
                    size="small"
                    color="inherit"
                    startIcon={<DeleteOutline />}
                    onClick={() => setCompanyDraft((d) => ({ ...d, signaturePath: null }))}
                  >
                    Don&apos;t use
                  </Button>
                )}
              </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              Tip: a PNG with a transparent or white background looks best.
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Saved for every site&apos;s statements.</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSaveCompany}
              disabled={!companyDirty || saveCompany.isPending || !site.company_id}
              startIcon={saveCompany.isPending ? <CircularProgress size={14} /> : undefined}
            >
              Save details
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {lastSent && (
        <Typography variant="caption" color="text.secondary">
          Last sent: {lastSent.statement_no} on {dayjs(lastSent.created_at).format("DD MMM YYYY, h:mm A")}
        </Typography>
      )}
    </Stack>
  );

  const preview = (
    <Box sx={{ p: { xs: 1.5, md: 3 }, bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.100", minHeight: "100%" }}>
      <ClientStatementPreview statement={statement} />
    </Box>
  );

  const primaryBusy = busy === "share" || busy === "whatsapp";

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="xl"
      aria-labelledby="client-statement-title"
      slotProps={{ paper: { sx: { height: fullScreen ? "100%" : "92vh" } } }}
    >
      <DialogTitle id="client-statement-title" sx={{ pr: 7, pb: 1 }}>
        <Typography variant="h6" component="span" sx={{ display: "block", lineHeight: 1.3 }}>Share statement with client</Typography>
        <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
          {site.name} · {statement.statementNo} · {balanceLine}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} disabled={Boolean(busy)} sx={{ position: "absolute", right: 12, top: 12 }}>
          <Close />
        </IconButton>
      </DialogTitle>

      {fullScreen && (
        <Tabs value={mobileTab} onChange={(_, v) => setMobileTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tab value="setup" label="Details" />
          <Tab value="preview" label="Preview" />
        </Tabs>
      )}

      <DialogContent dividers sx={{ p: 0, display: "flex", minHeight: 0 }}>
        {fullScreen ? (
          <Box sx={{ flex: 1, overflowY: "auto" }}>{mobileTab === "setup" ? setup : preview}</Box>
        ) : (
          <>
            <Box sx={{ width: 420, flexShrink: 0, overflowY: "auto", borderRight: 1, borderColor: "divider" }}>{setup}</Box>
            <Box sx={{ flex: 1, overflowY: "auto" }}>{preview}</Box>
          </>
        )}
      </DialogContent>

      {(notice || pdfError) && (
        <Box sx={{ px: 2, pt: 1.5 }}>
          {pdfError ? (
            <Alert severity="error" onClose={() => setPdfError(null)}>PDF could not be prepared: {pdfError}</Alert>
          ) : notice ? (
            <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>
          ) : null}
        </Box>
      )}

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: "wrap", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 1 }}>
          {pdfReady ? "PDF ready" : (<><CircularProgress size={12} /> Preparing PDF…</>)}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flex: { xs: 1, sm: "initial" }, justifyContent: "flex-end" }}>
          <Tooltip title="Copy the message only">
            <span>
              <Button onClick={() => copyMessage()} startIcon={<ContentCopy />} sx={{ minHeight: 44 }} disabled={Boolean(busy)}>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Copy message</Box>
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>Copy</Box>
              </Button>
            </span>
          </Tooltip>
          <Button
            variant="outlined"
            onClick={handleDownload}
            disabled={Boolean(busy)}
            startIcon={busy === "download" ? <CircularProgress size={16} /> : <Download />}
            sx={{ minHeight: 44 }}
          >
            PDF
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleShare}
            disabled={Boolean(busy) || (!pdfReady && fullScreen)}
            startIcon={primaryBusy || (!pdfReady && fullScreen) ? <CircularProgress size={16} color="inherit" /> : <WhatsApp />}
            sx={{ minHeight: 44, flex: { xs: 1, sm: "initial" }, whiteSpace: "nowrap" }}
          >
            Share on WhatsApp
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

export default ClientStatementDialog;
