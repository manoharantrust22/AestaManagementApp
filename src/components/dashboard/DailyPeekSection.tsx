"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Today as TodayIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Refresh as RefreshIcon,
  CalendarMonth as CalendarIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { Dayjs } from "dayjs";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import { useCompanyDailyPeek } from "@/hooks/queries/useCompanyDailyPeek";
import SitePeekCard from "./SitePeekCard";
import SitePeekModal from "./SitePeekModal";

export default function DailyPeekSection() {
  const { selectedCompany } = useSelectedCompany();
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const dateStr = useMemo(() => date.format("YYYY-MM-DD"), [date]);
  const isToday = date.isSame(dayjs(), "day");

  const { data, isLoading, error, refetch, isFetching } = useCompanyDailyPeek(
    selectedCompany?.id ?? null,
    dateStr,
  );

  const sites = data ?? [];
  const selectedSite = useMemo(
    () => (selectedSiteId ? sites.find((s) => s.siteId === selectedSiteId) ?? null : null),
    [sites, selectedSiteId],
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        {/* Header */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <TodayIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>
              {isToday ? "Today" : dayjs(date).format("DD MMM YYYY")} across all sites
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton
              size="small"
              onClick={() => setDate((d) => d.subtract(1, "day"))}
              aria-label="Previous day"
            >
              <PrevIcon />
            </IconButton>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{
                px: 1.5,
                py: 0.5,
                bgcolor: isToday ? "primary.50" : "grey.100",
                color: isToday ? "primary.dark" : "text.primary",
                borderRadius: 2,
                minWidth: 120,
                textAlign: "center",
              }}
            >
              {isToday ? `Today · ${date.format("DD MMM")}` : date.format("DD MMM YYYY")}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setDate((d) => d.add(1, "day"))}
              disabled={isToday}
              aria-label="Next day"
            >
              <NextIcon />
            </IconButton>
            <Tooltip title="Pick a date">
              <IconButton size="small" onClick={() => setPickerOpen(true)} aria-label="Pick date">
                <CalendarIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <span>
                <IconButton
                  size="small"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  aria-label="Refresh"
                >
                  <RefreshIcon sx={{ animation: isFetching ? "spin 1s linear infinite" : "none", "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } }} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Hidden DatePicker that opens via calendar button */}
        <DatePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          value={date}
          onChange={(v) => v && setDate(v)}
          maxDate={dayjs()}
          slotProps={{ textField: { sx: { display: "none" } } }}
        />

        {/* Body */}
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            Failed to load daily peek: {(error as Error).message}
          </Alert>
        )}

        {isLoading ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 1.5,
            }}
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={170} />
            ))}
          </Box>
        ) : sites.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No active sites. Add one under{" "}
              <Box component="span" fontWeight={600}>
                Company → Sites
              </Box>
              .
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 1.5,
            }}
          >
            {sites.map((site) => (
              <SitePeekCard
                key={site.siteId}
                site={site}
                onClick={() => setSelectedSiteId(site.siteId)}
              />
            ))}
          </Box>
        )}
      </Paper>

      <SitePeekModal
        open={Boolean(selectedSite)}
        site={selectedSite}
        date={dateStr}
        onClose={() => setSelectedSiteId(null)}
      />
    </LocalizationProvider>
  );
}
