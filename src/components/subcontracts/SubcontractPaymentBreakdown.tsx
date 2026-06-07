"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  LinearProgress,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Payment as PaymentIcon,
  LocalCafe as TeaIcon,
  Receipt as ExpenseIcon,
  Inventory2 as MaterialIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import dayjs from "dayjs";

interface SubcontractPaymentBreakdownProps {
  subcontractId: string;
  totalValue: number;
}

interface PaymentCategory {
  name: string;
  icon: React.ReactNode;
  color: string;
  items: PaymentItem[];
  total: number;
}

interface PaymentItem {
  id: string;
  date: string;
  amount: number;
  description: string;
  payment_mode?: string;
}

export default function SubcontractPaymentBreakdown({
  subcontractId,
  totalValue,
}: SubcontractPaymentBreakdownProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    fetchPaymentBreakdown();
  }, [subcontractId]);

  const fetchPaymentBreakdown = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch subcontract payments (salary advances, part payments, milestones)
      // Filter out deleted payments
      const { data: payments, error: paymentsError } = await supabase
        .from("subcontract_payments")
        .select("*")
        .eq("contract_id", subcontractId)
        .eq("is_deleted", false)
        .order("payment_date", { ascending: false });

      if (paymentsError) throw paymentsError;

      // Fetch linked tea shop settlements (exclude cancelled)
      const { data: teaSettlements, error: teaError } = await supabase
        .from("tea_shop_settlements")
        .select("*, tea_shop_accounts(shop_name)")
        .eq("subcontract_id", subcontractId)
        .eq("is_cancelled", false)
        .order("payment_date", { ascending: false });

      if (teaError) throw teaError;

      // Fetch linked expenses - only count cleared expenses (pending ones don't count toward paid amount)
      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("*, expense_categories(name)")
        .eq("contract_id", subcontractId)
        .eq("is_cleared", true)
        .order("date", { ascending: false });

      if (expensesError) throw expensesError;

      // Fetch linked material purchases — only paid rows count toward the
      // contract spend. Amount basis matches v_all_expenses (amount_paid, else
      // total_amount); the .or() mirrors the view's inclusion rule (own_site
      // always; group_stock only once it carries a settlement_reference) so this
      // breakdown can't exceed the headline total.
      const { data: materials, error: materialsError } = await supabase
        .from("material_purchase_expenses")
        .select("id, ref_code, vendor_name, amount_paid, total_amount, payment_mode, settlement_date, paid_date, purchase_date")
        .eq("subcontract_id", subcontractId)
        .eq("is_paid", true)
        .or("purchase_type.neq.group_stock,settlement_reference.not.is.null")
        .order("settlement_date", { ascending: false });

      if (materialsError) throw materialsError;

      // Group subcontract payments by type
      const paymentsByType: Record<string, PaymentItem[]> = {
        weekly_advance: [],
        part_payment: [],
        milestone: [],
        final_settlement: [],
      };

      (payments || []).forEach((p: any) => {
        const item: PaymentItem = {
          id: p.id,
          date: p.payment_date,
          amount: p.amount,
          description: p.notes || `${p.payment_type} payment`,
          payment_mode: p.payment_mode,
        };
        if (paymentsByType[p.payment_type]) {
          paymentsByType[p.payment_type].push(item);
        }
      });

      // Build categories
      const categoryList: PaymentCategory[] = [];

      // Weekly Advances
      if (paymentsByType.weekly_advance.length > 0) {
        categoryList.push({
          name: "Weekly Advances",
          icon: <PaymentIcon fontSize="small" />,
          color: "primary.main",
          items: paymentsByType.weekly_advance,
          total: paymentsByType.weekly_advance.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      // Part Payments
      if (paymentsByType.part_payment.length > 0) {
        categoryList.push({
          name: "Part Payments",
          icon: <PaymentIcon fontSize="small" />,
          color: "success.main",
          items: paymentsByType.part_payment,
          total: paymentsByType.part_payment.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      // Milestone Payments
      if (paymentsByType.milestone.length > 0) {
        categoryList.push({
          name: "Milestone Payments",
          icon: <PaymentIcon fontSize="small" />,
          color: "info.main",
          items: paymentsByType.milestone,
          total: paymentsByType.milestone.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      // Final Settlements
      if (paymentsByType.final_settlement.length > 0) {
        categoryList.push({
          name: "Final Settlements",
          icon: <PaymentIcon fontSize="small" />,
          color: "warning.main",
          items: paymentsByType.final_settlement,
          total: paymentsByType.final_settlement.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      // Tea Shop Expenses
      if ((teaSettlements || []).length > 0) {
        const teaItems: PaymentItem[] = (teaSettlements || []).map((t: any) => ({
          id: t.id,
          date: t.payment_date,
          amount: t.amount_paid,
          description: t.tea_shop_accounts?.shop_name || "Tea Shop",
          payment_mode: t.payment_mode,
        }));
        categoryList.push({
          name: "Tea/Snacks",
          icon: <TeaIcon fontSize="small" />,
          color: "secondary.main",
          items: teaItems,
          total: teaItems.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      // Other Expenses
      if ((expenses || []).length > 0) {
        const expenseItems: PaymentItem[] = (expenses || []).map((e: any) => ({
          id: e.id,
          date: e.date,
          amount: e.amount,
          description: e.description || e.expense_categories?.name || "Expense",
          payment_mode: e.payment_mode,
        }));
        categoryList.push({
          name: "Other Expenses",
          icon: <ExpenseIcon fontSize="small" />,
          color: "error.main",
          items: expenseItems,
          total: expenseItems.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      // Materials bought under this subcontract
      if ((materials || []).length > 0) {
        const materialItems: PaymentItem[] = (materials || []).map((m: any) => ({
          id: m.id,
          date: m.settlement_date || m.paid_date || m.purchase_date,
          amount: Number(m.amount_paid ?? m.total_amount) || 0,
          description: m.vendor_name
            ? `${m.vendor_name}${m.ref_code ? ` (${m.ref_code})` : ""}`
            : m.ref_code || "Material purchase",
          payment_mode: m.payment_mode,
        }));
        categoryList.push({
          name: "Materials",
          icon: <MaterialIcon fontSize="small" />,
          color: "warning.dark",
          items: materialItems,
          total: materialItems.reduce((sum, i) => sum + i.amount, 0),
        });
      }

      setCategories(categoryList);
      setTotalPaid(categoryList.reduce((sum, c) => sum + c.total, 0));
    } catch (err: any) {
      console.error("Error fetching payment breakdown:", err);
      setError(err.message || "Failed to load payment breakdown");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  const balanceDue = totalValue - totalPaid;
  const progressPercent = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0;

  return (
    <Box sx={{ p: 2, bgcolor: "action.hover" }}>
      {/* Summary Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          PAYMENT BREAKDOWN
        </Typography>

        <Box sx={{ display: "flex", gap: 4, mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Contract Value
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              ₹{totalValue.toLocaleString()}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Total Paid
            </Typography>
            <Typography variant="h6" fontWeight={600} color="success.main">
              ₹{totalPaid.toLocaleString()}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Balance Due
            </Typography>
            <Typography
              variant="h6"
              fontWeight={600}
              color={balanceDue > 0 ? "error.main" : "success.main"}
            >
              ₹{balanceDue.toLocaleString()}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(progressPercent, 100)}
            sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
          />
          <Typography variant="body2" fontWeight={600}>
            {progressPercent.toFixed(0)}%
          </Typography>
        </Box>
      </Paper>

      {/* Category Breakdown */}
      {categories.length === 0 ? (
        <Alert severity="info">No payments recorded for this subcontract yet.</Alert>
      ) : (
        <Box>
          {categories.map((category) => (
            <Accordion key={category.name} defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    pr: 2,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ color: category.color }}>{category.icon}</Box>
                    <Typography fontWeight={600}>{category.name}</Typography>
                    <Chip label={category.items.length} size="small" />
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography fontWeight={600} color={category.color}>
                      ₹{category.total.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({((category.total / totalPaid) * 100).toFixed(0)}% of paid)
                    </Typography>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="center">Mode</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {category.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {dayjs(item.date).format("DD MMM YYYY")}
                          </TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell align="center">
                            {item.payment_mode && (
                              <Chip
                                label={item.payment_mode}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={500}>
                              ₹{item.amount.toLocaleString()}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Box>
  );
}
