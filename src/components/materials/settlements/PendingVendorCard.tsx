"use client";

import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  Divider,
  Stack,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Receipt as BillIcon,
  CheckCircle as VerifiedIcon,
  Warning as UnverifiedIcon,
  Remove as NoBillIcon,
  Groups as GroupIcon,
  Payment as PaymentIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type {
  MaterialPurchaseExpenseWithDetails,
  PurchaseOrderWithDetails,
} from "@/types/material.types";
import SourceChip from "./SourceChip";
import {
  getAgeInDays,
  getItemAmount,
  getItemDate,
  getItemRefCode,
  getSettlementType,
  type SettlementItem,
} from "./settlementClassifiers";

export interface PendingVendorGroup {
  key: string;
  vendorName: string;
  vendorId: string | null;
  groupKind: "own_site" | "group_po" | "intersite" | "advance";
  payingSiteName: string | null;
  isCrossSitePayer: boolean;
  items: SettlementItem[];
  totalAmount: number;
  oldestDays: number;
}

interface Props {
  group: PendingVendorGroup;
  currentSiteId: string | undefined;
  canEdit: boolean;
  onSettle: (item: SettlementItem) => void;
  onInspect: (item: SettlementItem) => void;
  onSettleAll?: (items: SettlementItem[]) => void;
}

function getBillState(item: SettlementItem): {
  state: "verified" | "unverified" | "none";
  url: string | null;
} {
  if (item.itemType === "po") {
    const url = item.vendor_bill_url || null;
    if (!url) return { state: "none", url: null };
    return { state: item.bill_verified ? "verified" : "unverified", url };
  }
  const purchase = item as MaterialPurchaseExpenseWithDetails;
  const po = purchase.purchase_order;
  const url = po?.vendor_bill_url || purchase.bill_url || null;
  if (!url) return { state: "none", url: null };
  return { state: po?.bill_verified ? "verified" : "unverified", url };
}

export default function PendingVendorCard({
  group,
  currentSiteId,
  canEdit,
  onSettle,
  onInspect,
  onSettleAll,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const ageColor: "error" | "warning" | "default" =
    group.oldestDays >= 30 ? "error" : group.oldestDays >= 14 ? "warning" : "default";

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor:
          group.oldestDays >= 30
            ? "error.light"
            : group.oldestDays >= 14
            ? "warning.light"
            : "divider",
        "&:hover": { borderColor: "primary.light" },
      }}
    >
      <CardContent sx={{ pb: 1.5, "&:last-child": { pb: 1.5 } }}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 1,
            mb: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="subtitle1" fontWeight={700} noWrap>
                {group.vendorName}
              </Typography>
              {group.groupKind === "group_po" && (
                <Chip
                  icon={<GroupIcon sx={{ fontSize: 14 }} />}
                  label={
                    group.isCrossSitePayer
                      ? `Group PO · payer: ${group.payingSiteName || "Other"}`
                      : "Group PO · you pay"
                  }
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem" }}
                />
              )}
              {group.groupKind === "advance" && (
                <Chip
                  icon={<PaymentIcon sx={{ fontSize: 14 }} />}
                  label="Advance PO"
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem" }}
                />
              )}
              {group.groupKind === "intersite" && (
                <Chip
                  label="Inter-Site"
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem" }}
                />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {group.items.length} {group.items.length === 1 ? "bill" : "bills"} ·{" "}
              <Box
                component="span"
                sx={{
                  color:
                    ageColor === "error"
                      ? "error.main"
                      : ageColor === "warning"
                      ? "warning.main"
                      : "text.secondary",
                  fontWeight: ageColor === "default" ? 400 : 600,
                }}
              >
                oldest {group.oldestDays}d
              </Box>
            </Typography>
          </Box>
          <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
            <Typography variant="h6" fontWeight={700} color="warning.main">
              {formatCurrency(group.totalAmount)}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 1 }} />

        {/* Bill rows */}
        <Stack divider={<Divider flexItem />} spacing={0}>
          {group.items.map((item) => {
            const refCode = getItemRefCode(item);
            const date = getItemDate(item);
            const amount = getItemAmount(item);
            const days = getAgeInDays(item);
            const bill = getBillState(item);
            const isCrossSiteRow =
              item.itemType === "expense" &&
              (item as MaterialPurchaseExpenseWithDetails).site_id !== currentSiteId;

            return (
              <Box
                key={item.id}
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "stretch", sm: "center" },
                  gap: { xs: 0.5, sm: 1.5 },
                  py: 1,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                  borderRadius: 0.5,
                  px: 0.5,
                }}
                onClick={() => onInspect(item)}
              >
                {/* Ref + source */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minWidth: { sm: 200 },
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    sx={{ fontFamily: "monospace" }}
                  >
                    {refCode}
                  </Typography>
                  <SourceChip item={item} />
                </Box>

                {/* Date + age */}
                <Box sx={{ minWidth: { sm: 110 }, flexShrink: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(date)} · {days}d ago
                  </Typography>
                </Box>

                {/* Items count */}
                <Box sx={{ minWidth: { sm: 70 }, flexShrink: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    {item.items?.length || 0} items
                  </Typography>
                </Box>

                {/* Bill chip */}
                <Box sx={{ flexShrink: 0 }}>
                  {bill.state === "none" ? (
                    <Chip
                      icon={<NoBillIcon sx={{ fontSize: 12 }} />}
                      label="No bill"
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "0.65rem", height: 20 }}
                    />
                  ) : bill.state === "verified" ? (
                    <Chip
                      icon={<VerifiedIcon sx={{ fontSize: 12 }} />}
                      label="Verified"
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ fontSize: "0.65rem", height: 20 }}
                    />
                  ) : (
                    <Chip
                      icon={<UnverifiedIcon sx={{ fontSize: 12 }} />}
                      label="Unverified"
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ fontSize: "0.65rem", height: 20 }}
                    />
                  )}
                </Box>

                {/* Amount + Settle */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    ml: { sm: "auto" },
                    justifyContent: { xs: "space-between", sm: "flex-end" },
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {formatCurrency(amount)}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {!isMobile && (
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspect(item);
                          }}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canEdit && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PaymentIcon sx={{ fontSize: 16 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSettle(item);
                        }}
                        sx={{ minWidth: 0, px: 1.5 }}
                      >
                        Settle
                      </Button>
                    )}
                  </Box>
                </Box>

                {isCrossSiteRow && (
                  <Typography
                    variant="caption"
                    color="info.main"
                    sx={{ width: "100%", pl: 0.5 }}
                  >
                    ↳ on behalf of {(item as MaterialPurchaseExpenseWithDetails).paying_site?.name || "another site"}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>

        {/* Footer: settle-all */}
        {canEdit && onSettleAll && group.items.length > 1 && (
          <>
            <Divider sx={{ mt: 1, mb: 1 }} />
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onSettleAll(group.items)}
              >
                Settle all {group.items.length} → {formatCurrency(group.totalAmount)}
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Grouping helper
// ─────────────────────────────────────────────────────────────

export function groupPendingByVendor(items: SettlementItem[]): PendingVendorGroup[] {
  const byKey = new Map<string, PendingVendorGroup>();

  for (const item of items) {
    const kind = getSettlementType(item);
    const vendorId = item.vendor?.id || "no-vendor";
    const purchase = item.itemType === "expense" ? (item as MaterialPurchaseExpenseWithDetails) : null;
    const payingSiteId =
      purchase && kind === "group_po" ? purchase.paying_site_id || purchase.site_id : null;
    // Group key splits by vendor + kind + paying-site (so group-PO cards are unambiguous)
    const key = `${vendorId}::${kind}::${payingSiteId ?? ""}`;

    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        vendorName: item.vendor?.name || "Unknown vendor",
        vendorId: item.vendor?.id || null,
        groupKind: kind,
        payingSiteName: purchase?.paying_site?.name || null,
        isCrossSitePayer: false,
        items: [],
        totalAmount: 0,
        oldestDays: 0,
      };
      byKey.set(key, group);
    }
    group.items.push(item);
    group.totalAmount += getItemAmount(item);
    const days = getAgeInDays(item);
    if (days > group.oldestDays) group.oldestDays = days;
  }

  // Newest-first by default — sort each group's items by date desc, then sort
  // the groups themselves by their newest item's date desc. The oldest-N-days
  // badge on each card still surfaces stale items without dominating the layout.
  for (const group of byKey.values()) {
    group.items.sort(
      (a, b) => (Date.parse(getItemDate(b)) || 0) - (Date.parse(getItemDate(a)) || 0)
    );
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const aLatest = a.items[0] ? Date.parse(getItemDate(a.items[0])) || 0 : 0;
    const bLatest = b.items[0] ? Date.parse(getItemDate(b.items[0])) || 0 : 0;
    return bLatest - aLatest;
  });
}
