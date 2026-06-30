"use client";

import React from "react";
import { Alert, Button } from "@mui/material";

/**
 * Shown inside a trade card when its Workspace is ON but it has no detailed
 * contract — workers can't be recorded against it and there's no agreed amount.
 * The button opens the existing QuickCreateContractDialog (handled by the parent).
 */
export function NoContractPrompt({ show, onCreate }: { show: boolean; onCreate: () => void }) {
  if (!show) return null;
  return (
    <Alert
      severity="warning"
      sx={{ mt: 1 }}
      action={
        <Button color="inherit" size="small" onClick={onCreate}>
          Create contract & set agreed ₹
        </Button>
      }
    >
      No contract yet — workers can&apos;t be recorded against this trade, and there&apos;s no agreed amount.
    </Alert>
  );
}
