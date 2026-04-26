"use client";

import React from "react";
import { Alert, Box, Button } from "@mui/material";
import { useRouter } from "next/navigation";

export default function PendingBanner({
  pendingAmount, pendingDatesCount,
}: { pendingAmount: number; pendingDatesCount: number }) {
  const router = useRouter();
  if (pendingDatesCount === 0) return null;
  return (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ borderRadius: 0, py: 0.5, px: 2, alignItems: "center" }}
      action={
        <Button
          color="inherit"
          size="small"
          onClick={() => router.push("/site/attendance?focus=pending")}
        >
          Settle in Attendance →
        </Button>
      }
    >
      <Box>
        {pendingDatesCount} date{pendingDatesCount === 1 ? "" : "s"} have unsettled attendance ·
        ₹{pendingAmount.toLocaleString("en-IN")} pending
      </Box>
    </Alert>
  );
}
