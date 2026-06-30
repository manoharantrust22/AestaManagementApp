"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  EventNote as AttendanceIcon,
  Payments as PaymentsIcon,
  Assignment as ContractsIcon,
  Inventory2 as HubIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { visibleTradeWorkspaces } from "@/lib/trades/visibleTradeWorkspaces";
import {
  useSiteTodayWorkByTrade,
  scopeMapKey,
  type TodayWorkScope,
} from "@/hooks/queries/useSiteTodayWorkByTrade";
import { getTradeColor } from "@/theme/tradeColors";
import WorkScopePeek from "./WorkScopePeek";

interface TodayByTradeCardProps {
  siteId: string;
}

type Scope =
  | { kind: "civil" }
  | { kind: "trade"; categoryId: string; tradeName: string; contractId: string };

const WAITING_SCOPE: Pick<
  TodayWorkScope,
  "recordedStatus" | "morningPhotos" | "eveningPhotos" | "morningPlanText"
> = {
  recordedStatus: "waiting",
  morningPhotos: [],
  eveningPhotos: [],
  morningPlanText: null,
};

/**
 * Site-dashboard "Today by trade" card: switch trade → peek that trade's TODAY
 * work status/photos → jump to the daily pages scoped to it. Trade chips follow
 * the shared `visibleTradeWorkspaces` gate, so they match the Attendance/Holidays
 * chips exactly (Civil always; a trade needs Workspace ON + a detailed contract).
 */
export default function TodayByTradeCard({ siteId }: TodayByTradeCardProps) {
  const router = useRouter();
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);

  const { data: trades, isLoading } = useSiteTrades(siteId);
  const { data: workByScope } = useSiteTodayWorkByTrade(siteId, today);

  const visible = useMemo(() => visibleTradeWorkspaces(trades), [trades]);
  const [scope, setScope] = useState<Scope>({ kind: "civil" });

  const selectedContractId = scope.kind === "trade" ? scope.contractId : null;
  const scopeKey = scopeMapKey(selectedContractId);
  const peek = workByScope?.get(scopeKey) ?? WAITING_SCOPE;

  // Scoped navigation: a trade carries its ?contractId=; Civil drops it. Material
  // Hub has no per-trade scoping, so it always navigates plain.
  const contractSuffix = selectedContractId ? `?contractId=${selectedContractId}` : "";
  const jumps = [
    { label: "Attendance", icon: <AttendanceIcon />, href: `/site/attendance${contractSuffix}` },
    { label: "Salary", icon: <PaymentsIcon />, href: `/site/payments${contractSuffix}` },
    { label: "Contracts", icon: <ContractsIcon />, href: "/site/trades" },
    { label: "Material Hub", icon: <HubIcon />, href: "/site/materials/hub" },
  ];

  if (isLoading) {
    return (
      <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Skeleton variant="text" width={140} height={28} />
        <Skeleton variant="rectangular" height={36} sx={{ my: 1, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          Today by trade
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {dayjs(today).format("ddd, DD MMM")}
        </Typography>
      </Stack>

      {/* Trade-switch chips */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        {visible.map((trade) => {
          const isCivil = trade.category.name === "Civil";
          const isSelected = isCivil
            ? scope.kind === "civil"
            : scope.kind === "trade" && scope.categoryId === trade.category.id;
          const color = getTradeColor(trade.category.name);
          return (
            <Chip
              key={trade.category.id}
              size="small"
              label={isCivil ? "Civil" : `${trade.category.name} (${trade.contracts.length})`}
              variant={isSelected ? "filled" : "outlined"}
              onClick={() =>
                isCivil
                  ? setScope({ kind: "civil" })
                  : setScope({
                      kind: "trade",
                      categoryId: trade.category.id,
                      tradeName: trade.category.name,
                      contractId: trade.contracts[0].id,
                    })
              }
              sx={{
                cursor: "pointer",
                ...(isSelected
                  ? {
                      bgcolor: color.main,
                      color: color.contrastText,
                      "&:hover": { bgcolor: color.dark },
                    }
                  : { color: color.main, borderColor: color.main }),
              }}
            />
          );
        })}
      </Stack>

      {/* Selected scope's today status + photos + plan */}
      <WorkScopePeek
        recordedStatus={peek.recordedStatus}
        morningPhotos={peek.morningPhotos}
        eveningPhotos={peek.eveningPhotos}
        morningPlanText={peek.morningPlanText}
      />

      {/* Quick-jump buttons (scoped to the selected trade where supported) */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
        {jumps.map((j) => (
          <Button
            key={j.label}
            size="small"
            variant="outlined"
            startIcon={j.icon}
            onClick={() => router.push(j.href)}
            sx={{ textTransform: "none" }}
          >
            {j.label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}
