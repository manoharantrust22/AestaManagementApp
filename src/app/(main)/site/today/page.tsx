"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import {
  AddCircleOutline as RequestIcon,
  PlaylistAddCheck as LogEventIcon,
  LocalShipping as DeliveryIcon,
  ChevronRight as ChevronIcon,
  HourglassEmpty as PendingIcon,
  Inventory2 as InventoryIcon,
  Warning as LowStockIcon,
  ShoppingCart as BoughtIcon,
  Splitscreen as SplitIcon,
  FactCheck as ChecklistIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useMaterialRequests } from "@/hooks/queries/useMaterialRequests";
import { usePOsAwaitingDelivery } from "@/hooks/queries/useDeliveryVerification";
import { useSiteStock } from "@/hooks/queries/useStockInventory";
import { useUnallocatedSpotBatches } from "@/hooks/queries/useSpotPurchases";

interface TileSpec {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  accent: "primary" | "secondary" | "success";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function SiteTodayPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;

  const { data: pendingRequests = [] } = useMaterialRequests(siteId, "pending");
  const { data: awaitingDelivery = [] } = usePOsAwaitingDelivery(siteId);
  const { data: stockItems = [] } = useSiteStock(siteId);
  const siteGroupId = selectedSite?.site_group_id ?? null;
  const { data: unallocated = [] } = useUnallocatedSpotBatches(siteGroupId);

  const lowStockCount = useMemo(
    () => stockItems.filter((s) => (s.available_qty || 0) > 0 && (s.available_qty || 0) <= 5).length,
    [stockItems]
  );

  const tiles: TileSpec[] = [
    {
      label: "Daily checklist",
      description: "Your duties for today — attendance, stock, usage, settlements",
      href: "/site/checklist",
      icon: <ChecklistIcon sx={{ fontSize: 36 }} />,
      accent: "success",
    },
    {
      label: "Request material",
      description: "Tell office what to buy",
      href: "/site/quick-request",
      icon: <RequestIcon sx={{ fontSize: 36 }} />,
      accent: "primary",
    },
    {
      label: "Log event",
      description: "Record bag opened, stack finished, unit empty",
      href: "/site/inventory?tab=usage",
      icon: <LogEventIcon sx={{ fontSize: 36 }} />,
      accent: "success",
    },
    {
      label: "Receive delivery",
      description: "Verify what arrived on site",
      href: "/site/delivery-verification",
      icon: <DeliveryIcon sx={{ fontSize: 36 }} />,
      accent: "secondary",
    },
    {
      label: "Bought at shop",
      description: "Recorded purchase you already paid for",
      href: "/site/spot-purchase",
      icon: <BoughtIcon sx={{ fontSize: 36 }} />,
      accent: "primary",
    },
  ];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 4 }}>
      <Box sx={{ p: 2.5, pt: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {greeting()}{userProfile?.display_name ? `, ${userProfile.display_name.split(" ")[0]}` : ""}
        </Typography>
        <Typography variant="h5" fontWeight={600} sx={{ mt: 0.5 }}>
          {selectedSite?.name || "Today"}
        </Typography>

        {!siteId && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Pick a site from the menu to get started.
          </Alert>
        )}

        <Stack spacing={1.5} sx={{ mt: 3 }}>
          {tiles.map((tile) => (
            <Card key={tile.href} variant="outlined">
              <CardActionArea
                onClick={() => router.push(tile.href)}
                disabled={!siteId}
                sx={{ p: 2.5 }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: `${tile.accent}.main`,
                      color: `${tile.accent}.contrastText`,
                      flexShrink: 0,
                    }}
                  >
                    {tile.icon}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" fontWeight={600}>
                      {tile.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tile.description}
                    </Typography>
                  </Box>
                  <ChevronIcon color="action" />
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Stack>

        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 4, mb: 1 }}>
          On your plate
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <Chip
            icon={<PendingIcon />}
            label={`${pendingRequests.length} request${pendingRequests.length === 1 ? "" : "s"} pending`}
            color={pendingRequests.length > 0 ? "warning" : "default"}
            variant={pendingRequests.length > 0 ? "filled" : "outlined"}
            onClick={() => router.push("/site/material-requests")}
            clickable
          />
          <Chip
            icon={<InventoryIcon />}
            label={`${awaitingDelivery.length === 1 ? "1 delivery" : `${awaitingDelivery.length} deliveries`} due`}
            color={awaitingDelivery.length > 0 ? "info" : "default"}
            variant={awaitingDelivery.length > 0 ? "filled" : "outlined"}
            onClick={() => router.push("/site/delivery-verification")}
            clickable
          />
          <Chip
            icon={<LowStockIcon />}
            label={`${lowStockCount} low-stock item${lowStockCount === 1 ? "" : "s"}`}
            color={lowStockCount > 0 ? "error" : "default"}
            variant={lowStockCount > 0 ? "filled" : "outlined"}
            onClick={() => router.push("/site/inventory")}
            clickable
          />
          {siteGroupId && unallocated.length > 0 && (
            <Chip
              icon={<SplitIcon />}
              label={`${unallocated.length} batch${unallocated.length === 1 ? "" : "es"} need allocation`}
              color="warning"
              variant="filled"
              onClick={() => router.push("/site/spot-purchase?tab=allocations")}
              clickable
            />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
