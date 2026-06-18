"use client";

import React, { useMemo } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import PageHeader from "@/components/layout/PageHeader";
import { useTaskWorkRateBook } from "@/hooks/queries/useTaskWorkProfitability";
import { buildRateBook } from "@/lib/taskWork/rateBook";
import { TASK_WORK_UNIT_LABEL } from "@/types/taskWork.types";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const rate = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function TaskWorkRateBookPage() {
  const { data: rows = [], isLoading } = useTaskWorkRateBook();
  const groups = useMemo(() => buildRateBook(rows), [rows]);

  return (
    <Box>
      <PageHeader
        title="Task Work Rate Book"
        subtitle="What you've actually paid per unit, by work type — price the next package from real history"
      />

      {isLoading ? (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Loading…
        </Typography>
      ) : groups.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No rate-based task-work packages yet. Once you create rate-based
          packages (₹ per sqft/rft/nos), their rates build up here automatically.
        </Alert>
      ) : (
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {groups.map((g) => (
            <Grid key={g.key} size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography variant="h6" fontWeight={700}>
                      {g.categoryName}
                    </Typography>
                    <Chip
                      size="small"
                      label={`per ${
                        g.unit === "unit"
                          ? "unit"
                          : TASK_WORK_UNIT_LABEL[g.unit] ?? g.unit
                      }`}
                    />
                  </Box>

                  <Grid container spacing={1.5} sx={{ mb: 1 }}>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Average
                      </Typography>
                      <Typography variant="h6" fontWeight={700} color="primary.main">
                        {rate(g.avgRate)}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Range
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {rate(g.minRate)} – {rate(g.maxRate)}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Packages
                      </Typography>
                      <Typography variant="h6" fontWeight={700}>
                        {g.count}
                      </Typography>
                    </Grid>
                  </Grid>

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Package</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {g.rows.map((r) => (
                        <TableRow key={r.package_id}>
                          <TableCell>{r.title}</TableCell>
                          <TableCell align="right">{r.total_units ?? "—"}</TableCell>
                          <TableCell align="right">{inr(r.total_value)}</TableCell>
                          <TableCell align="right">
                            {r.computed_rate_per_unit != null
                              ? rate(r.computed_rate_per_unit)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
