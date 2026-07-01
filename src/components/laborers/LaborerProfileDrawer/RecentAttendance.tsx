"use client";

import { Box, Skeleton, Tooltip, Typography } from "@mui/material";
import { formatCurrency } from "@/lib/formatters";
import type {
  LaborerProfileRecentDay,
  RecentAttendanceStatus,
} from "@/hooks/queries/useLaborerProfileSummary";
import { SectionTitle } from "./shared";

interface RecentAttendanceProps {
  recent: LaborerProfileRecentDay[];
  isLoading: boolean;
}

const STATUS_LABEL: Record<RecentAttendanceStatus, string> = {
  present: "Present",
  half: "Half day",
  contract: "Contract day",
  no_record: "No record",
  before_joining: "Before joining",
};

function statusColor(status: RecentAttendanceStatus): {
  bg: string;
  border: string;
} {
  switch (status) {
    case "present":
      return { bg: "success.main", border: "success.dark" };
    case "half":
      return { bg: "warning.light", border: "warning.main" };
    case "contract":
      return { bg: "info.main", border: "info.dark" };
    case "no_record":
      return { bg: "grey.300", border: "grey.400" };
    case "before_joining":
      return { bg: "transparent", border: "grey.300" };
  }
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function Dot({ day }: { day: LaborerProfileRecentDay }) {
  const c = statusColor(day.status);
  const tooltip = (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>
        {formatDateShort(day.date)} — {STATUS_LABEL[day.status]}
      </Typography>
      {day.siteName && (
        <Typography variant="caption" sx={{ display: "block" }}>
          {day.siteName}
        </Typography>
      )}
      {day.earnings > 0 && (
        <Typography variant="caption" sx={{ display: "block" }}>
          {formatCurrency(day.earnings)}
        </Typography>
      )}
    </Box>
  );

  return (
    <Tooltip title={tooltip} arrow placement="top">
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          bgcolor: c.bg,
          border: 1,
          borderColor: c.border,
          flexShrink: 0,
          cursor: "help",
        }}
        aria-label={`${formatDateShort(day.date)}: ${STATUS_LABEL[day.status]}`}
      />
    </Tooltip>
  );
}

export default function RecentAttendance({
  recent,
  isLoading,
}: RecentAttendanceProps) {
  return (
    <Box>
      <SectionTitle>Recent attendance (14 days)</SectionTitle>
      {isLoading ? (
        <Box sx={{ display: "flex", gap: 0.75, py: 0.5 }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="circular"
              width={18}
              height={18}
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Box>
      ) : recent.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No data yet.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "flex",
            gap: 0.75,
            py: 0.5,
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          {recent.map((day) => (
            <Dot key={day.date} day={day} />
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          flexWrap: "wrap",
          mt: 0.5,
          fontSize: 11,
          color: "text.secondary",
        }}
      >
        <LegendDot color="success.main" label="Present" />
        <LegendDot color="warning.light" label="Half" />
        <LegendDot color="info.main" label="Company" />
        <LegendDot color="grey.300" label="No record" />
      </Box>
    </Box>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: color,
        }}
      />
      <Typography variant="caption">{label}</Typography>
    </Box>
  );
}
