"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ClickAwayListener,
  Paper,
  Popper,
  TextField,
  Typography,
} from "@mui/material";
import { createClient } from "@/lib/supabase/client";
import { updateMiscExpense } from "@/lib/services/miscExpenseService";
import type { Trade } from "@/types/trade.types";

interface Option {
  id: string;
  title: string;
  tradeName: string;
}

export interface UnlinkedLinkPopperProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  miscExpenseId: string;
  siteTrades: Trade[];
  userId: string;
  userName: string;
  onClose: () => void;
  onLinked: () => void;
}

export function UnlinkedLinkPopper({
  open,
  anchorEl,
  miscExpenseId,
  siteTrades,
  userId,
  userName,
  onClose,
  onLinked,
}: UnlinkedLinkPopperProps) {
  const [selected, setSelected] = useState<Option | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    for (const t of siteTrades) {
      for (const c of t.contracts) {
        out.push({ id: c.id, title: c.title, tradeName: t.category.name });
      }
    }
    return out;
  }, [siteTrades]);

  async function handleLink() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const res = await updateMiscExpense(
      supabase,
      miscExpenseId,
      { subcontract_id: selected.id },
      userId,
      userName,
    );
    setSubmitting(false);
    if (res.success) {
      onLinked();
    } else {
      setError(res.error || "Failed to link subcontract");
    }
  }

  return (
    <Popper open={open} anchorEl={anchorEl} placement="bottom-start" sx={{ zIndex: 1400 }}>
      <ClickAwayListener onClickAway={onClose}>
        <Paper elevation={6} sx={{ p: 2, width: 320, borderRadius: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" sx={{ letterSpacing: 0.5 }}>
            Link to subcontract
          </Typography>
          <Autocomplete<Option>
            sx={{ mt: 1 }}
            size="small"
            options={options}
            value={selected}
            onChange={(_, v) => setSelected(v)}
            groupBy={(o) => o.tradeName}
            getOptionLabel={(o) => o.title}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} placeholder="Choose subcontract…" />}
            slotProps={{ popper: { disablePortal: false } }}
          />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
            <Button size="small" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button size="small" variant="contained" onClick={handleLink} disabled={!selected || submitting}>
              {submitting ? "Linking…" : "Link"}
            </Button>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
