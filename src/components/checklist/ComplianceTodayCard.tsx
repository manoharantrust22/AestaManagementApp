"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { FactCheck, ChevronRight } from "@mui/icons-material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useCompanyCompliance } from "@/hooks/queries/useChecklistCompliance";
import { DONE_STATUSES, todayISO } from "@/types/checklist.types";

/**
 * Compact "today's compliance" summary for the company dashboard.
 * Links through to the full /company/compliance overview.
 */
export default function ComplianceTodayCard() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const companyId = selectedSite?.company_id ?? undefined;
  const today = todayISO();

  const { data: rows = [], isLoading } = useCompanyCompliance({
    companyId,
    startDate: today,
    endDate: today,
  });

  const summary = useMemo(() => {
    const subj = new Map<string, { total: number; done: number }>();
    for (const r of rows) {
      const key = `${r.user_id}:${r.site_id ?? "u"}`;
      const e = subj.get(key) ?? { total: 0, done: 0 };
      e.total += 1;
      if (DONE_STATUSES.includes(r.status)) e.done += 1;
      subj.set(key, e);
    }
    const subjects = [...subj.values()];
    return {
      people: subjects.length,
      fullyDone: subjects.filter((s) => s.done === s.total && s.total > 0).length,
      missed: rows.filter((r) => r.status === "missed").length,
      deferred: rows.filter((r) => r.status === "deferred_pending").length,
    };
  }, [rows]);

  if (!companyId) return null;

  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => router.push("/company/compliance")}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <FactCheck color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                Today&apos;s compliance
              </Typography>
            </Stack>
            <ChevronRight color="action" />
          </Stack>
          {isLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          ) : (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              <Chip
                size="small"
                color="success"
                label={`${summary.fullyDone}/${summary.people} fully done`}
              />
              <Chip
                size="small"
                color={summary.missed ? "error" : "default"}
                variant={summary.missed ? "filled" : "outlined"}
                label={`${summary.missed} missed`}
              />
              {summary.deferred > 0 && (
                <Chip size="small" color="info" label={`${summary.deferred} deferred`} />
              )}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
