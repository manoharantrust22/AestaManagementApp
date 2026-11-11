"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import {
  currentSalary,
  useDeleteStaffPayment,
  useSalaryProfiles,
  useSetMonthlySalary,
  useStaffMembers,
  useStaffPayments,
} from "@/hooks/queries/useStaffPay";
import RecordStaffPaymentDialog from "@/components/staff-pay/RecordStaffPaymentDialog";
import { formatCurrencyFull } from "@/lib/formatters";
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL, type StaffMember, type StaffPayment } from "@/types/staff-pay.types";

function fyStart(): string {
  // Indian financial year: 1 April
  const now = dayjs();
  const y = now.month() >= 3 ? now.year() : now.year() - 1;
  return `${y}-04-01`;
}

export default function StaffPayPage() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";
  const { data: staff = [], isLoading: staffLoading } = useStaffMembers();
  const { data: payments = [], isLoading: payLoading } = useStaffPayments(null, { withAllocations: true, from: fyStart() });
  const { data: profiles = [] } = useSalaryProfiles(null);
  const del = useDeleteStaffPayment();
  const setSalary = useSetMonthlySalary();

  const [recordFor, setRecordFor] = useState<{ id: string | null; amount: number | null } | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [salaryEdit, setSalaryEdit] = useState<{ member: StaffMember; value: string; from: string } | null>(null);

  const today = dayjs().format("YYYY-MM-DD");
  const thisMonth = dayjs().format("YYYY-MM");

  const summary = useMemo(() => {
    return staff.map((m) => {
      const mine = payments.filter((p) => p.staff_user_id === m.id);
      const ytd = mine.reduce((a, p) => a + p.amount, 0);
      const extras = mine.filter((p) => p.payment_type === "bonus" || p.payment_type === "incentive").reduce((a, p) => a + p.amount, 0);
      const salaryThisMonth = mine
        .filter((p) => p.payment_type === "salary" && (p.period_month ?? p.paid_on).startsWith(thisMonth))
        .reduce((a, p) => a + p.amount, 0);
      const lastMonth = dayjs().subtract(1, "month").format("YYYY-MM");
      const salaryLastMonth = mine
        .filter((p) => p.payment_type === "salary" && (p.period_month ?? p.paid_on).startsWith(lastMonth))
        .reduce((a, p) => a + p.amount, 0);
      return { m, ytd, extras, salaryThisMonth, salaryLastMonth, monthly: currentSalary(profiles, m.id, today), count: mine.length };
    });
  }, [staff, payments, profiles, thisMonth, today]);

  if (userProfile && !isAdmin) {
    return <Alert severity="warning">Only admins can view staff pay.</Alert>;
  }

  const selectedPayments: StaffPayment[] = selected ? payments.filter((p) => p.staff_user_id === selected.id) : [];

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", pb: 6 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, flex: 1 }}>
          Staff pay
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecordFor({ id: null, amount: null })}>
          Record payment
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Salary, incentives and bonuses for staff — this financial year (from {dayjs(fyStart()).format("D MMM YYYY")}). Private to admins; each person sees only their own pay.
      </Typography>

      {staffLoading || payLoading ? (
        <Stack spacing={1}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" height={110} />
          ))}
        </Stack>
      ) : staff.length === 0 ? (
        <Alert severity="info">No site engineers or office staff found.</Alert>
      ) : (
        <Stack spacing={1.25}>
          {summary.map(({ m, ytd, extras, salaryThisMonth, salaryLastMonth, monthly }) => (
            <Card key={m.id} variant="outlined">
              <CardActionArea onClick={() => setSelected(m)}>
                <CardContent sx={{ pb: "12px !important" }}>
                  <Stack direction="row" alignItems="baseline" spacing={1}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                      {m.name}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {formatCurrencyFull(ytd)}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Paid this FY · {m.role === "site_engineer" ? "Site engineer" : "Office"} · {m.assigned_sites?.length ?? 0} site(s)
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    <Chip size="small" label={monthly != null ? `Salary ${formatCurrencyFull(monthly)}/mo` : "Salary not set"} variant="outlined" />
                    {monthly != null && (
                      <Chip
                        size="small"
                        color={salaryLastMonth >= monthly ? "success" : "warning"}
                        label={`${dayjs().subtract(1, "month").format("MMM")}: ${formatCurrencyFull(salaryLastMonth)}`}
                      />
                    )}
                    {salaryThisMonth > 0 && <Chip size="small" label={`${dayjs().format("MMM")}: ${formatCurrencyFull(salaryThisMonth)}`} />}
                    {extras > 0 && <Chip size="small" color="secondary" label={`Bonus/Incentive ${formatCurrencyFull(extras)}`} />}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}

      {/* Per-person detail */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <Box sx={{ flex: 1 }}>{selected?.name}</Box>
          <IconButton
            aria-label="Set monthly salary"
            onClick={() =>
              selected &&
              setSalaryEdit({
                member: selected,
                value: String(currentSalary(profiles, selected.id, today) ?? ""),
                from: dayjs().startOf("month").format("YYYY-MM-DD"),
              })
            }
          >
            <EditIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedPayments.length === 0 ? (
            <Typography color="text.secondary">No payments this financial year.</Typography>
          ) : (
            <Stack divider={<Divider />} spacing={1}>
              {selectedPayments.map((p) => (
                <Box key={p.id}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {PAYMENT_TYPE_LABEL[p.payment_type]}
                        {p.period_month ? ` · ${dayjs(p.period_month).format("MMM YYYY")}` : ""} — {formatCurrencyFull(p.amount)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {dayjs(p.paid_on).format("DD MMM YYYY")} · {PAYMENT_MODE_LABEL[p.payment_mode]}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </Typography>
                      {!!p.allocations?.length && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {p.allocations.map((a) => `${a.site?.name ?? "Site"} ${formatCurrencyFull(Number(a.amount))}`).join(" · ")}
                        </Typography>
                      )}
                      {p.allocation_mode === "none" && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          Company overhead
                        </Typography>
                      )}
                    </Box>
                    <IconButton
                      aria-label="Delete payment"
                      size="small"
                      disabled={del.isPending}
                      onClick={() => {
                        if (window.confirm("Delete this payment record?")) del.mutate(p.id);
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              if (!selected) return;
              setRecordFor({ id: selected.id, amount: currentSalary(profiles, selected.id, today) });
            }}
          >
            Record payment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Monthly salary editor */}
      <Dialog open={!!salaryEdit} onClose={() => setSalaryEdit(null)} fullWidth maxWidth="xs">
        <DialogTitle>Monthly salary — {salaryEdit?.member.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Monthly salary (₹)"
              type="number"
              value={salaryEdit?.value ?? ""}
              onChange={(e) => setSalaryEdit((s) => (s ? { ...s, value: e.target.value } : s))}
              fullWidth
            />
            <TextField
              label="Effective from"
              type="date"
              value={salaryEdit?.from ?? ""}
              onChange={(e) => setSalaryEdit((s) => (s ? { ...s, from: e.target.value } : s))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            {setSalary.error && <Alert severity="error">{(setSalary.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSalaryEdit(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={setSalary.isPending || !(Number(salaryEdit?.value) >= 0) || !salaryEdit?.value}
            onClick={async () => {
              if (!salaryEdit) return;
              await setSalary.mutateAsync({
                staff_user_id: salaryEdit.member.id,
                monthly_salary: Number(salaryEdit.value),
                effective_from: salaryEdit.from,
              });
              setSalaryEdit(null);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <RecordStaffPaymentDialog
        open={!!recordFor}
        onClose={() => setRecordFor(null)}
        staff={staff}
        defaultStaffId={recordFor?.id ?? null}
        defaultAmount={recordFor?.amount ?? null}
      />
    </Box>
  );
}
