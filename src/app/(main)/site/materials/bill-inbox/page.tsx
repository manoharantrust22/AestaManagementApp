"use client";

/**
 * Bill Inbox (procurement P1): photo-first capture of purchase bills.
 *
 * Snap a bill with zero required fields. The photo is kept on the phone and
 * uploaded in the background (works with no signal), read by the server, and
 * waits here until someone checks it and saves it as a purchase. Unknown shop
 * names can be added later by anyone; every such fill goes to the review queue.
 * See docs/analysis/procurement-gap-analysis.md section 6 and 8.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import dayjs from "dayjs";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  CameraAlt as CameraIcon,
  CloudOff as OfflineIcon,
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ReceiptLong as BillIcon,
} from "@mui/icons-material";

import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { formatCurrencyFull } from "@/lib/formatters";
import {
  ACCEPTED_BILL_TYPES,
  drainQueue,
  enqueueBills,
  removeQueued,
  requestRead,
  subscribeQueue,
} from "@/lib/bill-inbox/queue";
import { DOC_KIND_LABEL } from "@/lib/bill-inbox/schema";
import {
  billFileUrl,
  usePurchaseDocuments,
  useReadBill,
  useUpdateBill,
  type BillInboxTab,
} from "@/hooks/queries/usePurchaseDocuments";
import BillReviewDialog from "@/components/bill-inbox/BillReviewDialog";
import VendorNameField from "@/components/bill-inbox/VendorNameField";
import { DOC_STATUS_LABEL, type PurchaseDocument, type QueuedBill } from "@/types/bill-inbox.types";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<PurchaseDocument["status"], "default" | "info" | "warning" | "success" | "error"> = {
  uploaded: "default",
  extracting: "info",
  needs_review: "warning",
  confirmed: "success",
  rejected: "default",
  failed: "error",
};

/** A read that has not finished in this long is treated as stuck. */
const STUCK_MS = 3 * 60 * 1000;

export default function BillInboxPage() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id ?? null;

  const [tab, setTab] = useState<BillInboxTab>("to_check");
  const [queue, setQueue] = useState<QueuedBill[]>([]);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<PurchaseDocument | null>(null);
  const [naming, setNaming] = useState<PurchaseDocument | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading, error } = usePurchaseDocuments(siteId, tab);
  const { data: toCheck = [] } = usePurchaseDocuments(siteId, "to_check");
  const readBill = useReadBill();

  useEffect(() => subscribeQueue(setQueue), []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Bills that were uploaded but never read (e.g. the phone went offline right after upload): read them once.
  const autoRead = useRef(new Set<string>());
  useEffect(() => {
    if (!userProfile?.id) return;
    for (const d of toCheck) {
      if (d.status !== "uploaded" || d.uploaded_by !== userProfile.id || autoRead.current.has(d.id)) continue;
      if (Date.now() - dayjs(d.created_at).valueOf() < 30_000) continue;
      autoRead.current.add(d.id);
      void requestRead(d.id);
    }
  }, [toCheck, userProfile?.id]);

  const myQueue = useMemo(() => queue.filter((q) => q.siteId === siteId), [queue, siteId]);
  const otherSiteQueue = queue.length - myQueue.length;

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const { queued, refused } = await enqueueBills(Array.from(list), siteId);
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
    const parts: string[] = [];
    if (queued > 0) parts.push(`${queued} bill${queued === 1 ? "" : "s"} saved on this phone${online ? ", uploading" : ". Will upload when online"}.`);
    if (refused.length > 0) parts.push(`Not added: ${refused.join("; ")}`);
    setToast(parts.join(" "));
  };

  if (!siteId) {
    return (
      <Box sx={{ maxWidth: 960, mx: "auto", p: 2 }}>
        <Alert severity="warning">Pick a site from the menu to capture bills.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", pb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <BillIcon color="primary" sx={{ fontSize: 32 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700}>
            Bill Inbox
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Snap the bill now. Check and save it later, from here or the office.
          </Typography>
        </Box>
      </Stack>

      {/* Capture */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<CameraIcon />}
          onClick={() => cameraRef.current?.click()}
          sx={{ py: 1.75, flex: 1, fontSize: 16 }}
        >
          Snap a bill
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<UploadIcon />}
          onClick={() => uploadRef.current?.click()}
          sx={{ py: 1.75, flex: 1 }}
        >
          Upload photos or PDF
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <input ref={uploadRef} type="file" accept={ACCEPTED_BILL_TYPES} multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </Stack>

      {/* On this phone, not uploaded yet */}
      {(myQueue.length > 0 || otherSiteQueue > 0) && (
        <Card variant="outlined" sx={{ mb: 2, p: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: myQueue.length ? 1 : 0 }}>
            {!online && <OfflineIcon fontSize="small" color="warning" />}
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              {online ? "Uploading from this phone" : "No signal. Bills are safe on this phone and will upload later."}
            </Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={() => void drainQueue()} disabled={!online}>
              Retry now
            </Button>
          </Stack>
          {myQueue.map((q) => (
            <Stack key={q.localId} direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
              {q.state === "uploading" ? <CircularProgress size={16} /> : <UploadIcon fontSize="small" color="disabled" />}
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {q.fileName} · {(q.size / 1e6).toFixed(1)} MB
                {q.state === "failed" && q.lastError ? ` · ${q.lastError}` : ""}
              </Typography>
              {q.state !== "uploading" && (
                <IconButton size="small" aria-label="remove from phone" onClick={() => void removeQueued(q.localId)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          ))}
          {otherSiteQueue > 0 && (
            <Typography variant="caption" color="text.secondary">
              {otherSiteQueue} more waiting for other sites.
            </Typography>
          )}
        </Card>
      )}

      <Tabs value={tab} onChange={(_, v: BillInboxTab) => setTab(v)} sx={{ mb: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Tab
          value="to_check"
          label={
            <Badge color="warning" badgeContent={toCheck.length} max={99} sx={{ pr: toCheck.length ? 1.5 : 0 }}>
              To check
            </Badge>
          }
        />
        <Tab value="saved" label="Saved" />
        <Tab value="rejected" label="Rejected" />
      </Tabs>

      {error && <Alert severity="error">Could not load bills: {(error as Error).message}</Alert>}

      {isLoading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : docs.length === 0 ? (
        <Alert severity={tab === "to_check" ? "success" : "info"}>
          {tab === "to_check" ? "Nothing to check. Snap a bill when you buy something." : "No bills here yet."}
        </Alert>
      ) : (
        <Stack spacing={1}>
          {docs.map((d) => (
            <BillCard
              key={d.id}
              doc={d}
              reading={readBill.isPending && readBill.variables === d.id}
              onOpen={() => setReviewing(d)}
              onRead={() => readBill.mutate(d.id, { onError: (e) => setToast((e as Error).message) })}
              onAddName={() => setNaming(d)}
            />
          ))}
        </Stack>
      )}

      {reviewing && <BillReviewDialog doc={reviewing} onClose={() => setReviewing(null)} />}
      {naming && <AddShopNameDialog doc={naming} onClose={() => setNaming(null)} />}

      <Snackbar
        open={!!toast}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}

function BillCard({
  doc,
  reading,
  onOpen,
  onRead,
  onAddName,
}: {
  doc: PurchaseDocument;
  reading: boolean;
  onOpen: () => void;
  onRead: () => void;
  onAddName: () => void;
}) {
  const thumb = doc.preview_path ? billFileUrl(doc.preview_path, doc.storage_bucket) : null;
  const stuck = doc.status === "extracting" && Date.now() - dayjs(doc.updated_at).valueOf() > STUCK_MS;
  const canRead = doc.status === "failed" || doc.status === "uploaded" || stuck || doc.status === "needs_review";
  const canOpen = doc.status === "needs_review" || doc.status === "confirmed" || doc.status === "rejected";
  const date = doc.invoice_date ?? doc.captured_at;

  return (
    <Card variant="outlined">
      <CardActionArea onClick={canOpen ? onOpen : undefined} disabled={!canOpen} sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: 1,
              bgcolor: "grey.100",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {thumb ? (
              <Box component="img" src={thumb} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <BillIcon color="disabled" />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ maxWidth: "100%" }}>
                {doc.vendor_name ?? (doc.status === "needs_review" ? "Shop name needed" : "Bill")}
              </Typography>
              <Chip
                size="small"
                color={stuck ? "error" : STATUS_COLOR[doc.status]}
                label={stuck ? "Reading took too long" : DOC_STATUS_LABEL[doc.status]}
                icon={doc.status === "extracting" && !stuck ? <CircularProgress size={12} sx={{ ml: 0.5 }} /> : undefined}
              />
              {doc.duplicate_of_id && <Chip size="small" color="warning" variant="outlined" label="Possible duplicate" />}
            </Stack>
            <Typography variant="body2" color="text.secondary" noWrap>
              {[
                doc.doc_kind !== "unknown" ? DOC_KIND_LABEL[doc.doc_kind] : null,
                dayjs(date).format("DD MMM YYYY"),
                doc.total_amount != null ? formatCurrencyFull(doc.total_amount) : null,
                doc.invoice_no ? `No. ${doc.invoice_no}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
            {doc.status === "failed" && doc.extraction_error && (
              <Typography variant="caption" color="error.main" component="div" noWrap>
                {doc.extraction_error}
              </Typography>
            )}
            {doc.uploader?.name && (
              <Typography variant="caption" color="text.secondary" component="div">
                Snapped by {doc.uploader.name} {dayjs(doc.captured_at).format("DD MMM, h:mm A")}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardActionArea>
      {(canRead || doc.vendor_name_pending || doc.purchase) && (
        <Stack direction="row" spacing={1} sx={{ px: 1.5, pb: 1.25 }} flexWrap="wrap" useFlexGap>
          {doc.vendor_name_pending && doc.status !== "rejected" && (
            <Button size="small" variant="outlined" color="warning" onClick={onAddName}>
              Add shop name
            </Button>
          )}
          {doc.status === "needs_review" && (
            <Button size="small" variant="contained" onClick={onOpen}>
              Check &amp; save
            </Button>
          )}
          {canRead && doc.status !== "needs_review" && (
            <Button size="small" startIcon={reading ? <CircularProgress size={14} /> : <RefreshIcon />} onClick={onRead} disabled={reading}>
              {doc.status === "uploaded" ? "Read now" : "Read again"}
            </Button>
          )}
          {doc.purchase && (
            <Button size="small" component={NextLink} href="/site/material-expenses">
              Purchase {doc.purchase.ref_code}
            </Button>
          )}
        </Stack>
      )}
    </Card>
  );
}

function AddShopNameDialog({ doc, onClose }: { doc: PurchaseDocument; onClose: () => void }) {
  const [name, setName] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const update = useUpdateBill();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add shop name</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The shop name is not on this bill
          {doc.total_amount != null ? ` (${formatCurrencyFull(doc.total_amount)})` : ""}. Whoever bought it, add where it
          came from. Office will check it.
        </Typography>
        {doc.preview_path && (
          <Box
            component="img"
            src={billFileUrl(doc.preview_path, doc.storage_bucket) ?? undefined}
            alt="Bill"
            sx={{ width: "100%", maxHeight: 220, objectFit: "contain", mb: 2, bgcolor: "grey.100", borderRadius: 1 }}
          />
        )}
        <VendorNameField
          value={name}
          vendorId={vendorId}
          autoFocus
          onChange={({ name: n, vendor }) => {
            setName(n);
            setVendorId(vendor?.id ?? null);
          }}
        />
        {update.error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {(update.error as Error).message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || update.isPending}
          onClick={() =>
            update.mutate({ id: doc.id, patch: { vendor_name: name.trim(), vendor_id: vendorId } }, { onSuccess: onClose })
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
