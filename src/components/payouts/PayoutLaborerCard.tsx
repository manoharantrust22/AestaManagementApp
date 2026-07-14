"use client";

import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { formatCurrencyFull } from "@/lib/formatters";
import type { PayoutBatch, PayoutBucket, PayoutLaborer } from "@/types/payout.types";

const money = {
  fontVariantNumeric: "tabular-nums",
} as const;

function BucketRow({ bucket }: { bucket: PayoutBucket }) {
  const hasWeek = bucket.daysWeek > 0;
  return (
    <Box sx={{ py: 0.75 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {bucket.title}
            {bucket.kind === "contract" && bucket.trade ? ` · ${bucket.trade}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {bucket.siteName}
            {bucket.kind === "contract" && bucket.commissionApplies === false && (
              <Chip
                label="No commission · full wage"
                size="small"
                variant="outlined"
                sx={{ ml: 0.75, height: 18, fontSize: "0.65rem" }}
              />
            )}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap", ...money }}>
          {formatCurrencyFull(bucket.totalUnpaid)}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={money}>
        {hasWeek ? (
          <>
            {bucket.daysWeek} d this week · {formatCurrencyFull(bucket.grossWeek)}
            {bucket.commissionWeek > 0 && (
              <Box component="span" sx={{ color: "warning.main" }}>
                {" "}
                − {formatCurrencyFull(bucket.commissionWeek)} commission
              </Box>
            )}
            {" = "}
            {formatCurrencyFull(bucket.netWeek)}
          </>
        ) : (
          "No days this week"
        )}
        {bucket.earlierUnpaid > 0.005 && (
          <> · + {formatCurrencyFull(bucket.earlierUnpaid)} earlier unpaid</>
        )}
        {bucket.paidTotal > 0.005 && <> · {formatCurrencyFull(bucket.paidTotal)} paid</>}
      </Typography>
    </Box>
  );
}

/**
 * One laborer = one payday decision. Shows the consolidated cross-site owed
 * total, an expandable site × bucket breakdown, batch receipts once paid, and
 * the Pay action.
 */
export default function PayoutLaborerCard({
  laborer,
  onPay,
  onOpenReceipt,
}: {
  laborer: PayoutLaborer;
  onPay: (laborer: PayoutLaborer) => void;
  onOpenReceipt: (laborer: PayoutLaborer, batch: PayoutBatch) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const paidTotal = laborer.batches.reduce((s, b) => s + b.totalAmount, 0);
  const isSettled = laborer.totalUnpaid <= 0.005;
  const siteCount = new Set(laborer.buckets.map((b) => b.siteId)).size;

  return (
    <Card variant="outlined" sx={{ px: 2, py: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar src={laborer.photoUrl ?? undefined} sx={{ width: 40, height: 40 }}>
          {laborer.name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
              {laborer.name}
            </Typography>
            {laborer.advanceOutstanding > 0.005 && (
              <Tooltip title={`Outstanding advance: ${formatCurrencyFull(laborer.advanceOutstanding)} (not deducted here)`}>
                <Chip
                  icon={<InfoOutlinedIcon />}
                  label={`Adv ${formatCurrencyFull(laborer.advanceOutstanding)}`}
                  size="small"
                  variant="outlined"
                  color="warning"
                  sx={{ height: 20, fontSize: "0.65rem" }}
                />
              </Tooltip>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {laborer.role ?? "Laborer"}
            {laborer.daysWeek > 0 &&
              ` · ${laborer.daysWeek} d across ${siteCount} site${siteCount === 1 ? "" : "s"}`}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          {isSettled ? (
            <Chip
              icon={<CheckCircleIcon />}
              label={paidTotal > 0.005 ? `Paid ${formatCurrencyFull(paidTotal)}` : "Nothing owed"}
              color="success"
              size="small"
              variant="outlined"
            />
          ) : (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1, ...money }}>
                {formatCurrencyFull(laborer.totalUnpaid)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {paidTotal > 0.005 ? `owed · ${formatCurrencyFull(paidTotal)} paid` : "owed"}
              </Typography>
            </>
          )}
        </Box>
        <IconButton
          size="small"
          aria-label={expanded ? "Hide breakdown" : "Show breakdown"}
          onClick={() => setExpanded((v) => !v)}
          sx={{
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          <ExpandMoreIcon />
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Divider sx={{ my: 1 }} />
        <Stack divider={<Divider flexItem sx={{ borderStyle: "dashed" }} />}>
          {laborer.buckets.map((b) => (
            <BucketRow key={`${b.siteId}|${b.kind}|${b.refId ?? ""}`} bucket={b} />
          ))}
        </Stack>
      </Collapse>

      {(laborer.batches.length > 0 || !isSettled) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mt: 1,
          }}
        >
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {laborer.batches.map((batch) => (
              <Chip
                key={batch.id}
                icon={<ReceiptLongIcon />}
                label={`${formatCurrencyFull(batch.totalAmount)} · ${batch.paymentDate}`}
                size="small"
                variant="outlined"
                onClick={() => onOpenReceipt(laborer, batch)}
              />
            ))}
          </Box>
          {!isSettled && (
            <Button variant="contained" size="small" onClick={() => onPay(laborer)}>
              Pay
            </Button>
          )}
        </Box>
      )}
    </Card>
  );
}
