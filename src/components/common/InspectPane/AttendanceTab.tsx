"use client";

import React from "react";
import {
  Box,
  Chip,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import dayjs from "dayjs";
import type { InspectEntity } from "./types";
import {
  useAttendanceForDate,
  type AttendanceLaborerRow,
  type AttendanceMarketRow,
} from "@/hooks/queries/useAttendanceForDate";
import {
  useLaborerWeek,
  type LaborerWeekDay,
} from "@/hooks/queries/useLaborerWeek";
import { useWeekAggregateAttendance } from "@/hooks/queries/useWeekAggregateAttendance";
import InspectPaneError from "./InspectPaneError";

// ----------------------------------------------------------------
// Shared sub-component
// ----------------------------------------------------------------

function TotalTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "warn" | "pos";
}) {
  const theme = useTheme();
  const color =
    accent === "warn"
      ? theme.palette.warning.main
      : accent === "pos"
        ? theme.palette.success.main
        : theme.palette.text.primary;
  return (
    <Box
      sx={{
        flex: 1,
        p: 1.25,
        bgcolor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={700} sx={{ color }}>
        {value}
      </Typography>
    </Box>
  );
}

const SECTION_LABEL_SX = {
  display: "block",
  mb: 0.75,
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  fontWeight: 600,
} as const;

// Informational section for laborers assigned to a task-work package. They are
// paid via the package on /site/trades and are excluded from BOTH the
// Daily+Market and Contract salary settlements — shown greyed with the contract
// name so the day still reads completely, without double-counting the wage.
function TaskWorkPaidSection({
  dailyRows,
  marketRows,
}: {
  dailyRows: AttendanceLaborerRow[];
  marketRows: AttendanceMarketRow[];
}) {
  const theme = useTheme();
  const total =
    dailyRows.reduce((s, l) => s + l.amount, 0) +
    marketRows.reduce((s, m) => s + m.amount, 0);
  const count = dailyRows.length + marketRows.length;
  if (count === 0) return null;

  return (
    <Box sx={{ mt: 1.5, opacity: 0.7 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          mb: 0.5,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={SECTION_LABEL_SX}>
          Paid via contract ({count})
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: 10,
            fontWeight: 600,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ₹{total.toLocaleString("en-IN")}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "block",
          mb: 0.5,
          px: 0.5,
          fontSize: 10,
          fontStyle: "italic",
          color: "text.secondary",
        }}
      >
        Not included in this settlement&apos;s calculation — settled separately
        under the task-work contract.
      </Box>
      <Stack spacing={0.5}>
        {dailyRows.map((lab) => (
          <Box
            key={lab.id}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 0.5,
              px: 1.25,
              bgcolor: theme.palette.background.default,
              border: `1px dashed ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12.5 }}>
                {lab.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 10.5 }}
              >
                {lab.role} · {lab.taskWorkTitle ?? "Task-work contract"}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              fontWeight={600}
              color="text.secondary"
              sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
            >
              ₹{lab.amount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        ))}
        {marketRows.map((mkt) => (
          <Box
            key={mkt.id}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 0.5,
              px: 1.25,
              bgcolor: theme.palette.background.default,
              border: `1px dashed ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12.5 }}>
                {mkt.role} · {mkt.count} {mkt.count === 1 ? "person" : "people"}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 10.5 }}
              >
                {mkt.taskWorkTitle ?? "Task-work contract"}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              fontWeight={600}
              color="text.secondary"
              sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
            >
              ₹{mkt.amount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// Informational section for company laborers assigned to a NON-Civil trade
// contract (e.g. Painting). They are paid via that trade's own workspace on
// /site/trades and are excluded from the settleable total here — shown greyed
// with the trade name so the day still reads completely, without
// double-counting the wage.
function TradeContractPaidSection({ rows }: { rows: AttendanceLaborerRow[] }) {
  const theme = useTheme();
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Box sx={{ mt: 1.5, opacity: 0.7 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          mb: 0.5,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            fontWeight: 600,
          }}
        >
          Trade contract ({rows.length})
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: 10,
            fontWeight: 600,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ₹{total.toLocaleString("en-IN")}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "block",
          mb: 0.5,
          px: 0.5,
          fontSize: 10,
          fontStyle: "italic",
          color: "text.secondary",
        }}
      >
        Not included in this settlement&apos;s calculation — settled
        separately under the trade&apos;s own workspace.
      </Box>
      <Stack spacing={0.5}>
        {rows.map((lab) => (
          <Box
            key={lab.id}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 0.5,
              px: 1.25,
              bgcolor: theme.palette.background.default,
              border: `1px dashed ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12.5 }}>
                  {lab.name}
                </Typography>
                <Chip
                  size="small"
                  label={lab.tradeName ?? "Trade"}
                  variant="outlined"
                  sx={{
                    height: 18,
                    fontSize: 10,
                    fontWeight: 600,
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 10.5 }}
              >
                {lab.subcontractTitle
                  ? `${lab.role} · ${lab.subcontractTitle}`
                  : lab.role}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              fontWeight={600}
              color="text.secondary"
              sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
            >
              ₹{lab.amount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// ----------------------------------------------------------------
// Daily-shape: one date × all laborers
// ----------------------------------------------------------------

function DailyShape({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "daily-date" }>;
}) {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useAttendanceForDate(
    entity.siteId,
    entity.date,
  );

  if (isError) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Skeleton variant="rounded" width="100%" height={56} />
          <Skeleton variant="rounded" width="100%" height={56} />
          <Skeleton variant="rounded" width="100%" height={56} />
        </Stack>
        <Skeleton variant="rounded" width="100%" height={140} />
      </Box>
    );
  }

  const teaTotal = data?.teaShopTotal ?? 0;
  // The Daily + Market drawer treats contract attendance as informational
  // only — split it out so the "DAILY" tile reflects daily-only earnings.
  const dailyOnlyList = data?.dailyLaborersByType?.daily ?? [];
  const contractList = data?.dailyLaborersByType?.contract ?? [];
  const taskWorkDaily = data?.dailyLaborersByType?.taskWork ?? [];
  const dailyTotal = dailyOnlyList.reduce((s, l) => s + l.amount, 0);
  const marketLaborers = data?.marketLaborersByType?.market ?? [];
  const taskWorkMarket = data?.marketLaborersByType?.taskWork ?? [];
  const marketTotal = marketLaborers.reduce((s, m) => s + m.amount, 0);
  const tradeContractRows = data?.dailyLaborersByType?.tradeContract ?? [];

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TotalTile
          label="Daily"
          value={`₹${dailyTotal.toLocaleString("en-IN")}`}
        />
        <TotalTile
          label="Market"
          value={`₹${marketTotal.toLocaleString("en-IN")}`}
        />
        <TotalTile
          label="Tea"
          value={`₹${teaTotal.toLocaleString("en-IN")}`}
        />
      </Stack>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={SECTION_LABEL_SX}
      >
        Daily Laborers ({dailyOnlyList.length})
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        {dailyOnlyList.slice(0, 4).map((lab) => (
          <Box
            key={lab.id}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 0.75,
              px: 1.25,
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            <Box>
              <Typography variant="body2" fontWeight={500}>
                {lab.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {lab.role} · {lab.fullDay ? "Full day" : "Half day"}
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={600} color="success.main">
              ₹{lab.amount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        ))}
        {dailyOnlyList.length > 4 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ pl: 1 }}
          >
            … {dailyOnlyList.length - 4} more
          </Typography>
        )}
        {dailyOnlyList.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
            No daily laborers recorded for this date.
          </Typography>
        )}
      </Stack>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={SECTION_LABEL_SX}
      >
        Market Laborers ({marketLaborers.length})
      </Typography>
      <Stack spacing={0.5} sx={{ mb: contractList.length > 0 ? 2 : 0 }}>
        {marketLaborers.slice(0, 4).map((mkt) => (
          <Box
            key={mkt.id}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 0.75,
              px: 1.25,
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            <Box>
              <Typography variant="body2" fontWeight={500}>
                {mkt.role}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {mkt.count} {mkt.count === 1 ? "person" : "people"}
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={600} color="success.main">
              ₹{mkt.amount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        ))}
        {marketLaborers.length > 4 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ pl: 1 }}
          >
            … {marketLaborers.length - 4} more
          </Typography>
        )}
        {marketLaborers.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
            No market laborers recorded for this date.
          </Typography>
        )}
      </Stack>

      {/* Contract laborers — informational only. Hidden when no contract
          attendance for the date so the drawer stays compact. */}
      {contractList.length > 0 && (
        <Box sx={{ opacity: 0.7 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={SECTION_LABEL_SX}
          >
            Company Laborers ({contractList.length})
          </Typography>
          <Box
            sx={{
              display: "block",
              mb: 0.5,
              px: 0.5,
              fontSize: 10,
              fontStyle: "italic",
              color: "text.secondary",
            }}
          >
            Not included in this settlement&apos;s calculation — settled
            separately under Company Settlement.
          </Box>
          <Stack spacing={0.5}>
            {contractList.slice(0, 4).map((lab) => (
              <Box
                key={lab.id}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  p: 0.5,
                  px: 1.25,
                  bgcolor: theme.palette.background.default,
                  border: `1px dashed ${theme.palette.divider}`,
                  borderRadius: 1,
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    sx={{ fontSize: 12.5 }}
                  >
                    {lab.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: 10.5 }}
                  >
                    {lab.role} · {lab.fullDay ? "Full day" : "Half day"}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  color="text.secondary"
                  sx={{
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₹{lab.amount.toLocaleString("en-IN")}
                </Typography>
              </Box>
            ))}
            {contractList.length > 4 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ pl: 1 }}
              >
                … {contractList.length - 4} more
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      <TradeContractPaidSection rows={tradeContractRows} />

      <TaskWorkPaidSection dailyRows={taskWorkDaily} marketRows={taskWorkMarket} />

      {/* Inline Work Updates for this date — morning vs evening side by side.
          Mirrors the inline section already shown on Contract Settlement's
          per-day expansion so Daily+Mkt has the same context at a glance. */}
      <WorkUpdatesInline siteId={entity.siteId} date={entity.date} />
    </Box>
  );
}

// ----------------------------------------------------------------
// Weekly-shape: one laborer × one week (Mon–Sun or Sun–Sat)
// ----------------------------------------------------------------

function WeeklyShape({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "weekly-week" }>;
}) {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useLaborerWeek(
    entity.siteId,
    entity.laborerId,
    entity.weekStart,
    entity.weekEnd
  );

  if (isError) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Skeleton variant="rounded" width="100%" height={56} />
          <Skeleton variant="rounded" width="100%" height={56} />
          <Skeleton variant="rounded" width="100%" height={56} />
        </Stack>
        <Skeleton variant="rounded" width="100%" height={100} />
      </Box>
    );
  }

  const dailySalary = data?.dailySalary ?? 0;
  const contractAmount = data?.contractAmount ?? 0;
  const total = data?.total ?? 0;
  const days = data?.days ?? [];
  const daysNotWorked = data?.daysNotWorked ?? [];

  const workedCount = days.filter(
    (d) => d.status === "full" || d.status === "half"
  ).length;

  const statusColor = (
    s: LaborerWeekDay["status"]
  ): { bg: string; border: string } => {
    if (s === "full") {
      return {
        bg: alpha(theme.palette.success.main, 0.12),
        border: theme.palette.success.main,
      };
    }
    if (s === "half") {
      return {
        bg: alpha(theme.palette.warning.main, 0.12),
        border: theme.palette.warning.main,
      };
    }
    if (s === "holiday") {
      return {
        bg: "transparent",
        border: theme.palette.secondary.main,
      };
    }
    // off
    return {
      bg: theme.palette.background.default,
      border: theme.palette.divider,
    };
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TotalTile
          label="Daily Sal."
          value={`₹${dailySalary.toLocaleString("en-IN")}`}
        />
        {contractAmount > 0 && (
          <TotalTile
            label="Company"
            value={`₹${contractAmount.toLocaleString("en-IN")}`}
          />
        )}
        <TotalTile
          label="Total"
          value={`₹${total.toLocaleString("en-IN")}`}
          accent="pos"
        />
      </Stack>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={SECTION_LABEL_SX}
      >
        Per-day breakdown ({workedCount} of 7 days)
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 2,
        }}
      >
        {days.map((d) => {
          const c = statusColor(d.status);
          return (
            <Box
              key={d.date}
              sx={{
                p: 0.75,
                borderRadius: 1,
                border: `1px solid ${c.border}`,
                bgcolor: c.bg,
                textAlign: "center",
                minHeight: 80,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 8.5,
                    color: "text.secondary",
                    textTransform: "uppercase",
                  }}
                >
                  {d.dayName}
                </Typography>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  sx={{ display: "block" }}
                >
                  {dayjs(d.date).format("DD")}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 8,
                    fontWeight: 600,
                    color:
                      d.status === "full"
                        ? "success.dark"
                        : d.status === "half"
                          ? "warning.dark"
                          : "text.disabled",
                  }}
                >
                  {d.status.toUpperCase()}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontSize: 9,
                    fontWeight: 600,
                    color: d.amount > 0 ? "success.main" : "text.disabled",
                  }}
                >
                  {d.amount > 0 ? `₹${d.amount}` : "—"}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={SECTION_LABEL_SX}
      >
        Salary breakdown
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Box
          sx={{
            p: 0.75,
            px: 1.25,
            bgcolor: "background.paper",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="body2">Daily salary</Typography>
            <Typography variant="caption" color="text.secondary">
              {workedCount} day(s) worked
            </Typography>
          </Box>
          <Typography variant="body2" fontWeight={600} color="success.main">
            ₹{dailySalary.toLocaleString("en-IN")}
          </Typography>
        </Box>
        <Box
          sx={{
            p: 0.75,
            px: 1.25,
            bgcolor: "background.paper",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="body2">Contract / piece-rate</Typography>
          <Typography variant="body2" fontWeight={600} color="success.main">
            ₹{contractAmount.toLocaleString("en-IN")}
          </Typography>
        </Box>
        <Box
          sx={{
            p: 0.75,
            px: 1.25,
            bgcolor: alpha(theme.palette.warning.main, 0.08),
            border: `1px solid ${theme.palette.warning.main}`,
            borderRadius: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="body2" fontWeight={700} color="warning.dark">
            Total settled
          </Typography>
          <Typography variant="body2" fontWeight={700} color="warning.dark">
            ₹{total.toLocaleString("en-IN")}
          </Typography>
        </Box>
      </Stack>

      {daysNotWorked.length > 0 && (
        <>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={SECTION_LABEL_SX}
          >
            Days didn&apos;t work
          </Typography>
          <Stack spacing={0.5}>
            {daysNotWorked.map((d) => (
              <Box
                key={d.date}
                sx={{
                  p: 0.75,
                  px: 1.25,
                  bgcolor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" fontWeight={500}>
                  {dayjs(d.date).format("ddd DD MMM")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {d.reason}
                </Typography>
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}

// ----------------------------------------------------------------
// Weekly-aggregate shape: one subcontract (or all) × one week
// Per-day attendance roll-up across all contract laborers
// ----------------------------------------------------------------

function WeeklyAggregateShape({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "weekly-aggregate" }>;
}) {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useWeekAggregateAttendance(
    entity.siteId,
    entity.subcontractId,
    entity.weekStart,
    entity.weekEnd
  );

  // Click a day chip to expand a per-laborer breakdown for that date below.
  // Click again to collapse.
  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);

  if (isError) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={140} />
      </Box>
    );
  }

  const days = data?.days ?? [];
  const holidays = data?.holidays ?? [];

  return (
    <Box sx={{ p: 2 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={SECTION_LABEL_SX}
      >
        Per-day attendance · {data?.totalLaborers ?? 0} company laborers worked · tap a day for details
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 2,
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const dt = dayjs(entity.weekStart).add(i, "day").format("YYYY-MM-DD");
          const day = days.find((d) => d.date === dt);
          const holiday = holidays.find((h) => h.date === dt);
          const isExpanded = expandedDate === dt;
          // Holiday styling overrides empty styling but is overridden by worked-day
          // (holidays where someone still worked are rare but valid).
          const bg = day
            ? alpha(theme.palette.success.main, 0.12)
            : holiday
              ? alpha(theme.palette.info.main, 0.12)
              : "background.default";
          const borderColor = isExpanded
            ? theme.palette.primary.main
            : day
              ? theme.palette.success.main
              : holiday
                ? theme.palette.info.main
                : theme.palette.divider;
          return (
            <Box
              key={dt}
              role="button"
              tabIndex={0}
              aria-pressed={isExpanded}
              onClick={() =>
                setExpandedDate((prev) => (prev === dt ? null : dt))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedDate((prev) => (prev === dt ? null : dt));
                }
              }}
              sx={{
                p: 0.75,
                borderRadius: 1,
                textAlign: "center",
                bgcolor: bg,
                border: `${isExpanded ? 2 : 1}px solid ${borderColor}`,
                minHeight: 80,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "transform 80ms ease",
                "&:hover": { transform: "translateY(-1px)" },
                "&:focus-visible": {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 1,
                },
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontSize: 8.5,
                    color: "text.secondary",
                    textTransform: "uppercase",
                  }}
                >
                  {dayjs(dt).format("ddd")}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  {dayjs(dt).format("DD")}
                </Typography>
              </Box>
              {day ? (
                <Box>
                  <Typography
                    sx={{
                      fontSize: 8.5,
                      color: "success.dark",
                      fontWeight: 600,
                    }}
                  >
                    {day.laborersWorked} lab.
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 9,
                      color: "success.main",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ₹{day.totalEarnings.toLocaleString("en-IN")}
                  </Typography>
                </Box>
              ) : holiday ? (
                <Box>
                  <Typography
                    sx={{
                      fontSize: 8.5,
                      color: "info.dark",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                    }}
                  >
                    Holiday
                  </Typography>
                  {holiday.reason && (
                    <Typography
                      sx={{
                        fontSize: 8,
                        color: "info.dark",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {holiday.reason}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: 9, color: "text.disabled" }}>
                  —
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Expanded per-day breakdown */}
      {expandedDate && (
        <Box sx={{ mb: 2 }}>
          <DayDetailExpansion
            siteId={entity.siteId}
            subcontractId={entity.subcontractId}
            date={expandedDate}
            holiday={holidays.find((h) => h.date === expandedDate)}
          />
        </Box>
      )}

      <Box
        sx={{
          bgcolor: "background.paper",
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1.5,
          p: 1.25,
          fontSize: 12.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 0.5,
          }}
        >
          <span style={{ color: theme.palette.text.secondary }}>
            Worked this week
          </span>
          <span
            style={{
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data?.totalLaborers ?? 0} laborers
          </span>
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 0.5,
          }}
        >
          <span style={{ color: theme.palette.text.secondary }}>
            Total wages this week
          </span>
          <span
            style={{
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ₹{(data?.totalEarnings ?? 0).toLocaleString("en-IN")}
          </span>
        </Box>
      </Box>

      {/* Crew-pay sites: per-laborer earned/paid for this week (renders nothing elsewhere). */}
      <CrewWeekInspectSummary siteId={entity.siteId} weekStart={entity.weekStart} />
    </Box>
  );
}

// ----------------------------------------------------------------
// Per-day expansion: when a day chip in WeeklyAggregateShape is clicked,
// show the laborer-by-laborer breakdown for that single date.
// Reuses useAttendanceForDate which the DailyShape also uses.
// ----------------------------------------------------------------

import type { WeekHoliday } from "@/hooks/queries/useWeekAggregateAttendance";
import { useDailyMarketWeekAggregate } from "@/hooks/queries/useDailyMarketWeekAggregate";
import { useWorkUpdates } from "@/hooks/queries/useWorkUpdates";
import PhotoFullscreenDialog from "@/components/attendance/work-updates/PhotoFullscreenDialog";
import CrewWeekInspectSummary from "@/components/payments/crew/CrewWeekInspectSummary";
import type { WorkPhoto } from "@/types/work-updates.types";

interface DayLightboxState {
  photos: WorkPhoto[];
  index: number;
  period: "morning" | "evening";
  title: string;
}

// Inline work-updates section (morning vs evening side-by-side) used by both
// DayDetailExpansion (Contract Settlement) and DailyShape (Daily+Market).
// Owns its own work-updates fetch + lightbox state so it's drop-in renderable.
function WorkUpdatesInline({
  siteId,
  date,
}: {
  siteId: string;
  date: string;
}) {
  const theme = useTheme();
  const { data: workUpdates, isLoading: workLoading } = useWorkUpdates(
    siteId,
    date,
    date
  );
  const [lightbox, setLightbox] = React.useState<DayLightboxState | null>(null);

  if (workLoading) return null;
  if ((workUpdates?.updates?.length ?? 0) === 0) return null;

  return (
    <>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
          mt: 1.5,
          mb: 0.5,
        }}
      >
        Work updates on this day · morning vs evening
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 0.75,
          alignItems: "start",
        }}
      >
        {workUpdates!.updates.map((u) => {
          const photos: WorkPhoto[] = (u.photoUrls ?? []).map((url, i) => ({
            id: `${u.id}-${i}`,
            url,
            uploadedAt: "",
          }));
          const period: "morning" | "evening" =
            u.timeOfDay === "Morning" ? "morning" : "evening";
          const accent =
            period === "morning"
              ? theme.palette.warning.main
              : theme.palette.info.main;
          const title = `${u.timeOfDay} · ${dayjs(date).format("DD MMM")}`;
          return (
            <Box
              key={u.id}
              sx={{
                p: 1,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                borderLeft: `3px solid ${accent}`,
                bgcolor: theme.palette.background.default,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: 10.5, mb: 0.5 }}
              >
                {u.timeOfDay} ·{" "}
                {dayjs(u.createdAt).format("hh:mm A")} · by{" "}
                {u.createdByName}
              </Typography>
              {u.note && (
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: 12.5,
                    whiteSpace: "pre-wrap",
                    mb: photos.length > 0 ? 0.75 : 0,
                  }}
                >
                  {u.note}
                </Typography>
              )}
              {photos.length > 0 && (
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ flexWrap: "wrap", gap: 0.5 }}
                >
                  {photos.slice(0, 6).map((photo, i) => (
                    <Box
                      key={photo.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open photo ${i + 1} fullscreen`}
                      onClick={() =>
                        setLightbox({ photos, index: i, period, title })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setLightbox({ photos, index: i, period, title });
                        }
                      }}
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 0.75,
                        overflow: "hidden",
                        bgcolor: theme.palette.action.hover,
                        border: `1px solid ${theme.palette.divider}`,
                        cursor: "pointer",
                        flex: "0 0 auto",
                        transition:
                          "transform 120ms ease, box-shadow 120ms ease",
                        "&:hover": {
                          transform: "scale(1.05)",
                          boxShadow: theme.shadows[2],
                        },
                        "&:focus-visible": {
                          outline: `2px solid ${theme.palette.primary.main}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      <Box
                        component="img"
                        src={photo.url}
                        alt={`Photo ${i + 1}`}
                        loading="eager"
                        sx={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Box>
                  ))}
                  {photos.length > 6 && (
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setLightbox({
                          photos,
                          index: 6,
                          period,
                          title,
                        })
                      }
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 0.75,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: theme.palette.action.hover,
                        border: `1px solid ${theme.palette.divider}`,
                        fontSize: 12,
                        color: "text.secondary",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      +{photos.length - 6}
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>
      <PhotoFullscreenDialog
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        photos={lightbox?.photos ?? []}
        initialIndex={lightbox?.index ?? 0}
        period={lightbox?.period}
        title={lightbox?.title}
      />
    </>
  );
}

// "contract-primary": original layout (used by WeeklyAggregateShape).
//                     Contract + Daily commingled in one section, market
//                     surfaced as "not part of the contract waterfall".
// "daily-market-primary": for the new Daily + Market drawer. Daily and
//                     market are primary; contract attendance is
//                     surfaced last as informational ("not included in
//                     this settlement's calculation").
type DayDetailMode = "contract-primary" | "daily-market-primary";

function DayDetailExpansion({
  siteId,
  subcontractId,
  date,
  holiday,
  mode = "contract-primary",
}: {
  siteId: string;
  subcontractId: string | null;
  date: string;
  holiday?: WeekHoliday;
  mode?: DayDetailMode;
}) {
  void subcontractId; // Per-day RPC is not subcontract-scoped today; whole site
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useAttendanceForDate(
    siteId,
    date,
  );

  // Each tab settles exactly ONE kind of named laborer; the other kind is shown
  // greyed/informational so the headcount stays complete but the settleable
  // label never lies about who is being paid here:
  //   - daily-market-primary (Daily + Market)  → DAILY (named) laborers settle here
  //   - contract-primary (Company Settlement)   → COMPANY laborers settle here
  // Task-work-tagged days are excluded from both (they settle on the package) and
  // surface under "Paid via contract".
  const isDailyMarketPrimary = mode === "daily-market-primary";
  const dailyOnlyList = data?.dailyLaborersByType?.daily ?? [];
  const contractList = data?.dailyLaborersByType?.contract ?? [];
  const taskWorkDaily = data?.dailyLaborersByType?.taskWork ?? [];
  const marketList = data?.marketLaborersByType?.market ?? [];
  const taskWorkMarket = data?.marketLaborersByType?.taskWork ?? [];
  const taskWorkCount = taskWorkDaily.length + taskWorkMarket.length;
  const tradeContractRows = data?.dailyLaborersByType?.tradeContract ?? [];

  // Primary (settleable) bucket for this tab.
  const primaryRows = isDailyMarketPrimary ? dailyOnlyList : contractList;
  const primaryCount = primaryRows.length;
  const primaryTotal = primaryRows.reduce((s, l) => s + l.amount, 0);
  const primaryLabel = isDailyMarketPrimary
    ? "Daily Laborers"
    : "Company Laborers";

  // Market laborers (unnamed crews) — settleable under Daily + Market only.
  const marketCount = marketList.length;
  const marketTotal = marketList.reduce((s, l) => s + l.amount, 0);

  // The OTHER tab's named laborers who worked this day — informational (greyed).
  const infoList = isDailyMarketPrimary ? contractList : dailyOnlyList;
  const infoCount = infoList.length;
  const infoTotal = infoList.reduce((s, l) => s + l.amount, 0);
  const infoLabel = isDailyMarketPrimary ? "Company Laborers" : "Daily Laborers";
  const infoUnderTab = isDailyMarketPrimary
    ? "Company Settlement"
    : "Daily + Market";

  // Everyone who worked this day, regardless of which tab settles them.
  const totalWorked =
    dailyOnlyList.length +
    contractList.length +
    marketList.length +
    tradeContractRows.length +
    taskWorkCount;

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.primary.main}`,
        borderRadius: 1.5,
        p: 1.25,
      }}
    >
      {/* Day header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          mb: 0.75,
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            ...SECTION_LABEL_SX,
            color: "primary.main",
            mb: 0,
          }}
        >
          {dayjs(date).format("dddd, DD MMM")}
          {holiday && " · Holiday"}
        </Typography>
        {!isLoading && totalWorked > 0 && (
          <Typography
            variant="caption"
            sx={{
              fontSize: 11,
              color: "text.secondary",
            }}
          >
            {totalWorked} worked on this day
          </Typography>
        )}
      </Box>

      {holiday && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "info.dark",
            mb: 1,
          }}
        >
          {holiday.reason ?? "Holiday"}
          {holiday.isPaid && " (paid)"}
        </Typography>
      )}

      {isError ? (
        <InspectPaneError onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skeleton variant="rounded" height={64} />
      ) : (
        <>
          {totalWorked === 0 ? (
            <Typography variant="caption" color="text.disabled">
              No attendance recorded on this day.
            </Typography>
          ) : (
            <>
              {primaryCount > 0 && (
                <>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      mt: 1,
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        fontWeight: 600,
                      }}
                    >
                      {primaryLabel} ({primaryCount})
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "success.dark",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ₹{primaryTotal.toLocaleString("en-IN")}
                    </Typography>
                  </Box>
                  <Stack spacing={0.5}>
                    {primaryRows.map((lab) => (
                      <Box
                        key={lab.id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          p: 0.75,
                          px: 1.25,
                          bgcolor: lab.isOverridden
                            ? alpha(theme.palette.warning.main, 0.08)
                            : theme.palette.background.default,
                          border: `1px solid ${
                            lab.isOverridden
                              ? alpha(theme.palette.warning.main, 0.4)
                              : theme.palette.divider
                          }`,
                          borderRadius: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                              flexWrap: "wrap",
                            }}
                          >
                            <Typography variant="body2" fontWeight={500}>
                              {lab.name}
                            </Typography>
                            {lab.isOverridden && (
                              <Tooltip
                                title={
                                  lab.overrideReason
                                    ? `Manual override: ${lab.overrideReason}`
                                    : "Manual override applied for this day"
                                }
                              >
                                <Chip
                                  label="Overridden"
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  sx={{
                                    height: 18,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    "& .MuiChip-label": { px: 0.75 },
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {lab.role} · {lab.fullDay ? "Full day" : "Half day"}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={
                            lab.isOverridden ? "warning.dark" : "success.main"
                          }
                        >
                          ₹{lab.amount.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}

              {marketCount > 0 && (
                <>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      mt: 1.25,
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        fontWeight: 600,
                      }}
                    >
                      Market Laborers ({marketCount})
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: isDailyMarketPrimary
                          ? "success.dark"
                          : "warning.dark",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ₹{marketTotal.toLocaleString("en-IN")}
                    </Typography>
                  </Box>
                  {!isDailyMarketPrimary && (
                    <Box
                      sx={{
                        display: "block",
                        mb: 0.5,
                        px: 0.5,
                        fontSize: 10,
                        fontStyle: "italic",
                        color: "warning.dark",
                      }}
                    >
                      Not part of the contract waterfall — paid separately
                      under Daily + Market.
                    </Box>
                  )}
                  <Stack spacing={0.5}>
                    {marketList.map((mkt) => (
                      <Box
                        key={mkt.id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          p: 0.75,
                          px: 1.25,
                          bgcolor: isDailyMarketPrimary
                            ? theme.palette.background.default
                            : alpha(theme.palette.warning.main, 0.06),
                          border: `1px solid ${
                            isDailyMarketPrimary
                              ? theme.palette.divider
                              : alpha(theme.palette.warning.main, 0.4)
                          }`,
                          borderRadius: 1,
                        }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {mkt.role}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {mkt.count}{" "}
                            {mkt.count === 1 ? "person" : "people"}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={
                            isDailyMarketPrimary
                              ? "success.main"
                              : "warning.dark"
                          }
                        >
                          ₹{mkt.amount.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}

              {/* The OTHER tab's named laborers who worked this day —
                  informational only (settled under that tab, not here). */}
              {infoCount > 0 && (
                <Box sx={{ mt: 1.5, opacity: 0.7 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        fontWeight: 600,
                      }}
                    >
                      {infoLabel} ({infoCount})
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ₹{infoTotal.toLocaleString("en-IN")}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "block",
                      mb: 0.5,
                      px: 0.5,
                      fontSize: 10,
                      fontStyle: "italic",
                      color: "text.secondary",
                    }}
                  >
                    Not included in this settlement&apos;s calculation —
                    settled separately under {infoUnderTab}.
                  </Box>
                  <Stack spacing={0.5}>
                    {infoList.map((lab) => (
                      <Box
                        key={lab.id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          p: 0.5,
                          px: 1.25,
                          bgcolor: theme.palette.background.default,
                          border: `1px dashed ${theme.palette.divider}`,
                          borderRadius: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{ fontSize: 12.5 }}
                          >
                            {lab.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: 10.5 }}
                          >
                            {lab.role} ·{" "}
                            {lab.fullDay ? "Full day" : "Half day"}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          color="text.secondary"
                          sx={{
                            fontSize: 12,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ₹{lab.amount.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              <TradeContractPaidSection rows={tradeContractRows} />

              <TaskWorkPaidSection
                dailyRows={taskWorkDaily}
                marketRows={taskWorkMarket}
              />
            </>
          )}
        </>
      )}

      {/* Inline Work Updates for this day — morning vs evening side by side */}
      <WorkUpdatesInline siteId={siteId} date={date} />
    </Box>
  );
}

// ----------------------------------------------------------------
// Daily-Market-Weekly shape: site × week, daily + market primary,
// contract laborers surfaced as informational inside per-day expansion.
// Mirrors WeeklyAggregateShape but pulls data from
// useDailyMarketWeekAggregate (daily+market only) and passes
// mode="daily-market-primary" to DayDetailExpansion.
// ----------------------------------------------------------------

function DailyMarketWeeklyShape({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "daily-market-weekly" }>;
}) {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useDailyMarketWeekAggregate(
    entity.siteId,
    entity.weekStart,
    entity.weekEnd
  );

  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);

  if (isError) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={140} />
      </Box>
    );
  }

  const days = data?.days ?? [];
  const holidays = data?.holidays ?? [];

  return (
    <Box sx={{ p: 2 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={SECTION_LABEL_SX}
      >
        Per-day daily + market attendance · {data?.totalLaborers ?? 0} laborers worked · tap a day for details
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 2,
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const dt = dayjs(entity.weekStart).add(i, "day").format("YYYY-MM-DD");
          const day = days.find((d) => d.date === dt);
          const holiday = holidays.find((h) => h.date === dt);
          const isExpanded = expandedDate === dt;
          const bg = day
            ? alpha(theme.palette.success.main, 0.12)
            : holiday
              ? alpha(theme.palette.info.main, 0.12)
              : "background.default";
          const borderColor = isExpanded
            ? theme.palette.primary.main
            : day
              ? theme.palette.success.main
              : holiday
                ? theme.palette.info.main
                : theme.palette.divider;
          return (
            <Box
              key={dt}
              role="button"
              tabIndex={0}
              aria-pressed={isExpanded}
              onClick={() =>
                setExpandedDate((prev) => (prev === dt ? null : dt))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedDate((prev) => (prev === dt ? null : dt));
                }
              }}
              sx={{
                p: 0.75,
                borderRadius: 1,
                textAlign: "center",
                bgcolor: bg,
                border: `${isExpanded ? 2 : 1}px solid ${borderColor}`,
                minHeight: 80,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "transform 80ms ease",
                "&:hover": { transform: "translateY(-1px)" },
                "&:focus-visible": {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 1,
                },
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontSize: 8.5,
                    color: "text.secondary",
                    textTransform: "uppercase",
                  }}
                >
                  {dayjs(dt).format("ddd")}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  {dayjs(dt).format("DD")}
                </Typography>
              </Box>
              {day ? (
                <Box>
                  <Typography
                    sx={{
                      fontSize: 8.5,
                      color: "success.dark",
                      fontWeight: 600,
                    }}
                  >
                    {day.laborersWorked} lab.
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 9,
                      color: "success.main",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ₹{day.totalEarnings.toLocaleString("en-IN")}
                  </Typography>
                </Box>
              ) : holiday ? (
                <Box>
                  <Typography
                    sx={{
                      fontSize: 8.5,
                      color: "info.dark",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                    }}
                  >
                    Holiday
                  </Typography>
                  {holiday.reason && (
                    <Typography
                      sx={{
                        fontSize: 8,
                        color: "info.dark",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {holiday.reason}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography sx={{ fontSize: 9, color: "text.disabled" }}>
                  —
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Expanded per-day breakdown — daily-market-primary mode pushes
          contract laborers into a de-emphasized informational section. */}
      {expandedDate && (
        <Box sx={{ mb: 2 }}>
          <DayDetailExpansion
            siteId={entity.siteId}
            subcontractId={null}
            date={expandedDate}
            holiday={holidays.find((h) => h.date === expandedDate)}
            mode="daily-market-primary"
          />
        </Box>
      )}

      <Box
        sx={{
          bgcolor: "background.paper",
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1.5,
          p: 1.25,
          fontSize: 12.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 0.5,
          }}
        >
          <span style={{ color: theme.palette.text.secondary }}>
            Worked this week (daily + market)
          </span>
          <span
            style={{
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data?.totalLaborers ?? 0} laborers
          </span>
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 0.5,
          }}
        >
          <span style={{ color: theme.palette.text.secondary }}>
            Total wages this week
          </span>
          <span
            style={{
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ₹{(data?.totalEarnings ?? 0).toLocaleString("en-IN")}
          </span>
        </Box>
      </Box>
    </Box>
  );
}

// ----------------------------------------------------------------
// Default export: branch by entity.kind
// ----------------------------------------------------------------

export default function AttendanceTab({ entity }: { entity: InspectEntity }) {
  if (entity.kind === "daily-date") return <DailyShape entity={entity} />;
  if (entity.kind === "weekly-week") return <WeeklyShape entity={entity} />;
  if (entity.kind === "weekly-aggregate")
    return <WeeklyAggregateShape entity={entity} />;
  if (entity.kind === "daily-market-weekly")
    return <DailyMarketWeeklyShape entity={entity} />;
  // 'advance' — Attendance tab is not surfaced for this kind by InspectPane.tsx
  return null;
}
