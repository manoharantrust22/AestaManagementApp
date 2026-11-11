"use client";

/**
 * Review queue (maker/checker).
 *
 * Anyone can make a change or raise a flag; admin/office approve, reject or
 * mark it fixed here. First use: the purchases where more was paid than billed
 * (paid must be <= billed). See docs/analysis/procurement-gap-analysis.md.
 */

import { useMemo, useState } from "react";
import NextLink from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FactCheck as ReviewIcon } from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { canResolveReviewFlags } from "@/lib/permissions";
import { formatCurrencyFull, formatDate } from "@/lib/formatters";
import {
  useFlaggedPurchases,
  useResolveReviewFlag,
  useReviewFlags,
} from "@/hooks/queries/useReviewFlags";
import {
  REVIEW_REASON_LABEL,
  REVIEW_STATUS_LABEL,
  type FlaggedPurchaseSnapshot,
  type ReviewFlag,
  type ReviewStatus,
} from "@/types/review.types";

export const dynamic = "force-dynamic";

type TabValue = ReviewStatus | "all";
const TABS: TabValue[] = ["open", "fixed", "approved", "rejected", "all"];

const STATUS_COLOR: Record<ReviewStatus, "warning" | "success" | "info" | "default"> = {
  open: "warning",
  fixed: "success",
  approved: "info",
  rejected: "default",
};

export default function ReviewQueuePage() {
  const { userProfile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabValue>("open");
  const [resolving, setResolving] = useState<{ flag: ReviewFlag; status: Exclude<ReviewStatus, "open"> } | null>(null);

  const { data: flags = [], isLoading, error } = useReviewFlags(tab);
  const purchaseIds = useMemo(
    () => flags.filter((f) => f.entity_type === "purchase_expense").map((f) => f.entity_id),
    [flags]
  );
  const { data: purchases = {} } = useFlaggedPurchases(purchaseIds);
  const canResolve = canResolveReviewFlags(userProfile?.role);

  if (authLoading) {
    return (
      <Box p={3} display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 960, mx: "auto" }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <ReviewIcon color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Review queue
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Anyone can correct a record; every correction is checked here by admin or office.
          </Typography>
        </Box>
      </Stack>

      {!canResolve && (
        <Alert severity="info" sx={{ my: 2 }}>
          You can see these items, but only admin or office staff can resolve them.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, v: TabValue) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
      >
        {TABS.map((t) => (
          <Tab key={t} value={t} label={t === "all" ? "All" : REVIEW_STATUS_LABEL[t]} />
        ))}
      </Tabs>

      {error && <Alert severity="error">Could not load the review queue: {(error as Error).message}</Alert>}

      {isLoading ? (
        <Box p={3} display="flex" justifyContent="center">
          <CircularProgress />
        </Box>
      ) : flags.length === 0 ? (
        <Alert severity="success">Nothing to review here.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              purchase={flag.entity_type === "purchase_expense" ? purchases[flag.entity_id] : undefined}
              canResolve={canResolve}
              onResolve={(status) => setResolving({ flag, status })}
            />
          ))}
        </Stack>
      )}

      {resolving && (
        <ResolveDialog
          flag={resolving.flag}
          status={resolving.status}
          onClose={() => setResolving(null)}
        />
      )}
    </Box>
  );
}

function FlagCard({
  flag,
  purchase,
  canResolve,
  onResolve,
}: {
  flag: ReviewFlag;
  purchase?: FlaggedPurchaseSnapshot;
  canResolve: boolean;
  onResolve: (status: Exclude<ReviewStatus, "open">) => void;
}) {
  const isPaidAbove = flag.reason === "paid_above_billed";
  const nowCorrected =
    isPaidAbove && purchase && (purchase.amount_paid == null || purchase.amount_paid <= purchase.total_amount);

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Chip size="small" color={STATUS_COLOR[flag.status]} label={REVIEW_STATUS_LABEL[flag.status]} />
          <Typography variant="subtitle2" fontWeight={700}>
            {REVIEW_REASON_LABEL[flag.reason]}
          </Typography>
          {nowCorrected && flag.status === "open" && (
            <Chip size="small" color="success" variant="outlined" label="Values now look correct" />
          )}
        </Stack>

        {isPaidAbove && purchase ? (
          <Box>
            <Typography variant="body2">
              <strong>{purchase.ref_code ?? "Purchase"}</strong>
              {purchase.vendor_name ? ` · ${purchase.vendor_name}` : ""}
              {purchase.purchase_date ? ` · ${formatDate(purchase.purchase_date)}` : ""}
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              <Typography variant="body2">Billed: {formatCurrencyFull(purchase.total_amount)}</Typography>
              <Typography variant="body2">Paid: {formatCurrencyFull(purchase.amount_paid)}</Typography>
              {!nowCorrected && purchase.amount_paid != null && (
                <Typography variant="body2" color="error.main" fontWeight={600}>
                  Extra: {formatCurrencyFull(purchase.amount_paid - purchase.total_amount)}
                </Typography>
              )}
            </Stack>
            {!nowCorrected && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                Paid must not exceed billed. Record the extra as transport, loading/unloading or a missing
                item on the bill, then mark this fixed.
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
            {Object.keys(flag.details ?? {}).length > 0 ? JSON.stringify(flag.details) : "No details"}
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {flag.site?.name ? `${flag.site.name} · ` : ""}
          Raised {formatDate(flag.created_at)} by {flag.raiser?.name ?? "system"}
          {flag.resolved_at
            ? ` · ${REVIEW_STATUS_LABEL[flag.status]} ${formatDate(flag.resolved_at)} by ${flag.resolver?.name ?? "unknown"}`
            : ""}
        </Typography>
        {flag.resolution_note && (
          <Typography variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }}>
            “{flag.resolution_note}”
          </Typography>
        )}
      </CardContent>

      <CardActions sx={{ px: 2, pb: 1.5, pt: 0, flexWrap: "wrap", gap: 1 }}>
        {isPaidAbove && (
          <Button size="small" component={NextLink} href="/site/material-expenses">
            Open material expenses
          </Button>
        )}
        {flag.status === "open" && canResolve && (
          <>
            <Box sx={{ flex: 1 }} />
            <Button size="small" color="inherit" onClick={() => onResolve("rejected")}>
              Reject
            </Button>
            <Button size="small" onClick={() => onResolve("approved")}>
              Approve
            </Button>
            <Button size="small" variant="contained" onClick={() => onResolve("fixed")}>
              Mark fixed
            </Button>
          </>
        )}
      </CardActions>
    </Card>
  );
}

function ResolveDialog({
  flag,
  status,
  onClose,
}: {
  flag: ReviewFlag;
  status: Exclude<ReviewStatus, "open">;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [note, setNote] = useState("");
  const resolve = useResolveReviewFlag();
  const noteRequired = status === "rejected";

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle>
        {REVIEW_STATUS_LABEL[status]}: {REVIEW_REASON_LABEL[flag.reason]}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          margin="dense"
          label={noteRequired ? "Reason (required)" : "Note (optional)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {resolve.error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {(resolve.error as Error).message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={resolve.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={resolve.isPending || (noteRequired && !note.trim())}
          onClick={() =>
            resolve.mutate({ id: flag.id, status, note }, { onSuccess: onClose })
          }
        >
          {resolve.isPending ? "Saving…" : "Confirm"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
