"use client";

/**
 * Lightweight audit panel for a single inventory card. Thin wrapper around the
 * shared <UsageLogList>, which owns the data fetching (useUsageLog) and the
 * row rendering used both here and inline on the Material Hub.
 *
 * Read-only here by default ("who recorded what, on which date, for what work").
 * Pass `canEdit` to surface the same Edit/Delete affordances the Hub uses.
 */

import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { hubTokens } from "@/lib/material-hub/tokens";
import UsageLogList from "@/components/inventory/UsageLogList";
import type { UsageLogItem } from "@/hooks/queries/useUsageLog";

/** Back-compat alias — the inventory page imports this name. */
export type UsageHistoryItem = UsageLogItem;

export interface UsageHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string | undefined;
  item: UsageHistoryItem | null;
  canEdit?: boolean;
}

export default function UsageHistoryDialog({
  open,
  onClose,
  siteId,
  item,
  canEdit = false,
}: UsageHistoryDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          py: 1.5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Usage history</Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            {item?.material_name ?? "—"}
            {item?.batch_code ? ` · ${item.batch_code}` : ""}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 2, py: 1 }}>
        <UsageLogList
          item={item}
          siteId={siteId}
          canEdit={canEdit}
          showHeader
          enabled={open}
        />
      </DialogContent>
    </Dialog>
  );
}
