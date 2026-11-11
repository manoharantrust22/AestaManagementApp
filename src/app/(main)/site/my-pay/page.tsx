"use client";

import { useMemo } from "react";
import { Box, Card, CardContent, Divider, Skeleton, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { currentSalary, useSalaryProfiles, useStaffPayments } from "@/hooks/queries/useStaffPay";
import { formatCurrencyFull } from "@/lib/formatters";
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL } from "@/types/staff-pay.types";

/** A staff member's own pay history. RLS returns only their rows. */
export default function MyPayPage() {
  const { userProfile } = useAuth();
  const me = userProfile?.id ?? null;
  const { data: payments = [], isLoading } = useStaffPayments(me);
  const { data: profiles = [] } = useSalaryProfiles(me);

  const stats = useMemo(() => {
    const yearStart = dayjs().month() >= 3 ? `${dayjs().year()}-04-01` : `${dayjs().year() - 1}-04-01`;
    const fy = payments.filter((p) => p.paid_on >= yearStart);
    return {
      total: payments.reduce((a, p) => a + p.amount, 0),
      fy: fy.reduce((a, p) => a + p.amount, 0),
      extras: fy.filter((p) => p.payment_type === "bonus" || p.payment_type === "incentive").reduce((a, p) => a + p.amount, 0),
    };
  }, [payments]);

  const monthly = me ? currentSalary(profiles, me, dayjs().format("YYYY-MM-DD")) : null;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto", pb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
        My pay
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Only you and the admin can see this page.
      </Typography>

      <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
        {[
          { label: "This financial year", value: stats.fy },
          { label: "Bonus & incentives (FY)", value: stats.extras },
          { label: "Monthly salary", value: monthly },
        ].map((t) => (
          <Card key={t.label} variant="outlined" sx={{ flex: 1 }}>
            <CardContent sx={{ p: 1.5, pb: "12px !important" }}>
              <Typography variant="caption" color="text.secondary" component="div">
                {t.label}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t.value == null ? "—" : formatCurrencyFull(t.value)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Card variant="outlined">
        <CardContent>
          {isLoading ? (
            <Skeleton variant="rounded" height={120} />
          ) : payments.length === 0 ? (
            <Typography color="text.secondary">No payments recorded yet.</Typography>
          ) : (
            <Stack divider={<Divider />} spacing={1}>
              {payments.map((p) => (
                <Stack key={p.id} direction="row" alignItems="baseline" spacing={1}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {PAYMENT_TYPE_LABEL[p.payment_type]}
                      {p.period_month ? ` · ${dayjs(p.period_month).format("MMM YYYY")}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(p.paid_on).format("DD MMM YYYY")} · {PAYMENT_MODE_LABEL[p.payment_mode]}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrencyFull(p.amount)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
          {payments.length > 0 && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
              All time: {formatCurrencyFull(stats.total)}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
