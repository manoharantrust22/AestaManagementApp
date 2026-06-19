"use client";

import { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { formatCurrency } from "@/lib/formatters";
import { useMesthriCommissionSummary } from "@/hooks/queries/useMesthriCommissionSummary";

interface MesthriCommissionReportProps {
  open: boolean;
  onClose: () => void;
}

const ALL_TIME_FROM = "2020-01-01";
const ALL_TIME_TO = "2035-12-31";

/**
 * Project-wide rollup of the (estimated) mesthri commission for a chosen month
 * (or all time). For each mesthri: own salary + commission collected from the
 * laborers they brought = total. Estimate / reporting only.
 */
export default function MesthriCommissionReport({
  open,
  onClose,
}: MesthriCommissionReportProps) {
  const [mode, setMode] = useState<"month" | "all">("month");
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const [expanded, setExpanded] = useState<string | null>(null);

  const dateFrom =
    mode === "all" ? ALL_TIME_FROM : month.format("YYYY-MM-DD");
  const dateTo =
    mode === "all"
      ? ALL_TIME_TO
      : month.endOf("month").format("YYYY-MM-DD");

  const { data, isLoading, isError } = useMesthriCommissionSummary(
    dateFrom,
    dateTo,
    null,
    open,
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <Box>
          Mesthri commissions
          <Typography variant="caption" color="text.secondary" display="block">
            Estimated cut passed up by each crew (₹/day × days). Reporting only.
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Period control */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mb: 2,
            flexWrap: "wrap",
          }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_e, v) => v && setMode(v)}
          >
            <ToggleButton value="month" sx={{ textTransform: "none" }}>
              Month
            </ToggleButton>
            <ToggleButton value="all" sx={{ textTransform: "none" }}>
              All time
            </ToggleButton>
          </ToggleButtonGroup>

          {mode === "month" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <IconButton
                size="small"
                onClick={() => setMonth((m) => m.subtract(1, "month"))}
                aria-label="Previous month"
              >
                <PrevIcon fontSize="small" />
              </IconButton>
              <Typography variant="subtitle2" sx={{ minWidth: 110, textAlign: "center" }}>
                {month.format("MMMM YYYY")}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setMonth((m) => m.add(1, "month"))}
                aria-label="Next month"
              >
                <NextIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Box>

        {/* Grand total */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Total commission to mesthris
          </Typography>
          <Typography variant="h6" fontWeight={700} color="primary.main">
            {isLoading ? "…" : formatCurrency(data?.grandTotalCommission ?? 0)}
          </Typography>
        </Paper>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : isError ? (
          <Typography color="error" variant="body2">
            Couldn&apos;t load the commission report.
          </Typography>
        ) : !data || data.mesthris.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No commissions in this period.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {data.mesthris.map((m) => {
              const isOpen = expanded === m.mesthriKey;
              return (
                <Paper key={m.mesthriKey} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Box
                    onClick={() =>
                      setExpanded(isOpen ? null : m.mesthriKey)
                    }
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                      px: 1.5,
                      py: 1,
                      cursor: "pointer",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>
                        {m.mesthriName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {m.laborers.length}{" "}
                        {m.laborers.length === 1 ? "laborer" : "laborers"}
                        {" · own "}
                        {formatCurrency(m.ownSalary)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={`+${formatCurrency(m.commissionCollected)}`}
                      />
                      <ExpandMoreIcon
                        fontSize="small"
                        sx={{
                          transform: isOpen ? "rotate(180deg)" : "none",
                          transition: "transform 150ms",
                          color: "text.secondary",
                        }}
                      />
                    </Box>
                  </Box>
                  <Collapse in={isOpen} unmountOnExit>
                    <Box sx={{ px: 1.5, pb: 1.5 }}>
                      <Stack spacing={0.5}>
                        {m.laborers.map((l) => (
                          <Box
                            key={l.laborerId}
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 1,
                            }}
                          >
                            <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
                              {l.laborerName} · {l.days}d × ₹{l.rate}
                            </Typography>
                            <Typography variant="caption" fontWeight={600}>
                              {formatCurrency(l.commissionEst)}
                            </Typography>
                          </Box>
                        ))}
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 1,
                            mt: 0.5,
                            pt: 0.5,
                            borderTop: 1,
                            borderColor: "divider",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Total earned (own + commission)
                          </Typography>
                          <Typography
                            variant="caption"
                            fontWeight={700}
                            color="success.main"
                          >
                            {formatCurrency(m.total)}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  </Collapse>
                </Paper>
              );
            })}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
